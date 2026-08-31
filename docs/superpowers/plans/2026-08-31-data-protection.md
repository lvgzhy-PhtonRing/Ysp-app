# 数据保护三件套（详细日志 + 覆盖强提示 + 每日备份）实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 防止 2026-08-28 云数据覆盖事故重演：A) 操作日志更详细可恢复，B) 覆盖本地前检测云端重大异常并强提示，C) 每日自动下载完整备份（含操作日志）。

**Architecture:** 新增 `src/services/dataProtection.js`（纯函数 `shouldWarnBeforeOverwrite` / `isBackupDue` / `buildSyncRationale` + DOM 下载薄壳 `downloadJsonBackup`）。接线三处：`store.js` 的 `saveToLocalStorage` 触发每日备份（C）；`App.vue` 的 `loadCloudOnStartup` 两处"云端覆盖本地"前拦截（B）；各模块日志调用点补 detail 字段（A）。

**Tech Stack:** Vue 3（Composition API）、vitest、localStorage（`ysp_data` / `ysp_ui`）、Supabase REST（云同步）。

> **与 spec 的一处偏差（已定）**：spec 架构中的 `operationLogger.js` 独立 helper **移除**。各调用点的 before/after 仅 1~2 行内联即可，通用字段差异 helper 属于多余抽象（遵循"简洁优先"）。所有纯函数集中到 `dataProtection.js`。

---

## 文件结构

| 文件 | 动作 | 职责 |
|---|---|---|
| `src/services/dataProtection.js` | 新建 | 纯函数：覆盖警告检测、备份判断、同步决策依据、下载薄壳 |
| `src/services/dataProtection.test.js` | 新建 | 上述纯函数单测 |
| `src/data/store.js` | 修改 | `autoBackup` 状态 + 持久化 + `maybeAutoBackup` 触发点 |
| `src/App.vue` | 修改 | B 强提示弹窗 + 两处拦截、C 备份 toast、A4 cloud_conflict 决策依据 |
| `src/modules/sales/useSales.js` | 修改 | A2 `sales_submit` detail 增强 |
| `src/modules/purchase/usePurchase.js` | 修改 | A2+A3 `purchase_add/transfer/to_inventory/batch/delete` 增强 |
| `src/modules/purchase/PurchaseModule.vue` | 修改 | A2 `purchase_add`（购买组）与 `purchase_group_edit` 增强 |
| `src/modules/inventory/InventoryModule.vue` | 修改 | A2 `inventory_unlist` 增强 |
| `src/data/store.test.js` | 修改 | `autoBackup` 持久化测试 |

---

## Task 1: dataProtection.js — `shouldWarnBeforeOverwrite`

**Files:**
- Create: `src/services/dataProtection.js`
- Test: `src/services/dataProtection.test.js`

- [ ] **Step 1: Write the failing test**

Create `src/services/dataProtection.test.js`:

```js
import { describe, expect, it } from 'vitest'
import { shouldWarnBeforeOverwrite } from './dataProtection'

function payload(items, saleDates = {}) {
  // saleDates: { sid: 'YYYY-MM-DD' }
  return {
    items: items.map((sid) => ({
      sid,
      name: sid,
      saleDetails: saleDates[sid] ? { date: saleDates[sid] } : null,
    })),
  }
}

describe('shouldWarnBeforeOverwrite', () => {
  it('数量相等时不警告', () => {
    const local = payload(['a', 'b', 'c'])
    const cloud = payload(['a', 'b', 'c'])
    expect(shouldWarnBeforeOverwrite(local, cloud).shouldWarn).toBe(false)
  })

  it('云端比本地多时不警告', () => {
    const local = payload(['a', 'b', 'c'])
    const cloud = payload(['a', 'b', 'c', 'd', 'e'])
    expect(shouldWarnBeforeOverwrite(local, cloud).shouldWarn).toBe(false)
  })

  it('少 5 条及以上触发警告（本地 100 → 云端 94）', () => {
    const local = payload(Array.from({ length: 100 }, (_, i) => `l${i}`))
    const cloud = payload(Array.from({ length: 94 }, (_, i) => `l${i}`))
    const r = shouldWarnBeforeOverwrite(local, cloud)
    expect(r.shouldWarn).toBe(true)
    expect(r.countDiff).toBe(6)
    expect(r.reasons.join()).toContain('少 6 条')
  })

  it('少 10% 触发警告（本地 100 → 云端 89）', () => {
    const local = payload(Array.from({ length: 100 }, (_, i) => `l${i}`))
    const cloud = payload(Array.from({ length: 89 }, (_, i) => `l${i}`))
    expect(shouldWarnBeforeOverwrite(local, cloud).shouldWarn).toBe(true)
  })

  it('少 5 条且不足 10% 不警告（本地 100 → 云端 95）', () => {
    const local = payload(Array.from({ length: 100 }, (_, i) => `l${i}`))
    const cloud = payload(Array.from({ length: 95 }, (_, i) => `l${i}`))
    expect(shouldWarnBeforeOverwrite(local, cloud).shouldWarn).toBe(false)
  })

  it('时间倒流触发警告（云端最后销售早于本地）', () => {
    const local = payload(['a', 'b'], { b: '2026-08-26' })
    const cloud = payload(['a', 'b'], { b: '2026-08-25' })
    const r = shouldWarnBeforeOverwrite(local, cloud)
    expect(r.shouldWarn).toBe(true)
    expect(r.reasons.join()).toContain('最后销售日期早于本地')
    expect(r.lastSaleLocal).toBe('2026-08-26')
    expect(r.lastSaleCloud).toBe('2026-08-25')
  })

  it('时间相同不触发时间倒流', () => {
    const local = payload(['a'], { a: '2026-08-26' })
    const cloud = payload(['a'], { a: '2026-08-26' })
    expect(shouldWarnBeforeOverwrite(local, cloud).shouldWarn).toBe(false)
  })

  it('任一侧无销售记录不触发时间倒流', () => {
    const local = payload(['a'])
    const cloud = payload(['a'], { a: '2026-08-26' })
    expect(shouldWarnBeforeOverwrite(local, cloud).shouldWarn).toBe(false)
  })

  it('本地空商品不警告（首次同步）', () => {
    const local = payload([])
    const cloud = payload(['a', 'b', 'c'])
    expect(shouldWarnBeforeOverwrite(local, cloud).shouldWarn).toBe(false)
  })

  it('云端空商品触发警告', () => {
    const local = payload(Array.from({ length: 20 }, (_, i) => `l${i}`))
    const cloud = payload([])
    expect(shouldWarnBeforeOverwrite(local, cloud).shouldWarn).toBe(true)
  })

  it('items 缺失时不警告', () => {
    expect(shouldWarnBeforeOverwrite({}, {}).shouldWarn).toBe(false)
    expect(shouldWarnBeforeOverwrite({ items: 'not-array' }, { items: ['a'] }).shouldWarn).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/services/dataProtection.test.js`
Expected: FAIL with "Cannot find module './dataProtection'"

- [ ] **Step 3: Write minimal implementation**

Create `src/services/dataProtection.js`:

```js
// 数据保护纯函数：覆盖警告检测、每日备份判断、同步决策依据
// 与 DOM / 同步协议解耦，便于单测

export const OVERWRITE_THRESHOLD_MIN = 5 // 云端至少比本地少多少条才警告
export const OVERWRITE_THRESHOLD_RATIO = 0.1 // 或达到本地数量的 10%（取较大者）

function itemCount(payload) {
  return Array.isArray(payload?.items) ? payload.items.length : null
}

function lastSaleDate(payload) {
  if (!Array.isArray(payload?.items)) return ''
  let latest = ''
  for (const item of payload.items) {
    const d = item?.saleDetails?.date
    if (typeof d === 'string' && d && d > latest) latest = d
  }
  return latest
}

/**
 * 检测"云端覆盖本地"前是否应警告。
 * 触发条件：云端商品数比本地少 ≥ max(5, 本地×10%)，或云端最后销售日期早于本地。
 * @returns {{ shouldWarn: boolean, reasons: string[], countDiff: number, lastSaleLocal: string, lastSaleCloud: string }}
 */
export function shouldWarnBeforeOverwrite(localPayload, cloudPayload) {
  const reasons = []
  const localCount = itemCount(localPayload)
  const cloudCount = itemCount(cloudPayload)
  const lastSaleLocal = lastSaleDate(localPayload)
  const lastSaleCloud = lastSaleDate(cloudPayload)

  if (localCount !== null && cloudCount !== null) {
    const minReduction = Math.max(OVERWRITE_THRESHOLD_MIN, Math.floor(localCount * OVERWRITE_THRESHOLD_RATIO))
    const reduction = localCount - cloudCount
    if (reduction >= minReduction) {
      reasons.push(`云端商品数比本地少 ${reduction} 条（本地 ${localCount} → 云端 ${cloudCount}）`)
    }
  }

  if (lastSaleLocal && lastSaleCloud && lastSaleCloud < lastSaleLocal) {
    reasons.push(`云端最后销售日期早于本地（本地 ${lastSaleLocal} → 云端 ${lastSaleCloud}）`)
  }

  return {
    shouldWarn: reasons.length > 0,
    reasons,
    countDiff: localCount !== null && cloudCount !== null ? localCount - cloudCount : 0,
    lastSaleLocal,
    lastSaleCloud,
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/services/dataProtection.test.js`
Expected: PASS (11 tests)

- [ ] **Step 5: Commit**

```bash
git add src/services/dataProtection.js src/services/dataProtection.test.js
git commit -m "feat: 云覆盖前警告检测纯函数 shouldWarnBeforeOverwrite"
```

---

## Task 2: dataProtection.js — `isBackupDue` + `buildSyncRationale`

**Files:**
- Modify: `src/services/dataProtection.js`
- Test: `src/services/dataProtection.test.js`

- [ ] **Step 1: Add failing tests**

Append to `src/services/dataProtection.test.js`:

```js
import { buildSyncRationale, isBackupDue } from './dataProtection'

describe('isBackupDue', () => {
  it('同日不备份', () => {
    expect(isBackupDue('2026-08-31', '2026-08-31')).toBe(false)
  })
  it('跨日需备份', () => {
    expect(isBackupDue('2026-09-01', '2026-08-31')).toBe(true)
  })
  it('从未备份需备份', () => {
    expect(isBackupDue('2026-08-31', '')).toBe(true)
  })
})

describe('buildSyncRationale', () => {
  it('把警告结果映射为同步决策依据字段', () => {
    const warn = {
      shouldWarn: true,
      reasons: ['原因一'],
      countDiff: 6,
      lastSaleLocal: '2026-08-26',
      lastSaleCloud: '2026-08-25',
    }
    expect(buildSyncRationale(warn)).toEqual({
      countDiff: 6,
      lastSaleBefore: '2026-08-26',
      lastSaleAfter: '2026-08-25',
      reasons: ['原因一'],
    })
  })
  it('无警告时字段仍完整', () => {
    expect(buildSyncRationale({})).toEqual({
      countDiff: 0,
      lastSaleBefore: '',
      lastSaleAfter: '',
      reasons: [],
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/services/dataProtection.test.js`
Expected: FAIL with "isBackupDue is not defined"

- [ ] **Step 3: Implement**

Append to `src/services/dataProtection.js`:

```js
/** 是否该触发今日自动备份（今日未备份过则触发） */
export function isBackupDue(todayStr, lastBackupDate) {
  return lastBackupDate !== todayStr
}

/**
 * 将覆盖警告结果映射为 cloud_conflict 日志的决策依据字段。
 * 字段名对齐 spec：countDiff / lastSaleBefore / lastSaleAfter / reasons。
 */
export function buildSyncRationale(warn) {
  return {
    countDiff: warn?.countDiff ?? 0,
    lastSaleBefore: warn?.lastSaleLocal ?? '',
    lastSaleAfter: warn?.lastSaleCloud ?? '',
    reasons: Array.isArray(warn?.reasons) ? warn.reasons : [],
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/services/dataProtection.test.js`
Expected: PASS (all tests)

- [ ] **Step 5: Commit**

```bash
git add src/services/dataProtection.js src/services/dataProtection.test.js
git commit -m "feat: 备份判断与同步决策依据纯函数 isBackupDue/buildSyncRationale"
```

---

## Task 3: dataProtection.js — `downloadJsonBackup`

**Files:**
- Modify: `src/services/dataProtection.js`

DOM 薄壳（浏览器 Blob 下载），vitest 无 DOM 环境不单测，用 `npm run build` 验证。

- [ ] **Step 1: Implement**

Append to `src/services/dataProtection.js`:

```js
/**
 * 下载 JSON 备份到浏览器 Downloads。
 * 非用户手势调用可能被浏览器静默拦截（调用方需提供手动下载兜底入口）。
 * @returns {boolean} 是否真正触发了下载（无 document 时返回 false）
 */
export function downloadJsonBackup(data, filename) {
  if (typeof document === 'undefined') return false
  try {
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    return true
  } catch (err) {
    console.error('[autoBackup] 下载失败:', err)
    return false
  }
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: build succeeds, no lint error

- [ ] **Step 3: Commit**

```bash
git add src/services/dataProtection.js
git commit -m "feat: JSON 备份下载薄壳 downloadJsonBackup"
```

---

## Task 4: store.js — `autoBackup` 状态与持久化

**Files:**
- Modify: `src/data/store.js:132-157, 876-887, 889-913`
- Test: `src/data/store.test.js`

- [ ] **Step 1: Write failing test**

Append to `src/data/store.test.js`:

```js
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  computeConflictDiff,
  exportData,
  isContentEqual,
  loadData,
  loadUiStateFromLocalStorage,
  saveUiStateToLocalStorage,
  stableSerialize,
  state,
} from './store'

describe('autoBackup 持久化', () => {
  it('保存并恢复 lastDate / lastNotice', () => {
    const storeMap = new Map()
    vi.stubGlobal('localStorage', {
      getItem: (k) => (storeMap.has(k) ? storeMap.get(k) : null),
      setItem: (k, v) => storeMap.set(k, String(v)),
      removeItem: (k) => storeMap.delete(k),
    })

    state.autoBackup.lastDate = '2026-08-31'
    state.autoBackup.lastNotice = '2026-08-31'
    saveUiStateToLocalStorage()
    state.autoBackup.lastDate = ''
    state.autoBackup.lastNotice = ''
    loadUiStateFromLocalStorage()

    expect(state.autoBackup.lastDate).toBe('2026-08-31')
    expect(state.autoBackup.lastNotice).toBe('2026-08-31')
    vi.unstubAllGlobals()
  })
})
```

> 注意：需要把 `state` 加入 store.test.js 顶部的 import 行（现有 import 无 state）。同时把顶部 `import { beforeEach, describe, expect, it } from 'vitest'` 改为含 `vi`。

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/data/store.test.js`
Expected: FAIL — `state.autoBackup` 为 undefined（Cannot read properties of undefined）

- [ ] **Step 3: Implement**

在 `src/data/store.js` 的 `state` 定义（第 155 行 `operationLogs: []` 之后）增加：

```js
  operationLogs: [],
  autoBackup: {
    lastDate: '', // 最近一次自动备份日期（YYYY-MM-DD），一日一次
    lastNotice: '', // 最近一次生成备份的日期，App.vue 据此显示手动下载提示
  },
  snapshots: [],
```

在 `saveUiStateToLocalStorage()`（第 876 行）的 payload 中增加：

```js
    operationLogs: [...state.operationLogs],
    autoBackup: { ...state.autoBackup },
  }
```

在 `loadUiStateFromLocalStorage()`（第 913 行 `replaceArray(state.operationLogs, ...)` 之后）增加：

```js
  if (parsed?.autoBackup && typeof parsed.autoBackup === 'object') {
    Object.assign(state.autoBackup, {
      lastDate: typeof parsed.autoBackup.lastDate === 'string' ? parsed.autoBackup.lastDate : '',
      lastNotice: typeof parsed.autoBackup.lastNotice === 'string' ? parsed.autoBackup.lastNotice : '',
    })
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/data/store.test.js`
Expected: PASS（原有用例 + 新增 autoBackup 用例）

- [ ] **Step 5: Commit**

```bash
git add src/data/store.js src/data/store.test.js
git commit -m "feat: autoBackup 状态（lastDate/lastNotice）与 ysp_ui 持久化"
```

---

## Task 5: store.js — `maybeAutoBackup` 每日备份触发

**Files:**
- Modify: `src/data/store.js:474-496`（`saveToLocalStorage` 末尾）

接线 C 方向：每次保存时检查今日是否已备份，未备份则下载完整数据（含操作日志）。

- [ ] **Step 1: Implement `maybeAutoBackup`**

在 `saveToLocalStorage` 函数定义之前新增：

```js
/**
 * 每日自动备份：今日首次保存时下载一份完整数据（含操作日志）到 Downloads。
 * 仅在页面可见时触发（后台静默兜底上传不触发，避免被浏览器拦截）。
 * 自动下载可能被浏览器静默拦截，lastNotice 记录本次生成，供界面显示手动下载入口兜底。
 */
function maybeAutoBackup() {
  if (typeof document === 'undefined') return
  if (document.visibilityState && document.visibilityState !== 'visible') return
  const today = todayDateStr()
  if (!isBackupDue(today, state.autoBackup.lastDate)) return

  const payload = { ...exportData(), operationLogs: [...state.operationLogs] }
  downloadJsonBackup(payload, `饮食派数据_${today}.json`)

  state.autoBackup.lastDate = today
  state.autoBackup.lastNotice = today
  saveUiStateToLocalStorage()
  addOperationLog('app_auto_backup', `已生成每日备份 饮食派数据_${today}.json`, { date: today })
}
```

- [ ] **Step 2: Wire into `saveToLocalStorage`**

在 `saveToLocalStorage()` 末尾（`scheduleCloudSync()` 之后）增加一行：

```js
  localStorage.setItem('ysp_data', serialized)
  setPersistedSnapshot(currentData)
  scheduleCloudSync()
  maybeAutoBackup()
}
```

- [ ] **Step 3: Add imports**

`src/data/store.js` 顶部 import 区增加：

```js
import { downloadJsonBackup, isBackupDue } from '../services/dataProtection'
```

> 若 store.js 已是 `import { ... } from '../services/cloudStore'` 的写法，紧随其后新增一行即可。注意 `addOperationLog` 在 `maybeAutoBackup` 中调用——它定义于文件内（函数提升不适用，但 `maybeAutoBackup` 只在 `saveToLocalStorage` 运行时才调用，届时 `addOperationLog` 已定义，安全）。

- [ ] **Step 4: Verify build & 现有测试**

Run: `npm run build && npm test`
Expected: 均通过（vitest 无 DOM 环境，`maybeAutoBackup` 因 `document` 未定义直接 return，不抛错）

- [ ] **Step 5: Commit**

```bash
git add src/data/store.js
git commit -m "feat: 每日自动备份 saveToLocalStorage 触发（含操作日志）"
```

---

## Task 6: App.vue — 覆盖强提示弹窗（B 对话框）

**Files:**
- Modify: `src/App.vue:293-336`（在 cloudConflict 相关 ref/函数旁）

- [ ] **Step 1: Add refs + dialog promise**

在 `src/App.vue` 的 `cloudConflictResolver` 声明（第 295 行）之后新增：

```js
// 云端覆盖本地前的重大异常强提示（B 方向）
const overwriteWarn = ref(false)
const overwriteWarnInfo = ref({ reasons: [], countLocal: 0, countCloud: 0, lastSaleLocal: '', lastSaleCloud: '' })
let overwriteWarnResolver = null

function askOverwriteWarn(info) {
  overwriteWarnInfo.value = info
  overwriteWarn.value = true
  return new Promise((resolve) => {
    overwriteWarnResolver = resolve
  })
}

function resolveOverwriteWarn(choice) {
  overwriteWarn.value = false
  if (typeof overwriteWarnResolver === 'function') {
    overwriteWarnResolver(choice)
    overwriteWarnResolver = null
  }
}
```

- [ ] **Step 2: Add modal template**

在 cloudConflict 的 `GlassModal`（约第 889 行）之后新增：

```vue
    <GlassModal v-model="overwriteWarn" panel-class="w-full max-w-md p-6 relative" :close-on-overlay="false">
      <h3 class="mb-2 text-lg font-semibold text-red-600">⚠️ 云端数据疑似异常</h3>
      <p class="mb-3 text-sm text-gray-600">检测到云端数据比本地少或更旧，用云端覆盖本地可能丢失本地改动：</p>
      <ul class="mb-4 space-y-1.5 text-sm text-gray-700">
        <li v-for="(r, i) in overwriteWarnInfo.reasons" :key="i" class="rounded bg-red-50 px-2 py-1">• {{ r }}</li>
      </ul>
      <div class="grid gap-2">
        <button class="btn btn-outline w-full" @click="resolveOverwriteWarn('overwrite')">仍用云端覆盖本地</button>
        <button class="btn btn-primary w-full" @click="resolveOverwriteWarn('keep')">保留本地数据（推荐）</button>
      </div>
    </GlassModal>
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: build 成功，无模板/语法错误

- [ ] **Step 4: Commit**

```bash
git add src/App.vue
git commit -m "feat: 云端覆盖前重大异常强提示弹窗"
```

---

## Task 7: App.vue — `loadCloudOnStartup` 两处拦截（B 主逻辑）

**Files:**
- Modify: `src/App.vue:581-656`（`loadCloudOnStartup`）

- [ ] **Step 1: Import 纯函数**

`src/App.vue` import 区增加（与现有 `cloudStore` import 并列）：

```js
import { shouldWarnBeforeOverwrite, buildSyncRationale } from './services/dataProtection'
```

- [ ] **Step 2: 修改 `loadCloudOnStartup`**

将第 597 行注释下方的内容局部替换。先把 `localTs > cloudTs` 分支里 `const localPayload = exportData()` 之后、`askCloudConflict` 之前的位置插入 warn 计算；再改 `choice === 'cloud'` 分支；最后改静默覆盖分支。

**替换 1 — 计算 warn（`askCloudConflict` 调用之前）**：

原代码（约 613-614）：
```js
      const diff = computeConflictDiff(localPayload, result.payload)
      const choice = await askCloudConflict(result, localAt, diff)
```
改为：
```js
      const diff = computeConflictDiff(localPayload, result.payload)
      const warn = shouldWarnBeforeOverwrite(localPayload, result.payload)
      const choice = await askCloudConflict(result, localAt, diff)
```

**替换 1b — 对齐时间戳分支追加决策依据（A4）**：

原代码（约 602-610）：
```js
      if (isContentEqual(localPayload, result.payload)) {
        setLocalModifiedAt(result.updatedAt)
        saveToLocalStorage({ bumpTimestamp: false })
        setCloudLoadSuccess(result.updatedAt)
        addOperationLog('cloud_conflict', '本地与云端内容一致，已对齐时间戳', {
          localUpdatedAt: localAt,
          cloudUpdatedAt: result.updatedAt,
        })
        return true
      }
```
改为（末尾追加 `...buildSyncRationale(...)`）：
```js
      if (isContentEqual(localPayload, result.payload)) {
        setLocalModifiedAt(result.updatedAt)
        saveToLocalStorage({ bumpTimestamp: false })
        setCloudLoadSuccess(result.updatedAt)
        addOperationLog('cloud_conflict', '本地与云端内容一致，已对齐时间戳', {
          localUpdatedAt: localAt,
          cloudUpdatedAt: result.updatedAt,
          ...buildSyncRationale(shouldWarnBeforeOverwrite(localPayload, result.payload)),
        })
        return true
      }
```

**替换 1c — 本地上传覆盖云端分支追加决策依据（A4）**：

原代码（约 615-626）：
```js
      if (choice === 'local') {
        try {
          const syncResult = await syncToCloudNow()
          addOperationLog('cloud_conflict', '本地数据较新，已上传覆盖云端', {
            updatedAt: syncResult?.updatedAt || result.updatedAt,
          })
          setCloudLoadSuccess(syncResult?.updatedAt || result.updatedAt)
        } catch (err) {
          addOperationLog('cloud_conflict', '本地数据较新，但上传云端失败，已保留本地', {
            error: err.message,
          })
          setCloudLoadError(err.message)
          alert(`上传云端失败：${err.message}\n本地数据已保留，请检查网络或云端登录。`)
        }
        return true
      }
```
改为（两处 addOperationLog 各追加 `...buildSyncRationale(warn)`）：
```js
      if (choice === 'local') {
        try {
          const syncResult = await syncToCloudNow()
          addOperationLog('cloud_conflict', '本地数据较新，已上传覆盖云端', {
            updatedAt: syncResult?.updatedAt || result.updatedAt,
            ...buildSyncRationale(warn),
          })
          setCloudLoadSuccess(syncResult?.updatedAt || result.updatedAt)
        } catch (err) {
          addOperationLog('cloud_conflict', '本地数据较新，但上传云端失败，已保留本地', {
            error: err.message,
            ...buildSyncRationale(warn),
          })
          setCloudLoadError(err.message)
          alert(`上传云端失败：${err.message}\n本地数据已保留，请检查网络或云端登录。`)
        }
        return true
      }
```

**替换 2 — `choice === 'cloud'` 分支**：

原代码（约 631-638）：
```js
      if (choice === 'cloud') {
        applyCloudDataToStore(result.payload, { trackHistory: false, sourceUpdatedAt: result.updatedAt })
        setCloudLoadSuccess(result.updatedAt)
        addOperationLog('cloud_conflict', '云端数据较新，已用云端覆盖本地', {
          updatedAt: result.updatedAt,
        })
        return true
      }
```
改为：
```js
      if (choice === 'cloud') {
        if (warn.shouldWarn) {
          const c = await askOverwriteWarn(warn)
          if (c !== 'overwrite') {
            addOperationLog('cloud_conflict', '云端数据异常，已取消用云端覆盖，保留本地', buildSyncRationale(warn))
            return false
          }
        }
        applyCloudDataToStore(result.payload, { trackHistory: false, sourceUpdatedAt: result.updatedAt })
        setCloudLoadSuccess(result.updatedAt)
        addOperationLog('cloud_conflict', '云端数据较新，已用云端覆盖本地', {
          updatedAt: result.updatedAt,
          ...buildSyncRationale(warn),
        })
        return true
      }
```

**替换 3 — 手动对比分支追加决策依据**：

原代码（约 640-644）：
```js
      addOperationLog('cloud_conflict', '本地与云端数据存在差异，已保留本地待手动处理', {
        localUpdatedAt: localAt,
        cloudUpdatedAt: result.updatedAt,
        diffCount: diff.total,
      })
      return false
```
改为：
```js
      addOperationLog('cloud_conflict', '本地与云端数据存在差异，已保留本地待手动处理', {
        localUpdatedAt: localAt,
        cloudUpdatedAt: result.updatedAt,
        diffCount: diff.total,
        ...buildSyncRationale(warn),
      })
      return false
```

**替换 4 — 静默覆盖分支（核心拦截点）**：

原代码（约 648-651）：
```js
    // 云端较新或无法比较 → 用云端覆盖本地（原行为）
    applyCloudDataToStore(result.payload, { trackHistory: false, sourceUpdatedAt: result.updatedAt })
    setCloudLoadSuccess(result.updatedAt)
    return true
```
改为：
```js
    // 云端较新或无法比较 → 先检测重大异常再决定是否覆盖（原行为为无条件覆盖）
    const cloudWarn = shouldWarnBeforeOverwrite(exportData(), result.payload)
    if (cloudWarn.shouldWarn) {
      const c = await askOverwriteWarn(cloudWarn)
      if (c !== 'overwrite') {
        addOperationLog('cloud_conflict', '检测到云端数据异常，已保留本地', buildSyncRationale(cloudWarn))
        return false
      }
    }
    applyCloudDataToStore(result.payload, { trackHistory: false, sourceUpdatedAt: result.updatedAt })
    setCloudLoadSuccess(result.updatedAt)
    addOperationLog('cloud_conflict', '云端数据较新，已用云端覆盖本地', {
      updatedAt: result.updatedAt,
      ...buildSyncRationale(cloudWarn),
    })
    return true
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: build 成功

- [ ] **Step 4: Commit**

```bash
git add src/App.vue
git commit -m "feat: 云覆盖本地前拦截，检测记录骤减/时间倒流并强提示"
```

---

## Task 8: App.vue — 备份提示 toast + 手动下载（C 兜底）

**Files:**
- Modify: `src/App.vue`

- [ ] **Step 1: Import + 状态 + watch**

在 import 区增加：

```js
import { downloadJsonBackup } from './services/dataProtection'
```

在 `overwriteWarnResolver` 声明附近新增：

```js
// 每日备份手动下载兜底（C 方向）
const backupNoticeVisible = ref(false)
let backupNoticeTimer = null

watch(
  () => store.autoBackup.lastNotice,
  (notice) => {
    if (!notice || notice !== todayStr()) return
    backupNoticeVisible.value = true
    clearTimeout(backupNoticeTimer)
    backupNoticeTimer = setTimeout(() => {
      backupNoticeVisible.value = false
    }, 8000)
  },
  { immediate: true }, // 重载页面时若今日已生成备份（lastNotice===today），仍显示 toast 供手动下载
)

function downloadBackupManually() {
  const today = todayStr()
  downloadJsonBackup({ ...exportData(), operationLogs: [...store.operationLogs] }, `饮食派数据_${today}.json`)
  backupNoticeVisible.value = false
}

function dismissBackupNotice() {
  backupNoticeVisible.value = false
}

function todayStr() {
  const d = new Date()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}
```

> 确认 `store` 在 App.vue 的 setup 中已可用（现有代码 `store.cloudSettings` 等已在用）。`exportData` 已导入。

- [ ] **Step 2: Toast 模板**

在 App.vue 根元素内（模态之外）追加：

```vue
    <Transition name="fade">
      <div
        v-if="backupNoticeVisible"
        class="fixed left-1/2 top-16 z-50 flex -translate-x-1/2 items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-800 shadow-lg"
      >
        <span>今日备份已生成：饮食派数据_{{ todayStr() }}.json</span>
        <button class="font-semibold underline" @click="downloadBackupManually">若未自动下载，点此下载</button>
        <button class="ml-1 text-emerald-500 hover:text-emerald-700" @click="dismissBackupNotice">✕</button>
      </div>
    </Transition>
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: build 成功

- [ ] **Step 4: Commit**

```bash
git add src/App.vue
git commit -m "feat: 每日备份手动下载兜底提示 toast"
```

---

## Task 9: useSales.js — `sales_submit` detail 增强

**Files:**
- Modify: `src/modules/sales/useSales.js:35-65`（`submitSell`）

- [ ] **Step 1: Implement**

原代码（约 46-63）：
```js
  const profit = calcProfit(price, express, feeRate, deduction, toNumber(item.cost))

  item.status = 'sold'
  item.stock = 0
  item.saleDetails = {
    price,
    express,
    feeRate,
    deduction,
    date,
    soldAt,
    profit,
  }

  saveToLocalStorage()
  if (!options?.skipLog) {
    addOperationLog('sales_submit', `记录销售: ${item.name} x1`, { name: item.name, sid: item.sid, qty: 1, price })
  }
  return item
```
改为（在变异前快照 before，日志补全成本利润链路与 itemId）：
```js
  const profit = calcProfit(price, express, feeRate, deduction, toNumber(item.cost))
  const beforeStatus = item.status
  const beforeStock = item.stock

  item.status = 'sold'
  item.stock = 0
  item.saleDetails = {
    price,
    express,
    feeRate,
    deduction,
    date,
    soldAt,
    profit,
  }

  saveToLocalStorage()
  if (!options?.skipLog) {
    addOperationLog('sales_submit', `记录销售: ${item.name} x1`, {
      itemId: item.id,
      name: item.name,
      sid: item.sid,
      qty: 1,
      price,
      express,
      feeRate,
      deduction,
      date,
      soldAt,
      profit,
      cost: toNumber(item.cost),
      before: { status: beforeStatus, stock: beforeStock },
      after: { status: 'sold', stock: 0 },
    })
  }
  return item
```

- [ ] **Step 2: Verify build & tests**

Run: `npm run build && npm test`
Expected: 均通过

- [ ] **Step 3: Commit**

```bash
git add src/modules/sales/useSales.js
git commit -m "feat: 销售日志补全成本利润链路与 itemId/before-after"
```

---

## Task 10: usePurchase.js — 采购各操作 detail 增强

**Files:**
- Modify: `src/modules/purchase/usePurchase.js:155-176, 202-224, 227-249, 252-269, 271-292`

- [ ] **Step 1: `purchase_add`（addPurchaseItem）**

原代码（约 165-175）：
```js
  store.items.push(item)
  if (!options?.skipLog) {
    addOperationLog('purchase_add', `新增采购: ${item.name}`, {
      name: item.name,
      sid: item.sid,
      qty: 1,
      category: item.category,
      batch: item.batch,
    })
  }
  return item
```
改为：
```js
  store.items.push(item)
  if (!options?.skipLog) {
    addOperationLog('purchase_add', `新增采购: ${item.name}`, {
      itemId: item.id,
      purchaseGroupId: item.purchaseDetails?.purchaseGroupId,
      name: item.name,
      sid: item.sid,
      qty: 1,
      category: item.category,
      batch: item.batch,
      cost: item.cost,
    })
  }
  return item
```

- [ ] **Step 2: `purchase_transfer`（submitTransfer）**

原代码（约 218-223）：
```js
  saveToLocalStorage()
  addOperationLog('purchase_transfer', `提交转运: ${transferRecord.transferBatch || transferId}`, {
    transferId,
    count: selectedItems.length,
    totalRMB: transferRecord.totalRMB,
  })
  return transferRecord
```
改为：
```js
  saveToLocalStorage()
  addOperationLog('purchase_transfer', `提交转运: ${transferRecord.transferBatch || transferId}`, {
    transferId,
    transferBatch: transferRecord.transferBatch,
    count: selectedItems.length,
    totalRMB: transferRecord.totalRMB,
    itemIds: selectedItems.map((i) => i.id),
    itemCosts: selectedItems.map((i) => ({ itemId: i.id, sid: i.sid, cost: i.cost })),
  })
  return transferRecord
```

- [ ] **Step 3: `purchase_to_inventory` 整组入库（moveToInventory）**

原代码（约 232-243）：
```js
  const transferId = item?.purchaseDetails?.transferId
  if (transferId) {
    store.items.forEach((x) => {
      if (x?.purchaseDetails?.transferId === transferId && x.status === 'purchase') {
        x.status = 'inventory'
        markInStockDate(x, inStockDate)
      }
    })
    saveToLocalStorage()
    addOperationLog('purchase_to_inventory', `同转运批次整组入库: ${item.name}`, { name: item.name, sid: item.sid, transferId, inStockDate })
    return true
  }
```
改为：
```js
  const transferId = item?.purchaseDetails?.transferId
  if (transferId) {
    let movedCount = 0
    store.items.forEach((x) => {
      if (x?.purchaseDetails?.transferId === transferId && x.status === 'purchase') {
        x.status = 'inventory'
        markInStockDate(x, inStockDate)
        movedCount += 1
      }
    })
    saveToLocalStorage()
    addOperationLog('purchase_to_inventory', `同转运批次整组入库: ${item.name}`, {
      itemId: item.id,
      name: item.name,
      sid: item.sid,
      transferId,
      inStockDate,
      count: movedCount,
      before: { status: 'purchase' },
      after: { status: 'inventory' },
    })
    return true
  }
```

- [ ] **Step 4: `purchase_to_inventory` 单件入库**

原代码（约 245-249）：
```js
  markInStockDate(item, inStockDate)
  item.status = 'inventory'
  saveToLocalStorage()
  addOperationLog('purchase_to_inventory', `移入库存: ${item.name}`, { name: item.name, sid: item.sid, inStockDate })
  return true
```
改为：
```js
  markInStockDate(item, inStockDate)
  item.status = 'inventory'
  saveToLocalStorage()
  addOperationLog('purchase_to_inventory', `移入库存: ${item.name}`, {
    itemId: item.id,
    name: item.name,
    sid: item.sid,
    inStockDate,
    before: { status: 'purchase' },
    after: { status: 'inventory' },
  })
  return true
```

- [ ] **Step 5: `purchase_batch_to_inventory`（batchMoveToInventory）**

原代码（约 252-269）：
```js
export function batchMoveToInventory(itemIds = []) {
  const idSet = new Set(itemIds)
  const inStockDate = todayDate()
  let movedCount = 0
  const movedNames = []

  store.items.forEach((item) => {
    if (idSet.has(item.id) && item?.status === 'purchase') {
      movedNames.push(item.name)
      item.status = 'inventory'
      markInStockDate(item, inStockDate)
      movedCount += 1
    }
  })

  saveToLocalStorage()
  addOperationLog('purchase_batch_to_inventory', `批量移入库存`, { count: movedCount, inStockDate, itemNames: movedNames })
}
```
改为：
```js
export function batchMoveToInventory(itemIds = []) {
  const idSet = new Set(itemIds)
  const inStockDate = todayDate()
  let movedCount = 0
  const movedNames = []
  const movedItemIds = []

  store.items.forEach((item) => {
    if (idSet.has(item.id) && item?.status === 'purchase') {
      movedNames.push(item.name)
      movedItemIds.push(item.id)
      item.status = 'inventory'
      markInStockDate(item, inStockDate)
      movedCount += 1
    }
  })

  saveToLocalStorage()
  addOperationLog('purchase_batch_to_inventory', `批量移入库存`, {
    count: movedCount,
    inStockDate,
    itemNames: movedNames,
    itemIds: movedItemIds,
    before: { status: 'purchase' },
    after: { status: 'inventory' },
  })
}
```

- [ ] **Step 6: `purchase_delete` + 组价联动（A3）**

原代码（约 271-292）：
```js
export function deletePurchaseItem(itemId) {
  const idx = store.items.findIndex((x) => x.id === itemId)
  if (idx < 0) return false

  const target = store.items[idx]
  const transferId = target?.purchaseDetails?.transferId

  store.items.splice(idx, 1)

  if (transferId) {
    recalcTransferItemsByTransferId(transferId)
  }

  saveToLocalStorage()
  addOperationLog('purchase_delete', '删除采购商品: ' + (target ? target.name : itemId), {
    name: target ? target.name : '',
    sid: target ? target.sid : '',
    transferId: transferId,
    itemId: itemId,
  })
  return true
}
```
改为：
```js
export function deletePurchaseItem(itemId) {
  const idx = store.items.findIndex((x) => x.id === itemId)
  if (idx < 0) return false

  const target = store.items[idx]
  const transferId = target?.purchaseDetails?.transferId
  const groupId = String(target?.purchaseDetails?.purchaseGroupId || '').trim()
  const groupCostBefore = groupId ? computeGroupCost(groupId) : null

  store.items.splice(idx, 1)

  if (transferId) {
    recalcTransferItemsByTransferId(transferId)
  }

  saveToLocalStorage()
  const groupCostAfter = groupId ? computeGroupCost(groupId) : null
  addOperationLog('purchase_delete', '删除采购商品: ' + (target ? target.name : itemId), {
    name: target ? target.name : '',
    sid: target ? target.sid : '',
    transferId: transferId,
    itemId: itemId,
    purchaseGroupId: groupId,
    ...(groupId ? { groupPriceBefore: groupCostBefore, groupPriceAfter: groupCostAfter } : {}),
  })
  return true
}

/** 计算指定购买组的总成本（组价联动，供日志记录删除影响） */
function computeGroupCost(groupId) {
  return store.items
    .filter((i) => String(i?.purchaseDetails?.purchaseGroupId || '').trim() === String(groupId).trim())
    .reduce((s, i) => s + Number(i?.cost || 0), 0)
}
```

- [ ] **Step 7: Verify build & tests**

Run: `npm run build && npm test`
Expected: 均通过

- [ ] **Step 8: Commit**

```bash
git add src/modules/purchase/usePurchase.js
git commit -m "feat: 采购各操作日志补 itemId/before-after/组价联动"
```

---

## Task 11: PurchaseModule.vue — `purchase_add`（购买组）与 `purchase_group_edit` 增强

**Files:**
- Modify: `src/modules/purchase/PurchaseModule.vue:959-968, 1201-1320`

- [ ] **Step 1: `purchase_add`（新增购买组）**

原代码（约 959-968）：
```js
    addOperationLog('purchase_add', `新增购买组: ${purchaseGroupId}（${createdItems.length}件/${sidSummary.length}个SID）`, {
      purchaseGroupId,
      paymentBatch,
      category: addForm.category,
      batch: addForm.batch,
      date: addForm.date,
      totalItems: createdItems.length,
      totalSids: sidSummary.length,
      sidSummary,
    })
```
改为（追加 itemIds 便于脚本定位）：
```js
    addOperationLog('purchase_add', `新增购买组: ${purchaseGroupId}（${createdItems.length}件/${sidSummary.length}个SID）`, {
      purchaseGroupId,
      paymentBatch,
      category: addForm.category,
      batch: addForm.batch,
      date: addForm.date,
      totalItems: createdItems.length,
      totalSids: sidSummary.length,
      itemIds: createdItems.map((i) => i.id),
      sidSummary,
    })
```

- [ ] **Step 2: `purchase_group_edit` 收集变更 itemId**

原代码（约 1201）：
```js
    const groupEditChanges = {}
```
改为：
```js
    const groupEditChanges = {}
    const changedItemIds = []
```

在原循环内、`if (Object.keys(before).length > 0) {` 块（约 1227-1229）改为：
```js
      if (Object.keys(before).length > 0) {
        groupEditChanges[label] = { before, after }
        if (line.id) changedItemIds.push(line.id)
      }
```

- [ ] **Step 3: 编辑内单行删除补记 `purchase_delete`（A1，JP-01C7 案例）**

原代码（约 1232-1237，删除不再存在于 lines 的商品行）：
```js
    purchaseRows.forEach((row) => {
      if (!lines.some((l) => l.id === row.id)) {
        const idx = store.items.findIndex((x) => x.id === row.id)
        if (idx >= 0) store.items.splice(idx, 1)
      }
    })
```
改为（删除前捕获被删商品信息）：
```js
    const removedRows = []
    purchaseRows.forEach((row) => {
      if (!lines.some((l) => l.id === row.id)) {
        const idx = store.items.findIndex((x) => x.id === row.id)
        if (idx >= 0) {
          const gone = store.items[idx]
          removedRows.push({
            itemId: gone.id,
            name: gone.name,
            sid: gone.sid,
            groupId: String(gone?.purchaseDetails?.purchaseGroupId || '').trim(),
          })
          store.items.splice(idx, 1)
        }
      }
    })
```

在编辑组日志（`purchase_group_edit` 的 `addOperationLog`）之后追加删除日志（若 `changedItemCount` 判断逻辑在之后引用，注意置于 `addOperationLog` 之后、`showEditGroupModal.value = false` 之前）：
```js
    removedRows.forEach((r) => {
      addOperationLog('purchase_delete', '编辑购买组时删除商品: ' + (r.name || r.sid), {
        itemId: r.itemId,
        name: r.name,
        sid: r.sid,
        purchaseGroupId: r.groupId,
        source: 'purchase_group_edit',
      })
    })
```

- [ ] **Step 4: `purchase_group_edit` 日志补 itemIds**

原日志（约 1315-1320）：
```js
    addOperationLog('purchase_group_edit', '编辑购买组: ' + editGroupForm.purchaseGroupId + (changedItemCount > 0 ? ' ← ' + changedItemCount + '个商品变更' : ''), {
      category: editGroupForm.category,
      batch: editGroupForm.batch,
      count: lines.length,
      changes: groupEditChanges,
    })
```
改为：
```js
    addOperationLog('purchase_group_edit', '编辑购买组: ' + editGroupForm.purchaseGroupId + (changedItemCount > 0 ? ' ← ' + changedItemCount + '个商品变更' : ''), {
      category: editGroupForm.category,
      batch: editGroupForm.batch,
      purchaseGroupId: editGroupForm.purchaseGroupId,
      count: lines.length,
      changes: groupEditChanges,
      itemIds: changedItemIds,
    })
```

- [ ] **Step 5: Verify build**

Run: `npm run build`
Expected: build 成功

- [ ] **Step 6: Commit**

```bash
git add src/modules/purchase/PurchaseModule.vue
git commit -m "feat: 购买组编辑补 itemIds、编辑内单行删除补 purchase_delete 日志"
```

---

## Task 12: InventoryModule.vue — `inventory_unlist` 增强

**Files:**
- Modify: `src/modules/inventory/InventoryModule.vue:655-682`

- [ ] **Step 1: Implement**

原代码（约 655-679）：
```js
  const ok = confirm(
    `${actionText}（共 ${targetItems.length} 件）：\n${preview}${more}\n\n确认继续？`,
  )
  if (!ok) return

  targetItems.forEach((x) => {
    x.status = 'purchase'
    x.isLongTerm = false
    if (!x.purchaseDetails) x.purchaseDetails = {}
    x.purchaseDetails.transferStatus = 'completed'
    x.unlistDetails = {
      reason: scope === 'transfer' ? '同转运批次下架' : '当前条目下架',
      date: new Date().toISOString().slice(0, 10),
    }
  })

  saveToLocalStorage()
  addOperationLog('inventory_unlist', `${scope === 'transfer' ? '批量' : '当前条目'}下架回采购: ${item.name}`, {
    name: item.name,
    sid: item.sid,
    transferId: item?.purchaseDetails?.transferId,
    transferBatch: item?.purchaseDetails?.transferBatch,
    count: targetItems.length,
  })
  showUnlistModal.value = false
  currentUnlistItem.value = null
}
```
改为（变异前快照每个目标条目状态，日志补 itemId 列表）：
```js
  const ok = confirm(
    `${actionText}（共 ${targetItems.length} 件）：\n${preview}${more}\n\n确认继续？`,
  )
  if (!ok) return

  const beforeList = targetItems.map((x) => ({ itemId: x.id, status: x.status, isLongTerm: !!x.isLongTerm }))

  targetItems.forEach((x) => {
    x.status = 'purchase'
    x.isLongTerm = false
    if (!x.purchaseDetails) x.purchaseDetails = {}
    x.purchaseDetails.transferStatus = 'completed'
    x.unlistDetails = {
      reason: scope === 'transfer' ? '同转运批次下架' : '当前条目下架',
      date: new Date().toISOString().slice(0, 10),
    }
  })

  saveToLocalStorage()
  addOperationLog('inventory_unlist', `${scope === 'transfer' ? '批量' : '当前条目'}下架回采购: ${item.name}`, {
    itemId: item.id,
    name: item.name,
    sid: item.sid,
    transferId: item?.purchaseDetails?.transferId,
    transferBatch: item?.purchaseDetails?.transferBatch,
    count: targetItems.length,
    itemIds: targetItems.map((x) => x.id),
    before: beforeList,
    after: { status: 'purchase', isLongTerm: false },
  })
  showUnlistModal.value = false
  currentUnlistItem.value = null
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: build 成功

- [ ] **Step 3: Commit**

```bash
git add src/modules/inventory/InventoryModule.vue
git commit -m "feat: 库存下架日志补 itemIds 与 before/after"
```

---

## Task 13: 收尾验证（全量测试 + 构建 + 手动清单）

**Files:**
- 无代码改动

- [ ] **Step 1: 全量测试与构建**

Run: `npm test && npm run build`
Expected: 全部通过

- [ ] **Step 2: 手动冒烟清单（浏览器验证）**

用 `npm run dev` 打开应用，逐项验证：

| # | 场景 | 预期 |
|---|---|---|
| 1 | 打开应用（已有数据） | 若今日未备份，页面出现绿色备份 toast；Downloads 出现 `饮食派数据_YYYYMMDD.json`，内容含 `operationLogs` 数组 |
| 2 | 再次触发保存（改任意字段） | 同一日不再重复下载 |
| 3 | 记录一条销售 | 云设置里查看日志，`sales_submit` detail 含 itemId/cost/express/feeRate/profit/before/after |
| 4 | 删除购买组内一个商品 | 日志 `purchase_delete` 含 groupPriceBefore/groupPriceAfter |
| 5 | 本地 items 100 条、云端删到 94 条且时间戳较新 | 启动时弹出"⚠️ 云端数据疑似异常"，点"保留本地"后本地数据不变、日志含 reasons |
| 6 | 正常同步（数量/时间无异常） | 不弹窗，行为与原来一致 |

- [ ] **Step 3: 提交收尾（若有调试残留清理）**

若冒烟发现临时日志/调试代码，清理后：

```bash
git status
git add -u
git commit -m "chore: 数据保护三件套收尾"
```

---

## 验收标准（对应 spec）

1. **A**：删除购买组单行商品 → 日志含 `purchase_delete` + itemId + 组价 before/after（Task 10.6）；销售日志含完整成本利润链路（Task 9）
2. **B**：本地 100 条、云端 90 条且时间戳更新 → 弹窗拦截；点「保留本地」→ 本地数据不变、日志含 reasons（Task 7）
3. **C**：每日首次保存 → Downloads 生成 `饮食派数据_YYYYMMDD.json` 且含 operationLogs；同日再次保存不再下载（Task 5 + 8）
4. `npm test` 全部通过；`npm run build` 通过（Task 13）
