# 云端槽位版本化（C2）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为云同步的 9 个数据集合引入独立版本号（`_rev`），让冲突弹窗只对"双方都改过且内容不同"的集合出现，并支持逐槽位合并保留双方改动。

**Architecture:** `exportData()` 的 payload 增加 `_rev` 槽位版本表；`saveToLocalStorage` 逐槽位检测变更并 bump rev；新增纯函数 `cloudSlotPlan` 计算每槽位动作（align/upload/adopt-cloud/conflict）；store.js 同步引擎统一为 `performSyncDecision`，App.vue 冲突弹窗改为逐槽位三选。传输层（cloudStore.js/REST/RLS）零改动。

**Tech Stack:** Vue3 `<script setup>`、Vite、Vitest（TDD）。

**Spec:** `docs/superpowers/specs/2026-09-26-cloud-slot-versioning-design.md`

## Global Constraints

- 9 个槽位键：`items`、`calc`、`finance.records`、`finance.loans`、`transfers`、`rushcar.entries`、`rushcar.forwarderInfos`、`rushcar.mattelSiteInfos`、`rushcar.paymentCards`
- `_rev` 结构：`{ "items": { rev: 3, at: "ISO" }, ... }`（rev 为数字；缺失按 0）
- 同步基线 `state.cloudStatus.cloudRev`：`{ slot: number }`，随 `ysp_ui` 持久化
- `silent` 模式遇 `adopt-cloud`/`conflict` 槽位 → **整轮跳过同步**（绝不静默覆盖本地，延续 2026-08-28 事故教训）
- 传输层 / RLS / `car` 行 / 手机页 `ysp-remote.html` / localStorage key：**零改动**
- 工作区已有未提交改动（30s 周期修复、800ms silent 上行、双标签页提示），本计划在其之上开发，不得回退
- 全量测试命令：`npm test`；构建：`npm run build`

---

### Task 1: `cloudSlotPlan` 纯函数模块

**Files:**
- Create: `src/data/cloudSlotPlan.js`
- Test: `src/data/cloudSlotPlan.test.js`

**Interfaces:**
- Consumes: 无（自洽纯模块，`serialize` 注入）
- Produces:
  - `export const SLOT_KEYS` — 上述 9 槽位数组
  - `export const SLOT_LABELS` = `{ items:'商品', calc:'财务结算', 'finance.records':'收支记录', 'finance.loans':'借贷记录', transfers:'转运记录', 'rushcar.entries':'美淘记录', 'rushcar.forwarderInfos':'转运公司', 'rushcar.mattelSiteInfos':'美泰站点', 'rushcar.paymentCards':'支付卡' }`
  - `export function slotValue(payload, slot)` — 返回该槽位取值（缺省 `items`=[]、`calc`={}、其余=[]）
  - `export function setSlotValue(payload, slot, value)` — 原地写回（注意 `finance.*`/`rushcar.*` 的深层路径）
  - `export function revOf(payload, slot)` → `Number(payload?._rev?.[slot]?.rev) || 0`
  - `export function normalizeRev(raw)` → `{ [slot]: { rev, at } }`（丢弃非法 rev 槽位）
  - `export function computeSlotPlan(localPayload, cloudPayload, baselineRev, serialize)` → `{ [slot]: 'align'|'upload'|'adopt-cloud'|'conflict' }`
  - `export function buildMerged(localPayload, cloudPayload, plan, decisions)` → 合并后完整 payload（含 `_rev`、`updatedAt`）

- [ ] **Step 1: 写失败测试** (`src/data/cloudSlotPlan.test.js`)

```js
import { describe, expect, it } from 'vitest'
import {
  SLOT_KEYS, SLOT_LABELS, slotValue, setSlotValue, revOf, normalizeRev,
  computeSlotPlan, buildMerged,
} from './cloudSlotPlan'

const ser = (v) => JSON.stringify(v)

function p(items = [], calc = { debt: 0 }, rev = {}) {
  return { items, calc, finance: { records: [], loans: [] }, transfers: [], rushcar: {}, _rev: rev }
}

describe('SLOT_KEYS / slotValue / setSlotValue', () => {
  it('共 9 槽位且值默认空', () => {
    expect(SLOT_KEYS).toHaveLength(9)
    const pay = p()
    for (const s of SLOT_KEYS) {
      expect(Array.isArray(slotValue(pay, s)) || typeof slotValue(pay, s) === 'object').toBe(true)
    }
  })
  it('setSlotValue 写回 items 与 finance.records 深层路径', () => {
    const pay = p()
    setSlotValue(pay, 'items', [{ id: 1 }])
    setSlotValue(pay, 'finance.records', [{ id: 9 }])
    expect(slotValue(pay, 'items')).toEqual([{ id: 1 }])
    expect(pay.finance.records).toEqual([{ id: 9 }])
  })
})

describe('revOf / normalizeRev', () => {
  it('缺失或非法 rev 按 0', () => {
    expect(revOf(p(), 'items')).toBe(0)
    expect(revOf(p([], {}, { items: { rev: 'x', at: '' } }), 'items')).toBe(0)
  })
  it('normalizeRev 保留合法槽位丢弃非法', () => {
    const n = normalizeRev({ items: { rev: 3, at: 't' }, calc: { rev: 0, at: '' }, bad: { rev: 'x' } })
    expect(n.items).toEqual({ rev: 3, at: 't' })
    expect(n.calc).toEqual({ rev: 0, at: '' })
    expect(n.bad).toBeUndefined()
  })
})

describe('computeSlotPlan', () => {
  const L = p([{ id: 1, name: 'local' }], { debt: 0 }, { items: { rev: 2, at: '' }, calc: { rev: 1, at: '' } })
  const C = p([{ id: 1, name: 'cloud' }], { debt: 0 }, { items: { rev: 5, at: '' }, calc: { rev: 1, at: '' } })

  it('内容一致 → align（即使 rev 不同）', () => {
    const a = p([{ id: 1 }], { debt: 0 }, { items: { rev: 3, at: '' } })
    const b = p([{ id: 1 }], { debt: 0 }, { items: { rev: 7, at: '' } })
    expect(computeSlotPlan(a, b, {}, ser).items).toBe('align')
  })
  it('仅本地越基线 → upload', () => {
    expect(computeSlotPlan(L, p([], {}, {}), { items: 1 }, ser).items).toBe('upload')
  })
  it('仅云端越基线 → adopt-cloud', () => {
    expect(computeSlotPlan(p(), C, { items: 1 }, ser).items).toBe('adopt-cloud')
  })
  it('双方越基线且内容不同 → conflict', () => {
    expect(computeSlotPlan(L, C, { items: 1 }, ser).items).toBe('conflict')
  })
  it('rev 皆未越基线但内容不同 → 保守 conflict', () => {
    expect(computeSlotPlan(L, C, { items: 2 }, ser).items).toBe('conflict')
  })
  it('9 槽位全部产出', () => {
    const plan = computeSlotPlan(L, C, { items: 1 }, ser)
    for (const s of SLOT_KEYS) expect(plan[s]).toBeDefined()
  })
})

describe('buildMerged', () => {
  it('upload 槽取本地、adopt 槽取云端、conflict 按决策取', () => {
    const L = p([{ id: 1, n: 'A' }], { debt: 0 }, { items: { rev: 2, at: '' }, calc: { rev: 1, at: '' }, transfers: { rev: 1, at: '' } })
    const C = p([{ id: 1, n: 'C' }], { debt: 0 }, { items: { rev: 5, at: '' }, calc: { rev: 1, at: '' }, transfers: { rev: 5, at: '' } })
    const plan = computeSlotPlan(L, C, { items: 1, transfers: 1 }, ser)
    // 期望：items=conflict, calc=align, transfers=adopt-cloud（仅云端越基线）
    expect(plan.items).toBe('conflict')
    expect(plan.calc).toBe('align')
    expect(plan.transfers).toBe('adopt-cloud')

    const merged = buildMerged(L, C, plan, { items: 'local' })
    expect(merged.items[0].n).toBe('A') // conflict→local
    expect(merged._rev.items.rev).toBe(2)
    expect(merged.transfers).toEqual([{ id: 9 }]) // adopt→cloud
    expect(merged._rev.transfers.rev).toBe(5)
    expect(merged.calc).toEqual({ debt: 0 }) // align
  })

  it('adopt 槽显式决策 local 时保本地内容与 rev', () => {
    const L = p([], { debt: 0 }, { items: { rev: 1, at: '' }, transfers: { rev: 1, at: '' } })
    const C = p([] , { debt: 0 }, { transfers: { rev: 5, at: '' } })
    const plan = computeSlotPlan(L, C, { items: 1, transfers: 1 }, ser)
    expect(plan.transfers).toBe('adopt-cloud')
    const merged = buildMerged(L, C, plan, { transfers: 'local' })
    expect(merged.transfers).toEqual([])
    expect(merged._rev.transfers.rev).toBe(1)
  })
})
```

- [ ] **Step 2: 运行确认失败** — `npx vitest run src/data/cloudSlotPlan.test.js`，期望 FAIL（模块不存在）

- [ ] **Step 3: 实现 `src/data/cloudSlotPlan.js`**

```js
// 云同步槽位版本化纯函数：9 个数据集合的取值/版本/合并，与 DOM 与同步协议解耦
export const SLOT_KEYS = [
  'items', 'calc', 'finance.records', 'finance.loans', 'transfers',
  'rushcar.entries', 'rushcar.forwarderInfos', 'rushcar.mattelSiteInfos', 'rushcar.paymentCards',
]

export const SLOT_LABELS = {
  items: '商品', calc: '财务结算', 'finance.records': '收支记录', 'finance.loans': '借贷记录',
  transfers: '转运记录', 'rushcar.entries': '美淘记录', 'rushcar.forwarderInfos': '转运公司',
  'rushcar.mattelSiteInfos': '美泰站点', 'rushcar.paymentCards': '支付卡',
}

const SLOT_PATHS = {
  items: ['items'], calc: ['calc'], 'finance.records': ['finance', 'records'], 'finance.loans': ['finance', 'loans'],
  transfers: ['transfers'], 'rushcar.entries': ['rushcar', 'entries'],
  'rushcar.forwarderInfos': ['rushcar', 'forwarderInfos'],
  'rushcar.mattelSiteInfos': ['rushcar', 'mattelSiteInfos'], 'rushcar.paymentCards': ['rushcar', 'paymentCards'],
}

function emptyFor(slot) {
  return slot === 'calc' ? {} : []
}

export function slotValue(payload, slot) {
  if (!payload || typeof payload !== 'object') return emptyFor(slot)
  const path = SLOT_PATHS[slot] || []
  let cur = payload
  for (const k of path) cur = cur?.[k]
  return cur ?? emptyFor(slot)
}

export function setSlotValue(payload, slot, value) {
  const path = SLOT_PATHS[slot] || []
  let cur = payload
  for (let i = 0; i < path.length - 1; i++) {
    if (!cur[path[i]] || typeof cur[path[i]] !== 'object') cur[path[i]] = Array.isArray(value) ? [] : {}
    cur = cur[path[i]]
  }
  cur[path[path.length - 1]] = value
}

export function revOf(payload, slot) {
  const n = Number(payload?._rev?.[slot]?.rev)
  return Number.isFinite(n) && n >= 0 ? n : 0
}

export function normalizeRev(raw) {
  const out = {}
  const src = raw && typeof raw === 'object' ? raw : {}
  for (const slot of Object.keys(src)) {
    const entry = src[slot]
    if (!entry || typeof entry !== 'object') continue
    const rev = Number(entry.rev)
    if (!Number.isFinite(rev) || rev < 0) continue
    out[slot] = { rev, at: typeof entry.at === 'string' ? entry.at : '' }
  }
  return out
}

export function computeSlotPlan(localPayload, cloudPayload, baselineRev = {}, serialize) {
  const plan = {}
  for (const slot of SLOT_KEYS) {
    const localSer = serialize(slotValue(localPayload, slot))
    const cloudSer = serialize(slotValue(cloudPayload, slot))
    if (localSer === cloudSer) { plan[slot] = 'align'; continue }
    const localRev = revOf(localPayload, slot)
    const cloudRev = revOf(cloudPayload, slot)
    const base = Number(baselineRev?.[slot]) || 0
    const localMoved = localRev !== base
    const cloudMoved = cloudRev !== base
    if (localMoved && cloudMoved) plan[slot] = 'conflict'
    else if (cloudMoved) plan[slot] = 'adopt-cloud'
    else if (localMoved) plan[slot] = 'upload'
    else plan[slot] = 'conflict' // rev 皆未越基线但内容不同 → 保守冲突
  }
  return plan
}

/**
 * 按计划与决策合并 payload。
 * decisions: { slot: 'local' | 'cloud' }（仅对 adopt-cloud / conflict 槽位有意义）
 * 默认方向：adopt-cloud → cloud；conflict → local。
 */
export function buildMerged(localPayload, cloudPayload, plan, decisions = {}) {
  const merged = JSON.parse(JSON.stringify(localPayload || {}))
  const rev = {}
  for (const slot of SLOT_KEYS) {
    const action = plan?.[slot]
    let useCloud
    if (decisions[slot] === 'cloud') useCloud = true
    else if (decisions[slot] === 'local') useCloud = false
    else useCloud = action === 'adopt-cloud' // adopt 默认云端，conflict 默认本地
    if (useCloud) {
      setSlotValue(merged, slot, slotValue(cloudPayload, slot))
      if (cloudPayload?._rev?.[slot]) rev[slot] = cloudPayload._rev[slot]
    } else if (localPayload?._rev?.[slot]) {
      rev[slot] = localPayload._rev[slot]
    }
  }
  merged._rev = rev
  merged.updatedAt = localPayload?.updatedAt || ''
  return merged
}
```

- [ ] **Step 4: 运行确认通过** — `npx vitest run src/data/cloudSlotPlan.test.js`，期望所有用例 PASS

- [ ] **Step 5: 提交** — `git add src/data/cloudSlotPlan.js src/data/cloudSlotPlan.test.js && git commit -m "feat: 云同步槽位版本化纯函数 cloudSlotPlan"`

---

### Task 2: store.js —— `_rev` 版本记账

**Files:**
- Modify: `src/data/store.js`
- Test: `src/data/store.test.js`

**Interfaces:**
- Consumes: Task 1 的 `SLOT_KEYS`, `slotValue`, `revOf`, `normalizeRev`, `stableSerialize`（store.js 原生）
- Produces:
  - 模块内部 `let currentPayloadRev = {}`（exportData 的 `_rev` 来源）
  - `exportData()` 输出增加 `_rev`（`clone(currentPayloadRev)`）
  - `loadData(json)` 恢复 `currentPayloadRev = normalizeRev(json._rev)`
  - `saveToLocalStorage` 逐槽位脏检测并 bump `currentPayloadRev`

- [ ] **Step 1: 写失败测试（先加在 store.test.js 的 data store describe 内）**

```js
it('exportData 携带 _rev，loadData 恢复 _rev', () => {
  loadData({ items: [{ id: 1 }], _rev: { items: { rev: 3, at: 't' } } })
  expect(exportData()._rev).toEqual({ items: { rev: 3, at: 't' } })
})

it('saveToLocalStorage 改动槽位则 bump 对应 rev，未动槽位不变', () => {
  const storeMap = new Map()
  vi.stubGlobal('localStorage', {
    getItem: (k) => (storeMap.has(k) ? storeMap.get(k) : null),
    setItem: (k, v) => storeMap.set(k, String(v)),
    removeItem: (k) => storeMap.delete(k),
  })
  loadData({ items: [{ id: 1, name: 'a' }] })
  saveToLocalStorage() // 建立持久化基线，不应 bump（无 ._rev 基线 = {}）
  expect(exportData()._rev).toEqual({})
  loadData({ items: [{ id: 1, name: 'b' }] }) // items 变了
  saveToLocalStorage()
  const rev = exportData()._rev
  expect(rev.items.rev).toBe(1)
  expect(rev.calc).toBeUndefined() // calc 未变
  // 再次保存相同内容 → 不再 bump
  const before = rev.items.rev
  saveToLocalStorage()
  expect(exportData()._rev.items.rev).toBe(before)
  vi.unstubAllGlobals()
})
```

- [ ] **Step 2: 运行确认失败** — `npx vitest run src/data/store.test.js`，期望新用例 FAIL

- [ ] **Step 3: 实现改动**

在 `store.js` 顶部 `lastPersistedCompareSerialized` 声明附近新增：

```js
let currentPayloadRev = {} // payload._rev 的本地真源（模块态，非响应式）
let lastPersistedSlot = {} // { slot: 上次持久化的槽位序列化串 }（脏检测基线）
```

把 `stripUpdatedAt` 替换为 `stripMeta`（同时去掉 `updatedAt` 与 `_rev`）：

```js
function stripMeta(data) {
  if (!data || typeof data !== 'object') return data
  const copy = { ...data }
  delete copy.updatedAt
  delete copy._rev
  return copy
}
```

`setPersistedSnapshot` 内，`normalizeRev` 与槽位基线更新：

```js
function setPersistedSnapshot(data) {
  const safeData = data && typeof data === 'object' ? clone(data) : exportData()
  lastPersistedData = safeData
  lastPersistedSerialized = JSON.stringify(safeData)
  lastPersistedCompareSerialized = JSON.stringify(stripMeta(safeData))
  lastPersistedSlot = {}
  for (const slot of SLOT_KEYS) {
    lastPersistedSlot[slot] = stableSerialize(slotValue(safeData, slot))
  }
  hasPersistedSnapshot = true
}
```

`loadData` 末尾（恢复本地修改时间附近）新增：

```js
  currentPayloadRev = normalizeRev(data._rev)
```

`exportData` 返回对象新增一行：

```js
    _rev: clone(currentPayloadRev),
```

`saveToLocalStorage` 重写为（保留调用处语义）：

```js
export function saveToLocalStorage(options = {}) {
  const bumpTimestamp = options.bumpTimestamp !== false
  takeDailySnapshot()
  let currentData = exportData()
  const compareSerialized = JSON.stringify(stripMeta(currentData))
  const hasDataChange = hasPersistedSnapshot && compareSerialized !== lastPersistedCompareSerialized

  if (bumpTimestamp && hasDataChange) {
    bumpSlotRevs(currentData)
    localLastModifiedAt = new Date().toISOString()
    currentData = exportData()
  } else if (hasDataChange) {
    // 纯时间戳对齐/外部应用：不 bump rev，但刷新槽位基线防止脏误判
    refreshSlotBaseline(currentData)
  }
  const serialized = JSON.stringify(currentData)

  if (hasDataChange && !suppressHistory) {
    pushHistoryEntry(lastPersistedData, currentData)
  } else {
    clearPendingHistoryMeta()
  }

  localStorage.setItem('ysp_data', serialized)
  setPersistedSnapshot(currentData)
  if (hasDataChange) scheduleCloudSync()
  maybeAutoBackup()
}

function bumpSlotRevs(currentData) {
  const next = { ...(currentPayloadRev || {}) }
  let touched = false
  for (const slot of SLOT_KEYS) {
    const ser = stableSerialize(slotValue(currentData, slot))
    if (ser !== lastPersistedSlot[slot]) {
      next[slot] = { rev: (Number(next[slot]?.rev) || 0) + 1, at: new Date().toISOString() }
      lastPersistedSlot[slot] = ser
      touched = true
    }
  }
  if (touched) currentPayloadRev = next
}

function refreshSlotBaseline(currentData) {
  for (const slot of SLOT_KEYS) {
    lastPersistedSlot[slot] = stableSerialize(slotValue(currentData, slot))
  }
}
```

同时在 store.js 顶部新增 import：

```js
import { SLOT_KEYS, slotValue, normalizeRev } from './cloudSlotPlan'
```

> 注：`isContentEqual` 走 `normalizePayloadForCompare`，不含 `_rev`，不因 T2 改变。

- [ ] **Step 4: 运行确认通过** — `npx vitest run src/data/store.test.js`，期望全部 PASS（新用例 + 既有 19 例）

- [ ] **Step 5: 提交** — `git add src/data/store.js src/data/store.test.js && git commit -m "feat: store 槽位版本记账 _rev"`

---

### Task 3: 同步基线 `cloudRev` 持久化

**Files:**
- Modify: `src/data/store.js`
- Test: `src/data/store.test.js`

**Interfaces:**
- Consumes: 无新增
- Produces: `state.cloudStatus.cloudRev`（`{}` 默认）；`saveUiStateToLocalStorage` 已整体落盘 cloudStatus，自动覆盖

- [ ] **Step 1: 写失败测试**

```js
it('cloudRev 随 cloudStatus 持久化与恢复', () => {
  const storeMap = new Map()
  vi.stubGlobal('localStorage', {
    getItem: (k) => (storeMap.has(k) ? storeMap.get(k) : null),
    setItem: (k, v) => storeMap.set(k, String(v)),
    removeItem: (k) => storeMap.delete(k),
  })
  state.cloudStatus.cloudRev = { items: 3, calc: 1 }
  saveUiStateToLocalStorage()
  state.cloudStatus.cloudRev = {}
  loadUiStateFromLocalStorage()
  expect(state.cloudStatus.cloudRev).toEqual({ items: 3, calc: 1 })
  vi.unstubAllGlobals()
})
```

- [ ] **Step 2: 运行确认失败**

- [ ] **Step 3: 实现** — `DEFAULT_CLOUD_STATUS` 增加 `cloudRev: {},`；确认 `loadUiStateFromLocalStorage` 的合并路径 `{ ...DEFAULT_CLOUD_STATUS, ...parsed.cloudStatus }` 已能保留该字段（无需额外代码）

- [ ] **Step 4: 运行确认通过**

- [ ] **Step 5: 提交** — `git commit -m "feat: 云同步基线 cloudRev 持久化"`

---

### Task 4: 同步引擎统一 `performSyncDecision`

**Files:**
- Modify: `src/data/store.js`（重写 `runCloudSync` → `performSyncDecision`，保留同名导出包装）
- Modify: `src/data/store.test.js`（更新 force 智能比对既有用例的 handler 契约；新增引擎用例）
- Test: 新建 `src/data/cloudSyncEngine.test.js` 或并入 `store.test.js`（并入以减少全局状态冲突）

**Interfaces:**
- Consumes: Task 1 `computeSlotPlan`/`buildMerged`/`revOf`/`SLOT_KEYS`/`slotValue`；Task 2 `currentPayloadRev`；Task 3 `state.cloudStatus.cloudRev`
- Produces:
  - `export async function performSyncDecision({ reason='auto', force=false, silent=false })`（export 以便单测直调）
  - `export async function syncToCloudNow()` → `performSyncDecision({ reason:'manual', force:true })`
  - `export async function runCloudSyncCheck()` → `performSyncDecision({ reason:'periodic-check' })`
  - `export async function runStartupSync()` → `performSyncDecision({ reason:'startup' })`（供 App.vue loadCloudOnStartup）
  - `cloudConflictHandler(type, data)` 新契约：type=`'slot-conflict'`，data 含 `{ plan, localPayload, cloudPayload, cloudUpdatedAt, localModifiedAt }`；返回 `{ decisions: {slot:'local'|'cloud'}, copies: string[] } | null`（null=用户取消，整轮跳过：本地不动、不上传、不覆盖云端任何槽位）

- [ ] **Step 1: 更新既有测试契约（先改测试使其失败）**

在 `store.test.js` 的 `手动同步(force) 智能比对` describe 内：

- `registerCloudConflictHandler(async (type, data) => { conflictType = type; return 'cancel' })` 改为返回对象：
  ```js
  registerCloudConflictHandler(async (type, data) => { conflictType = type; return null }) // null = 取消
  ```
  期望断言 `expect(conflictType).toBe('slot-conflict')`（原来 `manual-sync`）。
- `'云端较新且不同、用户选择 use-cloud 时'` 用例：handler 返回 `{ decisions: Object.fromEntries(Object.keys(data.plan).filter(s=>data.plan[s]==='adopt-cloud'||data.plan[s]==='conflict').map(s=>[s,'cloud'])), copies: [] }`；`expect(state.items).toEqual(CLOUD_PAYLOAD.items)` 保持成立（云端 items adopt 到本地）。**同时更新调用断言**：原 `expect(env.calls.map((c) => c.reason)).toEqual(['pre-check'])` 改为 `toEqual(['pre-check', 'sync'])`（fitxt 无 `_rev`，引擎触发一次印章上传自愈）。

- [ ] **Step 2: 运行确认 FAIL**（新引擎未实现，或 handler 契约断言失败）

- [ ] **Step 3: 实现 `performSyncDecision` 并替换 `runCloudSync`**

保留 `runCloudSync` 内部改名为 `performSyncDecision`，三个公开导出改为包装。核心逻辑：

```js
async function performSyncDecision({ reason = 'auto', force = false, silent = false } = {}) {
  if (suppressCloudSync) return null
  if (!state.cloudSettings.enabled && !force) return null
  if (!hasCloudSyncConfig()) return null
  if (typeof cloudSyncHandler !== 'function') return null
  if (state.cloudStatus.syncing) return null // 重入锁

  setCloudStatusPatch({ syncing: true, lastSyncError: '' })
  try {
    // 1. 只读预检
    const cloudResult = await cloudSyncHandler(exportData(), { reason: 'pre-check' })
    const cloudPayload = cloudResult?.payload
    const cloudUpdatedAt = cloudResult?.updatedAt || ''

    // 2. 云端无行 → 上传本地初始化（含 _rev 印章）
    if (!cloudPayload && !cloudResult?.row) {
      const result = await cloudSyncHandler(exportData(), { reason })
      setCloudStatusPatch({ syncing: false, connected: true, lastSyncAt: result?.updatedAt || new Date().toISOString(), lastSyncError: '' })
      saveUiStateToLocalStorage()
      addOperationLog('cloud_sync', force ? '手动同步：云端无数据，已上传本地完成初始化' : '首次启动：无云端数据，本地数据保持不变', { reason })
      return result
    }

    // 3. 云端载荷损坏（无 items）→ 视为无数据（沿用 B1 边界）
    const hasUsableCloudPayload = cloudPayload && typeof cloudPayload === 'object' && !Array.isArray(cloudPayload) && Array.isArray(cloudPayload.items)
    if (!hasUsableCloudPayload) {
      setCloudStatusPatch({ syncing: false, connected: true, lastSyncAt: new Date().toISOString(), lastSyncError: '', lastAutoSyncAt: Date.now() })
      saveUiStateToLocalStorage()
      addOperationLog('cloud_sync', '首次启动：无云端数据，本地数据保持不变', { reason })
      return { updatedAt: new Date().toISOString(), row: null }
    }

    const localPayload = exportData()
    const plan = computeSlotPlan(localPayload, cloudPayload, state.cloudStatus.cloudRev, stableSerialize)

    const adoptSlots = SLOT_KEYS.filter((s) => plan[s] === 'adopt-cloud')
    const conflictSlots = SLOT_KEYS.filter((s) => plan[s] === 'conflict')
    const uploadSlots = SLOT_KEYS.filter((s) => plan[s] === 'upload')

    // 4. silent：存在 adopt/conflict → 整轮跳过（不静默覆盖，也不上传导致顺带覆盖）
    if (silent && (adoptSlots.length > 0 || conflictSlots.length > 0)) {
      setCloudStatusPatch({ syncing: false, connected: true, lastSyncAt: cloudUpdatedAt || new Date().toISOString(), lastAutoSyncAt: Date.now(), lastSyncError: '' })
      addOperationLog('cloud_sync', '后台同步：与云端存在分歧槽位，暂不动作，等待定期检测提示', { reason, adoptSlots, conflictSlots })
      return { updatedAt: getLocalModifiedAt(), row: cloudPayload }
    }

    // 5. 全对齐 → 仅对齐时间戳
    if (adoptSlots.length === 0 && conflictSlots.length === 0 && uploadSlots.length === 0) {
      setLocalModifiedAt(cloudUpdatedAt)
      saveToLocalStorage({ bumpTimestamp: false })
      setCloudStatusPatch({ syncing: false, connected: true, lastSyncAt: cloudUpdatedAt || new Date().toISOString(), lastAutoSyncAt: Date.now(), lastSyncError: '' })
      saveUiStateToLocalStorage()
      addOperationLog('cloud_sync', force ? '手动同步：云端与本地一致，已对齐时间戳' : '内容一致，已对齐时间戳', { localModifiedAt: getLocalModifiedAt(), cloudUpdatedAt })
      return { updatedAt: cloudUpdatedAt, row: cloudPayload }
    }

    // 6. 需用户决策的槽位（adopt-cloud / conflict）
    let decisions = {}
    let copies = []
    if (adoptSlots.length > 0 || conflictSlots.length > 0) {
      if (typeof cloudConflictHandler === 'function') {
        const userChoice = await cloudConflictHandler('slot-conflict', {
          plan, localPayload, cloudPayload, cloudUpdatedAt, localModifiedAt: getLocalModifiedAt(),
        })
        if (!userChoice) {
          // 用户取消：本地不动、不上传、不覆盖云端任何槽位（与 silent 同级，整轮跳过）
          setCloudStatusPatch({ syncing: false, connected: true, lastSyncAt: cloudUpdatedAt || new Date().toISOString(), lastAutoSyncAt: Date.now(), lastSyncError: '' })
          saveUiStateToLocalStorage()
          addOperationLog('cloud_sync', '用户取消同步，保持本地数据', { adoptSlots, conflictSlots, reason })
          return { updatedAt: getLocalModifiedAt(), row: cloudPayload }
        }
        decisions = userChoice.decisions || {}
        copies = Array.isArray(userChoice.copies) ? userChoice.copies : []
      } else {
        decisions = {}
      }
    }

    // 7. 合并（upload 槽走本地；adopt 默认云端、conflict 默认本地，决策可覆盖）
    const merged = buildMerged(localPayload, cloudPayload, plan, decisions)

    // 8. 有采纳云端内容 → 应用合并结果到本地（loadData 恢复 merged._rev）
    const adoptToLocal = !silent && adoptSlots.some((s) => decisions[s] !== 'local')
    const conflictToCloud = !silent && conflictSlots.some((s) => decisions[s] === 'cloud')
    if (adoptToLocal || conflictToCloud) {
      const applied = await applyCloudPayload(merged, { trackHistory: force, sourceUpdatedAt: cloudUpdatedAt })
      if (!applied) {
        addOperationLog('cloud_sync', '云端载荷损坏/缺失，已拒绝应用，保留本地', { adoptSlots, conflictSlots, cloudUpdatedAt })
        setCloudStatusPatch({ syncing: false, connected: false, lastSyncError: '云端数据不完整，已拒绝应用' })
        return { updatedAt: getLocalModifiedAt(), row: cloudPayload }
      }
      setCloudLoadSuccess?.(cloudUpdatedAt)
    }

    // 9. 需上传（有本地获胜槽位，或云端缺 _rev 需印章一次性自愈）
    let result = null
    const mustUpload = uploadSlots.length > 0 || !hasRevEqual(merged, cloudPayload)
    if (mustUpload) {
      result = await cloudSyncHandler(merged, { reason: 'sync' })
      setLocalModifiedAt(result?.updatedAt || cloudUpdatedAt)
      saveToLocalStorage({ bumpTimestamp: false })
    }

    // 10. 更新基线 & 状态
    for (const slot of SLOT_KEYS) {
      state.cloudStatus.cloudRev[slot] = revOf(merged, slot)
    }
    setCloudStatusPatch({ syncing: false, connected: true, lastSyncAt: result?.updatedAt || cloudUpdatedAt || new Date().toISOString(), lastAutoSyncAt: Date.now(), lastSyncError: '' })
    saveUiStateToLocalStorage()
    addOperationLog('cloud_sync', '同步完成', { reason, adoptSlots, conflictSlots, uploadSlots, copies })
    return { updatedAt: result?.updatedAt || cloudUpdatedAt, row: cloudPayload }
  } catch (err) {
    setCloudStatusPatch({ syncing: false, connected: false, lastSyncError: err?.message || '云端同步失败' })
    saveUiStateToLocalStorage()
    throw err
  }
}

function hasRevEqual(a, b) {
  return stableSerialize(a?._rev || {}) === stableSerialize(b?._rev || {})
}
```

三个导出改为：

```js
export async function syncToCloudNow() { clearCloudSyncTimer(); return performSyncDecision({ reason: 'manual', force: true }) }
export async function runCloudSyncCheck() { clearCloudSyncTimer(); return performSyncDecision({ reason: 'periodic-check' }) }
export async function runStartupSync() { clearCloudSyncTimer(); return performSyncDecision({ reason: 'startup' }) }
```

删除原 `runCloudSync` 整个函数体（原 force/manual-sync、upload-local、recovery、silent 分支全部由新引擎取代）。

> 注意：第 8 步 `applyCloudPayload` 内部会 `loadData(merged)`（保留 merged._rev）并 `saveToLocalStorage({bumpTimestamp:false})`；`currentPayloadRev` 随 loadData 恢复为 merged._rev，故后续 saveToLocalStorage 不再误 bump。

- [ ] **Step 4: 新增引擎行为测试**

```js
it('双方都改 items → 弹窗仅列 conflict 槽，用户选云端则采纳该槽', async () => {
  loadData({ items: [{ id: 1, name: 'local' }], calc: {}, _rev: { items: { rev: 2, at: '' } } })
  const env = setupCloudEnv({ cloudPayload: { ...CLOUD_PAYLOAD, items: [{ id: 1, sid: 'JP-1', name: 'cloud', cost: 100, status: 'inventory' }], _rev: { items: { rev: 5, at: '' } } } })
  state.cloudStatus.cloudRev = { items: 1 }
  let conflictSlots = null
  registerCloudConflictHandler(async (type, data) => {
    conflictSlots = Object.keys(data.plan).filter((s) => data.plan[s] === 'conflict')
    return { decisions: { items: 'cloud' }, copies: [] }
  })
  await runCloudSyncCheck()
  expect(conflictSlots).toEqual(['items'])
  expect(state.items[0].name).toBe('cloud')
  const upload = env.calls.find((c) => c.reason === 'sync')?.payload
  expect(upload.items[0].name).toBe('cloud')
  expect(state.cloudStatus.cloudRev.items).toBe(5)
})

it('silent 遇 adopt/conflict 槽 → 整轮跳过不上传', async () => {
  loadData({ items: [{ id: 1, name: 'local' }], _rev: { items: { rev: 2, at: '' } } })
  const env = setupCloudEnv({ cloudPayload: { ...CLOUD_PAYLOAD, items: [{ id: 1, sid: 'JP-1', name: 'cloud', cost: 100, status: 'inventory' }], _rev: { items: { rev: 5, at: '' } } } })
  state.cloudStatus.cloudRev = { items: 1 }
  await performSyncDecision?.({ reason: 'debounced', silent: true })
  // scheduleCloudSync 走 silent:true，上传仅发生在 silent 且无 adopt/conflict 时
  expect(env.calls.filter((c) => c.reason !== 'pre-check')).toHaveLength(0)
})
```

> 注：`performSyncDecision` 非公开导出，若需直接测 silent 路径，改为测 `scheduleCloudSync` + 假定时器（沿用既有 800ms 用例写法），或临时 import 内部函数。本计划采用后者：把 `performSyncDecision` 直接 `export` 以便单测。

- [ ] **Step 5: 运行确认通过** — 全部 store.test.js 用例 PASS（含更新与新增）

- [ ] **Step 6: 提交** — `git commit -m "feat: 统一云同步引擎 performSyncDecision（槽位化）"`

---

### Task 5: App.vue —— 逐槽位冲突弹窗 + 启动/拉取统一

**Files:**
- Modify: `src/App.vue`
- Test: 无（组件无 DOM 单测环境），以 `npm run build` + 手动冒烟为验收

**Interfaces:**
- Consumes: Task 4 的 `runStartupSync`、`cloudConflictHandler` 新契约、`SLOT_KEYS`/`SLOT_LABELS`/`computeConflictDiff`
- Produces: `askSlotConflict(slotInfo, data)` 处理器；`loadCloudOnStartup` 改为调 `runStartupSync`；`pullFromCloud` 走共享引擎

- [ ] **Step 1: 新增槽位冲突状态**

在 App.vue 顶部 import 区新增：

```js
import { SLOT_LABELS, slotValue } from './data/cloudSlotPlan'
```

（`computeConflictDiff`、`primaryConflictAction`、`shouldWarnBeforeOverwrite`、`downloadJsonBackup` 均已 import。）

在 `cloudConflictType`/`cloudConflictInfo` 附近新增：

```js
const slotConflict = ref(false)
const slotConflictInfo = ref({ rows: [], plan: {}, localPayload: {}, cloudPayload: {}, localAt: '', cloudAt: '' })
const slotChoice = ref({})
let slotConflictResolver = null
```

`askCloudConflict` 分支处理：当 `type === 'slot-conflict'` 时构造 `rows`：

```js
async function askCloudConflict(type, data = {}) {
  if (type === 'slot-conflict') return askSlotConflict(data)
  // …原有 recovery/upload-local/manual-sync 分支保留（兼容不再调用，但保留兜底）
}

async function askSlotConflict(data) {
  const { plan, localPayload, cloudPayload, cloudUpdatedAt, localModifiedAt } = data
  const slots = Object.keys(plan).filter((s) => plan[s] === 'adopt-cloud' || plan[s] === 'conflict')
  const diff = computeConflictDiff(localPayload, cloudPayload)
  const rows = slots.map((slot) => {
    const entries = diff.entries.filter((e) => e.collectionLabel === SLOT_LABELS[slot] || (slot === 'calc' && e.collectionLabel === '财务结算'))
    return { slot, label: SLOT_LABELS[slot] || slot, action: plan[slot], entries, defaultLocal: primaryConflictAction('manual-sync', localModifiedAt, cloudUpdatedAt) === 'upload' }
  })
  slotConflictInfo.value = { rows, plan, localPayload, cloudPayload, localAt: localModifiedAt, cloudAt: cloudUpdatedAt }
  slotConflict.value = true
  const choice = await new Promise((resolve) => { slotConflictResolver = resolve })
  slotConflict.value = false
  if (!choice) return null
  // 强警告二次确认：选云端的冲突槽若命中 shouldWarnBeforeOverwrite 单项骤减 → 二次确认
  return { decisions: choice.decisions, copies: choice.copies }
}
```

- [ ] **Step 2: 模板新增 `slotConflict` 弹窗**（仿 `cloudConflict`，逐槽位行）

在现有 `cloudConflict` GlassModal 前插入新 `slotConflict` 弹窗，每行含：槽位名 + 动作徽标 + 三按钮 `[本地][云端][都留]`，记录 `slotChoice = ref({})`；底部 `[取消][确认]`。确认时构造 `{ decisions, copies }`：

```js
function resolveSlotConflict() {
  const decisions = {}
  const copies = []
  for (const row of slotConflictInfo.value.rows) {
    const sel = slotChoice.value[row.slot] || (row.defaultLocal ? 'local' : 'cloud')
    decisions[row.slot] = sel === 'cloud' ? 'cloud' : 'local'
    if (sel === 'both') {
      copies.push(row.slot)
      downloadJsonBackup(
        { slot: row.slot, [SLOT_LABELS[row.slot] || row.slot]: slotValue(slotConflictInfo.value.cloudPayload, row.slot) },
        `饮食派数据_${row.slot}_冲突副本_${Date.now()}.json`,
      )
    }
  }
  slotConflictResolver?.({ decisions, copies })
  slotConflict.value = false
}
function cancelSlotConflict() { slotConflictResolver?.(null); slotConflict.value = false; slotChoice.value = {} }
```

> 「都留」= 本侧槽位胜 + 云端侧当场落盘副本（`downloadJsonBackup`），副本由 App.vue 直接生成，引擎的 `copies` 仅用于写日志。

模板（插在既有 `cloudConflict` GlassModal 之前）：

```html
<GlassModal v-model="slotConflict" panel-class="w-full max-w-lg p-6 relative max-h-[80vh] overflow-y-auto" :close-on-overlay="false">
  <div class="mb-1 text-xl font-bold">检测到槽位冲突</div>
  <p class="mb-3 text-xs text-gray-500">以下集合本地与云端都修改过，请逐项选择保留哪一侧（「都留」会先把云端一侧存为本地副本 JSON）。未冲突集合已自动合并。</p>
  <div v-for="row in slotConflictInfo.rows" :key="row.slot" class="mb-3 rounded-lg border border-gray-200 p-3">
    <div class="flex items-center justify-between">
      <span class="font-semibold">{{ row.label }}</span>
      <span class="rounded bg-orange-100 px-2 py-0.5 text-xs text-orange-600">{{ row.action === 'adopt-cloud' ? '云端有更新' : '两边不同' }}</span>
    </div>
    <div v-if="row.entries.length" class="mt-1 max-h-24 overflow-y-auto text-xs text-gray-500">
      <div v-for="e in row.entries.slice(0, 3)" :key="e.key" class="truncate">{{ e.recordLabel }} · {{ kindText(e.kind) }}</div>
      <div v-if="row.entries.length > 3" class="text-gray-400">另有 {{ row.entries.length - 3 }} 处</div>
    </div>
    <div class="mt-2 flex gap-2">
      <button class="btn btn-outline btn-sm" :class="slotChoice[row.slot] === 'local' ? 'ring-2 ring-blue-400' : ''" @click="slotChoice[row.slot] = 'local'">本地</button>
      <button class="btn btn-outline btn-sm" :class="slotChoice[row.slot] === 'cloud' ? 'ring-2 ring-blue-400' : ''" @click="slotChoice[row.slot] = 'cloud'">云端</button>
      <button class="btn btn-outline btn-sm" :class="slotChoice[row.slot] === 'both' ? 'ring-2 ring-blue-400' : ''" @click="slotChoice[row.slot] = 'both'">都留</button>
    </div>
  </div>
  <div class="space-y-2">
    <button class="btn btn-outline w-full" @click="cancelSlotConflict">取消</button>
    <button class="btn btn-primary w-full" @click="resolveSlotConflict">确认</button>
  </div>
</GlassModal>
```

- [ ] **Step 3: `registerCloudConflictHandler(askCloudConflict)` 不变**（已在 onMounted）

`loadCloudOnStartup` 改薄壳：

```js
async function loadCloudOnStartup() {
  if (!store.cloudSettings.enabled) return false
  if (!isCloudConfigReady(store.cloudSettings)) return false
  try {
    const result = await runStartupSync()
    setCloudLoadSuccess(result?.updatedAt || '')
    store.cloudStatus.lastAutoSyncAt = Date.now()
    return true
  } catch (err) {
    setCloudLoadError(err.message)
    return false
  }
}
```

`pullFromCloud` 改走引擎（显式采纳云端全部差异槽）：

```js
async function pullFromCloud() {
  if (!isCloudConfigReady(store.cloudSettings)) { alert('请先配置云端参数'); return }
  cloudBusy.value = true
  try {
    const result = await runStartupSync() // 复用引擎：adopt/conflict 槽位会弹窗，用户选云端即整包拉取
    setCloudLoadSuccess(result?.updatedAt || '')
    addOperationLog('cloud_pull', '从云端加载数据成功', { updatedAt: result?.updatedAt })
    alert('已从云端加载最新数据')
  } catch (err) {
    setCloudLoadError(err.message)
    alert(`从云端加载失败: ${err.message}`)
  } finally { cloudBusy.value = false }
}
```

保留原有 `cloudConflict` 弹窗与 `overwriteWarn`（策略守卫 UI 继续复用），但主路径将由 `slotConflict` 承担。

- [ ] **Step 4: 调整 App.vue 的 store import** — 新增 `runStartupSync,`；`syncToCloudNow`/`runCloudSyncCheck` 若在模板/脚本中已无引用则一并移除，否则保留（原有 `cloudConflict` 弹窗与 `overwriteWarn` 作兜底保留，不删其模板与函数）

- [ ] **Step 5: 构建验证** — `npm run build` 成功；`npm test` 全绿

- [ ] **Step 6: 手动冒烟**（可选，`npm run dev` 双开两个伪造 config 时的行为）

- [ ] **Step 7: 提交** — `git commit -m "feat: 逐槽位冲突弹窗 + 启动/拉取引擎统一"`

---

### Task 6: 回归、文档与验收

**Files:**
- Modify: `README.md`（云同步节补充 `_rev` 说明）
- 验证：全量

- [ ] **Step 1: 全量回归** — `npm test`（期望 ≥115 例全绿）+ `npm run build`

- [ ] **Step 2: README 云同步节加一行**：

```md
> `main` 行 `payload` 内含 `_rev`（每数据集合独立版本号）。两设备各改不同集合可自动合并；仅当双方都改同一集合时弹逐槽位冲突框。
```

- [ ] **Step 3: 对照 spec《验收标准》逐条人工核对**：

| spec 验收项 | 验证方式 |
|---|---|
| 两设备各改不同集合，双方保留 | store.test.js 槽位对齐/upload/adopt 用例 |
| 双方同改一集合 → 逐槽弹窗 | Task 4 conflict 用例 + Task 5 冒烟 |
| 现有 107+ 用例全绿 | Task 6 Step1 |
| 手机页零改动 | 未 touch `public/ysp-remote.html` |
| Supabase/RLS/car 行零改动 | 未 touch cloudStore.js / SQL / docs RLS |

- [ ] **Step 4: 提交** — `git add README.md && git commit -m "docs: README 补充槽位版本化说明"`

---

## 自检结论（对照 spec）

- 《数据模型 9 槽位》→ Task 1
- 《版本记账 saveToLocalStorage》→ Task 2
- 《同步基线 cloudRev》→ Task 3
- 《同步决策 computeSlotPlan》→ Task 1
- 《同步引擎整合 + 重入锁 + pullFromCloud》→ Task 4/5
- 《冲突弹窗逐槽三选 + 都留副本 + 强警告二次确认》→ Task 5
- 《兼容迁移（无 _rev 降级 / 印章上传 / 手机页零改动 / snapshot 并集）》→ 引擎 fallback（`revOf??0`、`hasRevEqual` 触发盖章上传）内嵌于 Task 4；snapshot 并集由 `buildMerged` 全量 clone local 保证（快照跟本地，同日不冲突）
- 《测试计划 4 栏》→ Task 1/2/4 对应用例
- 《验收标准》→ Task 6