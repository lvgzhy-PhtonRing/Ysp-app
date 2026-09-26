# 云端同步安全加固（C3）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 落地 C3 设计中的五个安全加固方案（A Tab 真实租约锁 / B 盲写路径校验 / C 采纳前落档 / D 导入防护 / E 回溯 UI），修复审计报告 L1-L5 数据丢失风险。

**Architecture:** 全部改动发生在客户端（Vue 3 + localStorage + Supabase 单行读写），五方案独立可叠加：C 新建 `ysp_adopt_before` 独立存储区 + 单点落档于 `applyCloudDataToStore`；D 在 `handleImport` 加确认 + 快照（复用 C 的存储）；B 把两条盲写路径改走引擎 `performSyncDecision({silent:true})` 并透传 `keepalive`；A 新增 `shouldHoldLock` 纯函数 + App.vue 全页遮罩；E 修正 `logReplay` BARRIER 判定并入操作日志模态框。

**Tech Stack:** Vue 3 (Composables + Options `<script setup>`), vitest, localStorage, Supabase REST (cloudStore.js)。

**Spec:** `docs/superpowers/specs/2026-09-26-cloud-slot-safety-design.md`

## Global Constraints

- 不新增依赖库（无 BroadcastChannel polyfill、无日期库，沿用现有 `new Date` 用法）
- 不改 Supabase 表结构 / RLS / `car` 行 / `cloudStore.js` 传输协议
- 不改 `performSyncDecision` 主路径的 fetch→merge 语义（已验证安全），只在 B 增加 `keepalive` 透传
- 不改手机页 `ysp-remote.html`、本地存储 key `ysp_data`/`ysp_ui` 结构
- 新存储区 key 遵循现状风格（`ysp_tab`、`ysp_data`、`ysp_ui`）→ 新 key 用 `ysp_adopt_before`
- 测试框架 vitest；纯函数必须可单测；DOM/Vue 绑定不硬性要求
- 语言：源码注释、提交信息用中文（与现状一致）
- 现有命令：`npm test`（vitest）、`npm run build`（vite build）；开发需保证两命令通过

---

### Task 1: C 采纳前落档（ysp_adopt_before 存储区 + 单点落档）

**Files:**
- Create: `src/data/adoptLog.js`
- Create: `src/data/adoptLog.test.js`
- Modify: `src/data/store.js`（`performSyncDecision` 传 `decisionSlots` 给 `applyCloudPayload`）
- Modify: `src/App.vue`（`applyCloudDataToStore` 落档）

**Interfaces:**
- Consumes: `SLOT_KEYS`、`SLOT_LABELS`、`slotValue`（`src/data/cloudSlotPlan.js` 导出）
- Produces:
  - `appendAdoptBefore({ slot, before, beforeRev, cloudRev, time })` → `adoptId: string`
  - `getAdoptBeforeById(adoptId)` → `{ adoptId, slot, before, beforeRev, cloudRev, time } | null`
  - `listAdoptBefore()` → 数组（时间倒序）
  - `pruneAdoptBefore(maxAgeMs = 365*86400000)` → void（清理过期）
  - 常量 `ADOPT_STORAGE_KEY = 'ysp_adopt_before'`

**存储结构**（localStorage key `ysp_adopt_before`）：
```js
{ adopts: [ { adoptId, time, slot, before, beforeRev, cloudRev } ] }
```

- [ ] **Step 1: 写失败测试**（`src/data/adoptLog.test.js` 新建）

```js
import { describe, it, expect, beforeEach } from 'vitest'
import {
  appendAdoptBefore, getAdoptBeforeById, listAdoptBefore, pruneAdoptBefore, ADOPT_STORAGE_KEY,
} from './adoptLog'

describe('adoptLog（C 方案）', () => {
  beforeEach(() => {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(ADOPT_STORAGE_KEY)
  })

  it('append 生成唯一 id 并可按 id 读取', () => {
    // before 存槽位内容本身（数组），与 slotValue(payload, slot) 一致
    const id = appendAdoptBefore({ slot: 'items', before: [{ id: 'a' }], beforeRev: 2, cloudRev: 3 })
    expect(typeof id).toBe('string')
    expect(id.length).toBeGreaterThan(0)
    const got = getAdoptBeforeById(id)
    expect(got.slot).toBe('items')
    expect(got.before[0].id).toBe('a')
    expect(got.beforeRev).toBe(2)
    expect(got.cloudRev).toBe(3)
  })

  it('支持 __full_import__ 槽位（D 方案导入前快照）：before 为完整导出 payload（嵌套对象）', () => {
    const id = appendAdoptBefore({ slot: '__full_import__', before: { items: [], calc: {} } })
    const got = getAdoptBeforeById(id)
    expect(got.slot).toBe('__full_import__')
    expect(got.before).toEqual({ items: [], calc: {} })
  })

  it('list 按时间倒序', () => {
    appendAdoptBefore({ slot: 'items', before: [], time: '2026-01-01T00:00:00Z' })
    appendAdoptBefore({ slot: 'calc', before: {}, time: '2026-01-02T00:00:00Z' })
    const list = listAdoptBefore()
    expect(list[0].slot).toBe('calc')
  })

  it('prune 清理超过 1 天的旧记录', () => {
    const oldId = appendAdoptBefore({ slot: 'items', before: [], time: new Date(Date.now() - 2 * 86400000).toISOString() })
    const newId = appendAdoptBefore({ slot: 'calc', before: {}, time: new Date().toISOString() })
    pruneAdoptBefore(86400000)
    expect(getAdoptBeforeById(oldId)).toBeNull()
    expect(getAdoptBeforeById(newId)).not.toBeNull()
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/data/adoptLog.test.js`
Expected: FAIL（Cannot find module './adoptLog'）

- [ ] **Step 3: 实现 `src/data/adoptLog.js`**

```js
// 云端采纳前快照存储（C 方案）：独立于 operationLogs，不参与 500 条截断
// 唯一还原依据，按天数保留（默认 365 天）

export const ADOPT_STORAGE_KEY = 'ysp_adopt_before'

const DEFAULT_MAX_AGE_MS = 365 * 86400000

function readAll() {
  try {
    const raw = localStorage.getItem(ADOPT_STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : null
    return Array.isArray(parsed?.adopts) ? parsed.adopts : []
  } catch (_) {
    return []
  }
}

function writeAll(adopts) {
  try {
    localStorage.setItem(ADOPT_STORAGE_KEY, JSON.stringify({ adopts }))
  } catch (_) {
    // localStorage 满：放弃本次写入，不影响业务采纳逻辑
  }
}

function nowIso(fallbackTime) {
  const d = fallbackTime ? new Date(fallbackTime) : new Date()
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString()
}

/**
 * 落一条采纳前快照。
 * @returns {string} adoptId（生成失败/写入失败仍返回 id 用于日志关联）
 */
export function appendAdoptBefore({ slot = '', before = null, beforeRev = null, cloudRev = null, time = '' }) {
  const adopt = {
    adoptId: `${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    time: nowIso(time),
    slot,
    before: before === null || before === undefined ? null : JSON.parse(JSON.stringify(before)),
    beforeRev,
    cloudRev,
  }
  const current = readAll()
  for (const item of current) {
    if (!item || !item.adoptId) continue
    // 去重：同 slot 同 time 视为重复落档，跳过
    if (item.slot === adopt.slot && item.time === adopt.time) return item.adoptId
  }
  writeAll([adopt, ...current])
  return adopt.adoptId
}

export function getAdoptBeforeById(adoptId) {
  if (!adoptId) return null
  return readAll().find((item) => item && item.adoptId === adoptId) || null
}

export function listAdoptBefore() {
  return readAll()
}

export function pruneAdoptBefore(maxAgeMs = DEFAULT_MAX_AGE_MS) {
  const cutoff = Date.now() - maxAgeMs
  const next = readAll().filter((item) => {
    const t = item && item.time ? new Date(item.time).getTime() : 0
    return Number.isFinite(t) && t >= cutoff
  })
  writeAll(next)
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run src/data/adoptLog.test.js`
Expected: PASS（3 用例）

- [ ] **Step 5: 修改 `performSyncDecision` 传递 `decisionSlots`**（store.js:431-436 附近）

现状（store.js:435-436）：
```js
const applied = await applyCloudPayload(merged, { trackHistory: force, sourceUpdatedAt: cloudUpdatedAt })
```

改为：
```js
const applied = await applyCloudPayload(merged, {
  trackHistory: force,
  sourceUpdatedAt: cloudUpdatedAt,
  decisionSlots: SLOT_KEYS.filter((slot) => {
    const wantsCloud = decisions[slot] === 'cloud' || (plan[slot] === 'adopt-cloud' && decisions[slot] !== 'local')
    return wantsCloud
  }),
})
```

> 注意：`decisions` 与 `plan` 在同一作用域已定义（store.js:369-410），直接使用。

- [ ] **Step 6: 修改 `applyCloudDataToStore` 落档**（App.vue:518-546）

先确认 App.vue 顶部已 import `SLOT_LABELS, slotValue`（实测 yes，line 20 区 `./data/cloudSlotPlan`），再追加 `import { appendAdoptBefore } from './data/adoptLog'`（App.vue 已有 `./services/dataProtection` 等相对导入，追加到 store import 块附近）。

`exportData()` 必须在 `loadData(payload)` 之前抓取，否则抓到的已是云端内容（关键正确性点）。

```js
function applyCloudDataToStore(payload = {}, options = {}) {
  if (!payload || typeof payload !== 'object') return false
  const guards = [
    ['items', payload.items, store.items.length],
    ['收支记录', payload.finance?.records, store.financeRecords.length],
    ['借贷记录', payload.finance?.loans, store.loanRecords.length],
    ['转运记录', payload.transfers, store.transfers.length],
    ['美淘订单', payload.rushcar?.entries, store.rushcar.entries.length],
    ['转运公司', payload.rushcar?.forwarderInfos, store.rushcar.forwarderInfos.length],
    ['美泰站点', payload.rushcar?.mattelSiteInfos, store.rushcar.mattelSiteInfos.length],
    ['支付卡', payload.rushcar?.paymentCards, store.rushcar.paymentCards.length],
  ]
  for (const [label, value, localCount] of guards) {
    if (cloudFieldMissingGuard(label, value, localCount)) return false
  }

  // C 方案：采纳云端前落档被覆盖槽位（loadData 前抓取）
  const decisionSlots = Array.isArray(options.decisionSlots) ? options.decisionSlots : []
  if (decisionSlots.length > 0) {
    const current = exportData()
    for (const slot of decisionSlots) {
      const adoptId = appendAdoptBefore({
        slot,
        before: slotValue(current, slot),
        beforeRev: current?._rev?.[slot]?.rev ?? null,
        cloudRev: payload?._rev?.[slot]?.rev ?? null,
      })
      addOperationLog('cloud_adopt_before', `采纳云端前已备份槽位「${SLOT_LABELS[slot] || slot}」`, {
        adoptId, slot, beforeRev: current?._rev?.[slot]?.rev ?? null, cloudRev: payload?._rev?.[slot]?.rev ?? null,
      })
    }
  }

  const trackHistory = options.trackHistory !== false
  setCloudSyncSuppressed(true)
  setHistorySuppressed(!trackHistory)
  try {
    loadData(payload)
    if (options.sourceUpdatedAt) setLocalModifiedAt(options.sourceUpdatedAt)
    saveToLocalStorage({ bumpTimestamp: false })
  } finally {
    setHistorySuppressed(false)
    setCloudSyncSuppressed(false)
  }
  return true
}
```

- [ ] **Step 7: 运行 store 相关测试确认行为不回归**

Run: `npx vitest run src/data/store.test.js`
Expected: PASS（原有用例保持绿）

- [ ] **Step 8: 提交**

```bash
git add src/data/adoptLog.js src/data/adoptLog.test.js src/App.vue src/data/store.js
git commit -m "feat: 采纳云端前落档 ysp_adopt_before 快照(C)"
```

---

### Task 2: D 导入前二次确认 + 快照落档

**Files:**
- Modify: `src/App.vue:757-775`（`handleImport`）
- Test: `src/data/adoptLog.test.js`（追加 `__full_import__` 用例）

**Interfaces:**
- Consumes: `appendAdoptBefore`（Task 1 提供）
- Produces: `handleImport` 行为变更（确认 → 快照 → 导入），无新导出

- [ ] **Step 1: 追加测试**（`src/data/adoptLog.test.js`）

```js
it('支持 __full_import__ 槽位（D 方案导入前快照）', () => {
  const id = appendAdoptBefore({ slot: '__full_import__', before: { items: [], calc: {} } })
  const got = getAdoptBeforeById(id)
  expect(got.slot).toBe('__full_import__')
  expect(got.before).toEqual({ items: [], calc: {} })
})
```

- [ ] **Step 2: 运行确认通过**

Run: `npx vitest run src/data/adoptLog.test.js`
Expected: PASS（4 用例）

- [ ] **Step 3: 修改 `handleImport`**（App.vue:757-775）

```js
function handleImport(event) {
  const file = event.target.files?.[0]
  if (!file) return

  const ok = confirm('导入将覆盖当前全部数据，且将同步至云端（如有启用）。建议先导出备份。是否继续？')
  if (!ok) {
    event.target.value = ''
    return
  }

  const reader = new FileReader()
  reader.onload = (e) => {
    try {
      const json = JSON.parse(e.target?.result)
      // 导入前快照：把当前完整数据落档，便于日后回溯还原（Task 1 appendAdoptBefore）
      const adoptId = appendAdoptBefore({
        slot: '__full_import__',
        before: exportData(),
      })
      loadData(json)
      saveToLocalStorage()
      addOperationLog('app_import', '导入数据成功', { file: file.name, snapshotAdoptId: adoptId })
      alert('导入成功')
    } catch (err) {
      alert(`导入失败：${err.message}`)
    }
  }
  reader.readAsText(file)
  event.target.value = ''
}
```

> 确认 App.vue 已 import `exportData`、`loadData`、`saveToLocalStorage`、`addOperationLog`（实测均在 store import 块，line 9-55）。仅追加 `appendAdoptBefore`。

- [ ] **Step 4: 构建验证（模板/脚本语法）**

Run: `npm run build`
Expected: 通过

- [ ] **Step 5: 提交**

```bash
git add src/App.vue src/data/adoptLog.test.js
git commit -m "feat: 导入前二次确认与快照落档(D)"
```

---

### Task 3: B 盲写路径校验（改走引擎 silent 模式 + keepalive 透传）

**Files:**
- Modify: `src/data/store.js`（`performSyncDecision` 接受 `keepalive`；导出 `hiddenSync` / `unloadSync` 薄壳）
- Modify: `src/App.vue:711-729`（`syncSilentlyOnHidden`）、`App.vue:908-935`（beforeunload keepalive）、App.vue:807-831（`registerCloudSyncHandler` 透传 `keepalive`）
- Modify: `src/data/store.test.js`（新用例）

**Interfaces:**
- Consumes: `performSyncDecision`（现有导出）；`getUnsyncedOperations`（`store.js:1075`）
- Produces:
  - `hiddenSync()` → Promise：`performSyncDecision({ reason:'hidden-sync', silent:true })`
  - `unloadSync()` → Promise：`performSyncDecision({ reason:'unload-sync', silent:true, keepalive:true })`

- [ ] **Step 1: 写失败测试**（`store.test.js`）——复用现有 `setupCloudEnv` 模式（store.test.js:250-267 已有 `setupCloudEnv`，用 `vi.stubGlobal('localStorage')` + `registerCloudSyncHandler`）。追加到 `手动同步(force) 智能比对` describe 之后（在同一文件底部新增 describe），需在顶部 import 追加 `hiddenSync, unloadSync`：

```js
describe('blind sync 薄壳（B 方案）', () => {
  const CLOUD_PAYLOAD = {
    items: [], calc: {}, finance: { records: [], loans: [] }, transfers: [],
    rushcar: { entries: [], forwarderInfos: [], mattelSiteInfos: [], paymentCards: [] },
  }
  const CLOUD_UPDATED_AT = '2026-09-02T10:00:00.000Z'

  function makeSyncHandler(env) {
    return async (payload, options = {}) => {
      env.calls.push({ reason: options.reason || '', keepalive: Boolean(options.keepalive) })
      if ((options.reason || '') === 'pre-check') {
        return { updatedAt: env.cloudUpdatedAt, row: env.cloudRow ?? null, payload: env.cloudPayload }
      }
      return { updatedAt: env.cloudUpdatedAt, row: { id: 'main' }, payload }
    }
  }

  function setupCloudEnv() {
    const env = { calls: [], cloudPayload: CLOUD_PAYLOAD, cloudRow: { id: 'main' }, cloudUpdatedAt: CLOUD_UPDATED_AT }
    const storeMap = new Map()
    vi.stubGlobal('localStorage', {
      getItem: (k) => (storeMap.has(k) ? storeMap.get(k) : null),
      setItem: (k, v) => storeMap.set(k, String(v)),
      removeItem: (k) => storeMap.delete(k),
    })
    Object.assign(state.cloudSettings, {
      supabaseUrl: 'https://x.supabase.co', supabaseAnonKey: 'anon-key', stateId: 'main', enabled: true, publicRead: true,
    })
    registerCloudSyncHandler(makeSyncHandler(env))
    return env
  }

  afterEach(() => {
    registerCloudSyncHandler(null)
    registerCloudConflictHandler(null)
    registerCloudApplyHandler(null)
    Object.assign(state.cloudSettings, { supabaseUrl: '', supabaseAnonKey: '', stateId: 'main', enabled: false, publicRead: true })
    vi.unstubAllGlobals()
    loadData({})
  })

  it('unloadSync: 本地与云端一致时不盲写上传（全 align）', async () => {
    loadData(CLOUD_PAYLOAD)
    const env = setupCloudEnv()
    await unloadSync()
    expect(env.calls.filter((c) => c.reason === 'sync')).toHaveLength(0)
  })

  it('hiddenSync: 本地与云端有分歧槽位 → silent 整轮跳过（不盲写、不弹窗）', async () => {
    loadData({ ...CLOUD_PAYLOAD, items: [{ id: 1, name: 'x' }] })
    const env = setupCloudEnv()
    let conflictCalled = false
    registerCloudConflictHandler(async () => {
      conflictCalled = true
      return null
    })
    await hiddenSync()
    // 本地 items 有内容、云端 items 为空，双方均无 _rev → plan: conflict
    // silent + conflict → 整轮跳过：无 sync 上传、不弹窗
    expect(env.calls.filter((c) => c.reason === 'sync')).toHaveLength(0)
    expect(conflictCalled).toBe(false)
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run src/data/store.test.js -t "blind sync"
Expected: FAIL（hiddenSync is not a function）

- [ ] **Step 3: 实现 `performSyncDecision` keepalive 透传**（store.js:333-463）

签名改为：
```js
export async function performSyncDecision({ reason = 'auto', force = false, silent = false, pull = false, keepalive = false } = {})
```

`reason === 'sync'` 的上传调用（store.js:451）：
```js
result = await cloudSyncHandler(merged, { reason: 'sync', keepalive })
```

另导出薄壳（store.js 靠近 runCloudSyncCheck 处）：
```js
export async function hiddenSync() {
  clearCloudSyncTimer()
  return performSyncDecision({ reason: 'hidden-sync', silent: true })
}

export async function unloadSync() {
  clearCloudSyncTimer()
  return performSyncDecision({ reason: 'unload-sync', silent: true, keepalive: true })
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run src/data/store.test.js -t "blind sync"`
Expected: PASS

- [ ] **Step 5: 修改 App.vue 盲写路径**

`syncSilentlyOnHidden`（711-729）改为：
```js
function syncSilentlyOnHidden() {
  if (document.visibilityState !== 'hidden') return
  if (!store.cloudSettings.enabled) return
  if (!isCloudConfigReady(store.cloudSettings)) return
  if (store.cloudStatus.syncing) return
  if (getUnsyncedOperations().length === 0) return
  if (!store.cloudStatus.lastSyncAt) return
  hiddenSync().catch(() => { /* 静默失败 */ })
}
```

beforeunload keepalive（App.vue:908-935）改为调用 `unloadSync()`：
```js
;(async () => {
  if (!store.cloudSettings.enabled || !isCloudConfigReady(store.cloudSettings) || store.cloudStatus.syncing) return
  if (getUnsyncedOperations().length === 0) return
  if (!store.cloudStatus.lastSyncAt) return
  try {
    await unloadSync()
    addOperationLog('cloud_sync', '关闭前 keepalive 上传保底成功', { localUpdatedAt: getLocalModifiedAt() })
  } catch (err) {
    addOperationLog('cloud_sync', '关闭前 keepalive 上传失败', { error: err.message })
  }
})()
```

`registerCloudSyncHandler` 内 `reason:'sync'` 分支透传 `keepalive`（App.vue:821 附近）：
```js
const result = await saveCloudState(store.cloudSettings, payload, {
  session: store.cloudSession,
  onSession: (session) => setCloudSession(session),
  makePublic: store.cloudSettings.publicRead,
  keepalive: Boolean(options?.keepalive),
})
```

- [ ] **Step 6: import 更新**（App.vue 顶部 store import 块，加 `hiddenSync, unloadSync`）

- [ ] **Step 7: 运行 store 全量测试**

Run: `npx vitest run src/data/store.test.js`
Expected: PASS

- [ ] **Step 8: 提交**

```bash
git add src/data/store.js src/data/store.test.js src/App.vue
git commit -m "feat: 盲写路径改走引擎 silent + keepalive 透传(B)"
```

---

### Task 4: A Tab 真实租约锁（shouldHoldLock + 全页遮罩）

**Files:**
- Modify: `src/utils/tabLease.js`（新增 `shouldHoldLock`）
- Modify: `src/utils/tabLease.test.js`（新增用例）
- Modify: `src/App.vue`（`tabLocked` 状态 + 遮罩模板 + 手动交互事件）

**Interfaces:**
- Consumes: `parseTabLease`（现有导出）、`TAB_LEASE_KEY`/`TAB_LEASE_TTL_MS`/`TAB_HEARTBEAT_MS`（现有）
- Produces: `shouldHoldLock(other, own, now = Date.now())` → `boolean`

- [ ] **Step 1: 写失败测试**（追加 `src/utils/tabLease.test.js`）

```js
import { shouldHoldLock } from './tabLease'

describe('shouldHoldLock（A 方案）', () => {
  const now = 1_000_000

  it('对方新鲜且 touch 更大 → 本页锁定', () => {
    const other = { id: 'tab-b', at: now, touch: 500 }
    const own = { id: 'tab-a', at: now, touch: 100 }
    expect(shouldHoldLock(other, own, now)).toBe(true)
  })

  it('自己 touch 更大 → 不锁定（自己活跃）', () => {
    const other = { id: 'tab-b', at: now, touch: 100 }
    const own = { id: 'tab-a', at: now, touch: 500 }
    expect(shouldHoldLock(other, own, now)).toBe(false)
  })

  it('touch 相等 → 不锁定（避免同时互锁）', () => {
    const other = { id: 'tab-b', at: now, touch: 300 }
    const own = { id: 'tab-a', at: now, touch: 300 }
    expect(shouldHoldLock(other, own, now)).toBe(false)
  })

  it('TTL 过期 → 不锁定', () => {
    const other = { id: 'tab-b', at: now - 6000, touch: 500 }
    const own = { id: 'tab-a', at: now, touch: 100 }
    expect(shouldHoldLock(other, own, now)).toBe(false)
  })

  it('同 id / 空 → 不锁定', () => {
    expect(shouldHoldLock({ id: 'tab-a', at: now, touch: 500 }, { id: 'tab-a', at: now, touch: 100 }, now)).toBe(false)
    expect(shouldHoldLock(null, { id: 'tab-a', at: now, touch: 100 }, now)).toBe(false)
    expect(shouldHoldLock({ id: 'tab-b', at: now, touch: 500 }, null, now)).toBe(false)
  })
})
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run src/utils/tabLease.test.js`
Expected: FAIL（shouldHoldLock is not a function）

- [ ] **Step 3: 实现 `shouldHoldLock`**（tabLease.js）

```js
/**
 * 判定本页是否被另一 tab 锁住（最后交互者持锁）。
 * 锁定条件：对方活跃（TTL 内）、非本页、对方 touch 严格大于本页。
 * return true 表示"本页应进入只读（遮罩）"。
 */
export function shouldHoldLock(other, own, now = Date.now()) {
  if (!other || !own) return false
  if (!other.id || other.id === own.id) return false
  if (!other.at || now - other.at > TAB_LEASE_TTL_MS) return false
  return other.touch > own.touch
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run src/utils/tabLease.test.js`
Expected: PASS

- [ ] **Step 5: App.vue 接入锁层**

新增状态与改写 `tabLeaseTick`（在现有 tabLease 相关代码块 `src/App.vue:194-256` 区）：

```js
const tabLocked = ref(false)

function tabLeaseTick() {
  const other = parseTabLease(localStorage.getItem(TAB_LEASE_KEY))
  const own = { id: TAB_ID, at: Date.now(), touch: lastTouch.value }
  localStorage.setItem(TAB_LEASE_KEY, JSON.stringify(own))
  tabLocked.value = shouldHoldLock(other, own)
}

function takeoverEditing() {
  bumpTabTouch()
}
```

import（App.vue 顶部 `./utils/tabLease` import 块）追加 `shouldHoldLock`。现有 `bumpTabTouch` 已存在（line ~206 区）。

手动交互事件：现有点击监听（`mousedown`/`keydown`）保留；`onMounted` 里的 `tabLeaseTick()` 初次调用覆盖 `tabLocked`。旧的 `otherTabEditing` 横幅逻辑保留不动（兼容既有 30s 静默提示），`tabLocked` 为新增独立通道。

- [ ] **Step 6: 模板追加遮罩**（`<template>` 根块内，现有双标签页横幅附近）

遮罩覆盖整个 viewport，自身 `pointer-events:none`（不挡滚动查看），仅卡片/按钮可点击（`pointer-events:auto`）：

```html
<Transition name="fade">
  <div
    v-if="tabLocked"
    class="fixed inset-0 z-40 flex items-center justify-center bg-black/30"
    style="pointer-events: none"
  >
    <div class="rounded-2xl bg-white p-6 shadow-xl text-center max-w-sm"
         style="pointer-events: auto">
      <i class="fa-solid fa-lock text-amber-500 text-2xl mb-2"></i>
      <p class="text-gray-800 font-medium mb-1">另一标签页正在编辑</p>
      <p class="text-sm text-gray-500 mb-4">本页已只读。对方可能有未保存操作，接管前请确认。</p>
      <button class="btn btn-primary" @click="takeoverEditing">接管编辑</button>
    </div>
  </div>
</Transition>
```

- [ ] **Step 7: 运行相关测试 + build**

Run: `npx vitest run src/utils/tabLease.test.js; npm run build`
Expected: 8+5 用例绿；build 通过

- [ ] **Step 8: 提交**

```bash
git add src/utils/tabLease.js src/utils/tabLease.test.js src/App.vue
git commit -m "feat: Tab 真实租约锁-最后交互者持锁+接管按钮(A)"
```

---

### Task 5: E1 修正 logReplay BARRIER 判定 + 消费 cloud_adopt_before

**Files:**
- Modify: `src/data/logReplay.js`（从 CAP/BARRIER 判定移除 message 正则 → 结构化 adoptId；加 `cloud_adopt_before` FULL + handler）
- Modify: `src/data/operationLogCompleteness.test.js`（追加新用例 + **更新既有"云端屏障"用例**）
- Modify: `src/data/operationLogDisplay.js`（`cloud_adopt_before` 元数据）

**Interfaces:**
- Consumes: `getAdoptBeforeById`（Task 1）；`LOG_REPLAY_CAPABILITY`/`CAP`/`INVERSE_HANDLERS`（现有）
- Produces: 无新导出；`LOG_REPLAY_CAPABILITY['cloud_adopt_before'] = CAP.FULL`

> **现有测试必须同步改**：`operationLogCompleteness.test.js:187-198` 的『云端下载覆盖本地的 cloud_sync 判定为屏障』依赖旧正则 `/下载|选择使用云端数据/`。新逻辑删除正则后，旧式 `cloud_sync` 变 NOOP 跳过（不可逆）。该测试需改为新行为断言。

- [ ] **Step 1: 更新既有"云端屏障"用例**（`operationLogCompleteness.test.js:187-198`）

原用例：
```js
it('云端下载覆盖本地的 cloud_sync 判定为屏障，纯同步不判定', () => {
  const a = addPurchaseItem({ name: '云端屏障', sid: 'JP-9601' })
  addOperationLog('cloud_sync', '用户选择使用云端数据', { cloudUpdatedAt: 'x', localUpdatedAt: 'y' })
  addOperationLog('cloud_sync', '内容一致，已对齐时间戳', { cloudUpdatedAt: 'x', localUpdatedAt: 'y' })
  deletePurchaseItem(a.id)

  const { state: rebuilt, barriers } = reconstructAtTime(captureState(), store.operationLogs, null)

  expect(barriers).toHaveLength(1)
  expect(barriers[0].message).toContain('使用云端数据')
  expect(rebuilt.items.find((x) => x.id === a.id)).toBeTruthy()
})
```

改为（BEFORE 结构化的旧式 cloud_sync 无 adoptId → 跳过而非屏障；纯同步也跳过）：
```js
it('旧式无 adoptId 的 cloud_sync → 跳过（不可逆），不再误判屏障', () => {
  const a = addPurchaseItem({ name: '云端屏障', sid: 'JP-9601' })
  addOperationLog('cloud_sync', '用户选择使用云端数据', { cloudUpdatedAt: 'x', localUpdatedAt: 'y' })
  addOperationLog('cloud_sync', '内容一致，已对齐时间戳', { cloudUpdatedAt: 'x', localUpdatedAt: 'y' })
  deletePurchaseItem(a.id)

  const { state: rebuilt, skipped, barriers } = reconstructAtTime(captureState(), store.operationLogs, null)

  // 不再因 message 正则误判屏障：两条 cloud_sync 均落入 skipped（不可逆但可继续回放）
  expect(barriers).toEqual([])
  expect(skipped.filter((s) => s.type === 'cloud_sync')).toHaveLength(2)
  // 跳过日志后仍继续回放 purchase_add，add + delete 净效果为商品不存在
  expect(rebuilt.items).toEqual([])
})
```

- [ ] **Step 2: 追加新用例**（`operationLogCompleteness.test.js` 底部新 describe；文件顶部 import 已含 `reconstructAtTime`/`LOG_REPLAY_CAPABILITY`，需追加 `appendAdoptBefore`（来自 `./adoptLog`））

```js
import { appendAdoptBefore, ADOPT_STORAGE_KEY } from './adoptLog'

describe('cloud_adopt_before 逆操作（E 方案）', () => {
  beforeEach(() => {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(ADOPT_STORAGE_KEY)
  })

  it('标记为 FULL 能力', () => {
    expect(LOG_REPLAY_CAPABILITY.cloud_adopt_before).toBe('full')
  })

  it('回放时按 adoptId 还原被采纳的槽位', () => {
    const adoptId = appendAdoptBefore({
      slot: 'items', before: [{ id: 'old', name: 'A' }], time: '2026-09-10T00:00:00Z',
    })
    const current = { items: [{ id: 'new', name: 'B' }] }
    const logs = [
      { id: 1, time: '2026-09-11T00:00:00Z', type: 'cloud_adopt_before', message: '采纳', detail: { adoptId, slot: 'items' } },
    ]
    const { state } = reconstructAtTime(current, logs, null)
    expect(state.items[0].name).toBe('A')
  })

  it('回放时序：target 时间点在采纳之后 → 不还原', () => {
    const adoptId = appendAdoptBefore({
      slot: 'items', before: [{ id: 'old', name: 'A' }], time: '2026-09-01T00:00:00Z',
    })
    const current = { items: [{ id: 'new', name: 'B' }] }
    const logs = [
      { id: 2, time: '2026-09-10T00:00:00Z', type: 'cloud_adopt_before', message: '采纳', detail: { adoptId, slot: 'items' } },
    ]
    const { state } = reconstructAtTime(current, logs, '2026-09-11T00:00:00Z')
    expect(state.items[0].name).toBe('B')
  })

  it('嵌套槽位 finance.records 还原到扁平字段', () => {
    const adoptId = appendAdoptBefore({
      slot: 'finance.records', before: [{ id: 'r1', item: '旧记录', type: 'expense', amount: 10 }], time: '2026-09-10T00:00:00Z',
    })
    const current = { items: [], calc: {}, financeRecords: [{ id: 'r1', item: '新记录', type: 'expense', amount: 99 }], loanRecords: [], transfers: [] }
    const logs = [
      { id: 1, time: '2026-09-11T00:00:00Z', type: 'cloud_adopt_before', message: '采纳', detail: { adoptId, slot: 'finance.records' } },
    ]
    const { state } = reconstructAtTime(current, logs, null)
    expect(state.financeRecords[0].amount).toBe(10)
  })
})
```

> 注意：`beforeEach(() => stubEnv())` 已在文件顶层（line 31-35），它 stub 了 localStorage 为 `getItem: () => null`。但 `appendAdoptBefore` 要 `setItem` 再 `getItem` 回读——`stubEnv` 的 `getItem: vi.fn(() => null)` 会让回读拿不到刚写入的数据。**必须**在新 describe 内重设 localStorage 为内存 map（复用 appendAdoptBefore 测试的 `removeItem`+真实存储，或像 `setupCloudEnv` 用 map）。

> 修正：`stubEnv` 的 `getItem: vi.fn(() => null)` 是常量 null，`appendAdoptBefore` 写入后 `getAdoptBeforeById` 读不到 → 用例失败。**解法**：新 describe 的 `beforeEach` 用 `vi.stubGlobal('localStorage', memStorage())` 覆盖：

```js
function memStorage() {
  const map = new Map()
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    clear: () => map.clear(),
  }
}
```

并把新 describe 的 `beforeEach` 改为：
```js
beforeEach(() => {
  vi.stubGlobal('localStorage', memStorage())
  loadData({})
  clearOperationLogs()
})
```

- [ ] **Step 3: 运行确认失败**

Run: `npx vitest run src/data/operationLogCompleteness.test.js -t "cloud_adopt_before"`
Expected: 既有"云端屏障"用例 FAIL（因正则删除）+ 新用例 FAIL（类型未 FULL 且 handler 缺失）

- [ ] **Step 4: 实现 logReplay**（`logReplay.js`）

顶部 import：
```js
import { getAdoptBeforeById } from './adoptLog'
```

能力表加：
```js
cloud_adopt_before: CAP.FULL,
```

INVERSE_HANDLERS 加：
```js
cloud_adopt_before: (state, d) => {
  const record = getAdoptBeforeById(d?.adoptId)
  if (!record || record.before === null || record.before === undefined) return
  applyAdoptRestore(state, record.slot, record.before)
},
```

新增槽位→扁平字段映射与还原辅助（文件内）：
```js
// reconstructAtTime 的 state 是扁平结构：items / calc / financeRecords / loanRecords / transfers
// 而 adoptLog 的 slot 是嵌套路径（finance.records / rushcar.entries …）。
// 此处把嵌套槽位名映射到 logReplay 能操作的扁平字段；无法映射的跳过。
const SLOT_TO_FLAT = {
  items: 'items',
  calc: 'calc',
  'finance.records': 'financeRecords',
  'finance.loans': 'loanRecords',
  transfers: 'transfers',
}

function applyAdoptRestore(state, slot, before) {
  const flat = SLOT_TO_FLAT[slot]
  if (!flat || !(flat in state)) return
  state[flat] = JSON.parse(JSON.stringify(before))
}
```

> 说明：`rushcar.*` 三个槽位在 logReplay 中无逆操作 handler，不在 `SLOT_TO_FLAT` 内 → 该槽位的 `cloud_adopt_before` 还原时被跳过（接受，与"旧日志不可逆"同等待遇）。如需支持美淘回溯，属后续独立任务，不在本计划范围。

删掉 `reconstructAtTime` 中旧的 message 正则 BARRIER 分支（`logReplay.js:384-387`）：
```js
// 删除：if (type === 'cloud_sync' && /下载|选择使用云端数据/.test(String(log.message || ''))) { ... }
```

> 保留 `cloud_sync` 在 CAP 表为 NOOP；`cloud_pull`/`app_import`/`app_undo`/`app_redo` 维持 BARRIER。旧日志（无 adoptId、before 区无数据）的 `cloud_sync` 走 NOOP 跳过（接受不可逆），符合 spec"旧日志维持不可逆"。

- [ ] **Step 5: 运行确认通过**

Run: `npx vitest run src/data/operationLogCompleteness.test.js`
Expected: PASS（更新后既有用例 + 新增 4 用例）

- [ ] **Step 6: operationLogDisplay.js 补充元数据**（使操作日志列表可读）

```js
cloud_adopt_before: { label: '云端采纳备份', color: 'text-cyan-600', icon: 'fa-solid fa-floppy-disk', pillClass: 'bg-cyan-100 text-cyan-700' },
```

（LOG_TYPE_META 对象内，line 9-49 区追加。）

- [ ] **Step 7: 提交**

```bash
git add src/data/logReplay.js src/data/operationLogCompleteness.test.js src/data/operationLogDisplay.js
git commit -m "feat: 回溯引擎消费 cloud_adopt_before 还原采纳前槽位(E1)"
```

---

### Task 6: E2 回溯 UI（操作日志模态框内"数据回溯"区块）

**Files:**
- Modify: `src/App.vue`
- Modify: `src/data/operationLogDisplay.js`（追加 `app_history_restore` 元数据）

**Interfaces:**
- Consumes: `reconstructAtTime`（Task 5）、`computeConflictDiff`（`store.js:753`）、现有 `getLogBrief`/`getLogDetailSections`
- Produces: 模板内"数据回溯"区块；`handleRestoreFromHistory(targetTime, targetState)`

> **UI 落点说明（实测修正）**：本应用没有独立"设置页 tab"；操作日志位于 `showLogsModal` 模态框（App.vue:1284）。因此"回溯 UI"入口放在**操作日志模态框 header** 的"数据回溯"按钮。

- [ ] **Step 1: 写失败测试**（`store.test.js`——需在顶部 store import 块追加 `addOperationLog`、`clearOperationLogs`；beforeEach 里 `clearOperationLogs()` 确保空日志）

```js
describe('回溯恢复落日志（E 方案）', () => {
  beforeEach(() => {
    loadData({})
    clearOperationLogs()
  })

  it('恢复时写入 app_history_restore 日志', () => {
    addOperationLog('app_history_restore', '恢复数据到 2026-09-10 状态', { targetTime: '2026-09-10T00:00:00Z' })
    expect(state.operationLogs[0].type).toBe('app_history_restore')
  })
})
```

（该用例本身通过，用于锁定 `app_history_restore` 类型被 `addOperationLog` 接受。）

- [ ] **Step 2: 运行确认**

Run: `npx vitest run src/data/store.test.js -t "app_history_restore"`
Expected: PASS

- [ ] **Step 3: App.vue 新增回溯状态与数据源**

imports 追加：
```js
import { reconstructAtTime } from './data/logReplay'
```
（`computeConflictDiff` 已在 App.vue:20 导入。）

在 `showLogsModal` 附近加：
```js
const showHistoryRestore = ref(false)
const historyTargetTime = ref('')
const historyDiff = ref([])
const historyTargetState = ref(null)

// reconstructAtTime 的输出是扁平结构（financeRecords/loanRecords），
// 需转换为 exportData() 的嵌套 payload 形状，才能喂给 computeConflictDiff / applyCloudDataToStore
function replayStateToPayload(state) {
  const src = state || {}
  const calc = src.calc && typeof src.calc === 'object' ? src.calc : {}
  return {
    items: Array.isArray(src.items) ? src.items : [],
    calc,
    finance: {
      records: Array.isArray(src.financeRecords) ? src.financeRecords : [],
      loans: Array.isArray(src.loanRecords) ? src.loanRecords : [],
    },
    transfers: Array.isArray(src.transfers) ? src.transfers : [],
    rushcar: src.rushcar && typeof src.rushcar === 'object' ? src.rushcar : {},
    updatedAt: src.updatedAt || '',
    _rev: src._rev && typeof src._rev === 'object' ? src._rev : {},
  }
}

function buildHistoryTimeline() {
  return store.operationLogs.map((log) => ({
    id: log.id,
    time: log.time,
    type: log.type,
    message: getLogBrief(log),
  }))
}

function computeHistoryDiff(targetTime) {
  const { state: prior, barriers, skipped } = reconstructAtTime(exportData(), store.operationLogs, targetTime)
  if (barriers.length > 0) {
    historyTargetState.value = null
    historyDiff.value = []
    alert('该时间点之前存在不可逆操作（导入/撤销/清空），无法精确还原。')
    return
  }
  const priorPayload = replayStateToPayload(prior)
  const diff = computeConflictDiff(priorPayload, exportData())
  historyTargetState.value = priorPayload
  historyTargetTime.value = targetTime
  historyDiff.value = diff.entries || []
  void skipped
}

function handleRestoreFromHistory() {
  if (!historyTargetState.value) return
  if (!confirm('将当前数据恢复到所选时间点（会同步至云端），是否继续？')) return
  applyCloudDataToStore(historyTargetState.value, { trackHistory: true })
  addOperationLog('app_history_restore', `恢复数据到 ${new Date(historyTargetTime.value).toLocaleString()}`, {
    targetTime: historyTargetTime.value,
  })
  showHistoryRestore.value = false
}
```

- [ ] **Step 4: 模板-在操作日志模态框 header 加入口按钮**（App.vue:1290 撤销/重做按钮旁）

```html
<button class="btn btn-outline btn-sm" @click="showHistoryRestore = true">数据回溯</button>
```

- [ ] **Step 5: 模板-回溯区块**（操作日志模态框内容区条件渲染，`showLogsModal` 内容底部）

```html
<div v-if="showHistoryRestore" class="px-4 py-4 border-b border-gray-100">
  <div class="flex items-center justify-between mb-3">
    <h4 class="font-bold text-lg">数据回溯</h4>
    <button class="text-xs text-gray-500 hover:text-gray-700" @click="showHistoryRestore = false">关闭</button>
  </div>
  <p class="text-sm text-gray-500 mb-3">选择一个历史时间点，查看当时的差异摘要并可恢复。</p>
  <select class="apple-select w-full mb-3" v-model="historyTargetTime" @change="computeHistoryDiff(historyTargetTime)">
    <option value="">选择时间点…</option>
    <option v-for="t in buildHistoryTimeline()" :key="t.id" :value="t.time">
      {{ new Date(t.time).toLocaleString() }} · {{ t.message }}
    </option>
  </select>
  <div v-if="historyDiff.length" class="text-xs text-gray-600 space-y-1">
    <div v-for="(e, i) in historyDiff.slice(0, 20)" :key="i"
         class="flex items-start gap-2 border-b border-gray-50 pb-1">
      <span class="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium"
            :class="e.kind === 'localOnly' ? 'bg-red-100 text-red-700' :
                    e.kind === 'cloudOnly' ? 'bg-green-100 text-green-700' :
                    'bg-blue-100 text-blue-700'">
        {{ e.kind === 'localOnly' ? '将删除' : e.kind === 'cloudOnly' ? '将新增' : '将修改' }}
      </span>
      <span>{{ e.collectionLabel }} · {{ e.recordLabel }}</span>
    </div>
  </div>
  <button class="btn btn-primary btn-sm mt-3" :disabled="!historyTargetState" @click="handleRestoreFromHistory">
    恢复到所选时间点
  </button>
</div>
```

> `historyDiff` 展示 `computeConflictDiff` 的 entries（含 `kind: 'modified'|'localOnly'|'cloudOnly'`、`collectionLabel`/`recordLabel`），实现"按槽位/记录列出新增/删除/改动了几条"。若需字段级明细，后续可展开 `e.summary`。

- [ ] **Step 6: operationLogDisplay.js 追加元数据**

```js
app_history_restore: { label: '历史恢复', color: 'text-purple-600', icon: 'fa-solid fa-clock-rotate-left', pillClass: 'bg-purple-100 text-purple-700' },
```

- [ ] **Step 7: 全量测试 + build**

Run: `npm test`
Expected: 全绿（约 145+，含新增用例）

Run: `npm run build`
Expected: 通过

- [ ] **Step 8: 提交**

```bash
git add src/App.vue src/data/store.test.js src/data/operationLogDisplay.js
git commit -m "feat: 数据回溯时间轴+差异摘要+恢复(E2)"
```

---

### Task 7: 收尾核验

**Files:**
- 无新代码

**职责:** 全量回归 + 核对验收标准

- [ ] **Step 1: 全量测试**

Run: `npm test`
Expected: 全绿

- [ ] **Step 2: 构建**

Run: `npm run build`
Expected: 通过

- [ ] **Step 3: 逐条核对验收标准**（对照 spec）

| 验收项 | 对应 Task | 自检 |
|---|---|---|
| 1. 双 tab 仅 active 可编辑，遮罩+接管按钮 | Task 4 | — |
| 2. 手机旧缓存切走不回滚云端；重开正常检测 | Task 3 | — |
| 3. 采纳云端后 `ysp_adopt_before` 有 before；回溯可还原 | Task 1 + 5 | — |
| 4. 导入无确认不放行；可回溯至导入前 | Task 2 | — |
| 5. 现有 139+ 用例全绿；build 通过 | Step 1-2 | — |
| 6. Supabase/RLS/手机页/`car` 零改动 | 全程 | grep 确认 |

- [ ] **Step 4: 提交（如有残留）**

```bash
git status --short
git add -A && git commit -m "chore: C3 收尾核验"
```

---

## 风险与回滚

| 风险 | 缓解 |
|---|---|
| `keepalive` 透传后 beforeunload 超时 | keepalive 请求本就尽力而为；失败静默，启动检测兜底 |
| `ysp_adopt_before` 存储增长 | `pruneAdoptBefore(365d)`；append 时去重 |
| 遮罩误伤查看 | 遮罩 `pointer-events:none`，仅按钮可点；不阻挡页面读取 |
| reconstructAtTime 遇 BARRIER | UI 显示"不可精确还原"（alert + 空 diff） |
| `applyCloudDataToStore` 落档顺序错误 | `exportData()` 在 `loadData` 前抓取（Task 1 Step 6 关键点）；store.test 覆盖采纳流程 |
| 测试环境无 localStorage | adoptLog 全部 try/catch 降级为空数组；测试用 vitest happy-dom/storage 模拟 |