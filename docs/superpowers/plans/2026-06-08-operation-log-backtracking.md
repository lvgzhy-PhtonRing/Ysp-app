# 操作日志回溯能力改进 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 确保 2 周内的账目回溯可自动完成，支持换设备后仍可查询每日关键指标

**Architecture:** 三管齐下：(1) calc 参数日志增加 `before/after` 记录完整变化 (2) 自动记录每日 8 项关键指标快照，随云同步持久化 (3) 提供回溯工具函数 `reconstructCalcField` + `getSnapshotByDate`

**Tech Stack:** Vue 3 (Composition API), localStorage + Supabase 云同步

---

## 改动一览

| # | 改动 | 文件 | 规模 |
|:-|:------|:----|:----:|
| 1 | calc 日志增加 before/after | `src/modules/home/HomeModule.vue` | ~10 行 |
| 2 | 每日快照记录 + 跨天检测 | `src/data/store.js` | ~30 行 |
| 3 | 快照加入 exportData/loadData | `src/data/store.js` | ~5 行 |
| 4 | 回溯工具函数 | `src/data/store.js` | ~35 行 |

---

### Task 0: 阅读现有代码确认上下文

**Files:**
- Read: `src/modules/home/HomeModule.vue:85-88` (persistCalc)
- Read: `src/modules/home/HomeModule.vue:220-231` (calc 输入框模板)
- Read: `src/data/store.js:320-337` (exportData)
- Read: `src/data/store.js:275-318` (loadData)
- Read: `src/data/store.js:339-352` (saveToLocalStorage)

- [ ] **Step 1: 确认 debt 和 unconfirmed 两个输入框的模板结构**

```html
<!-- 只有这两个字段有 v-model + @change -->
<input type="number" v-model.number="store.calc.debt" ... @change="persistCalc('debt')" />
<input type="number" v-model.number="store.calc.unconfirmed" ... @change="persistCalc('unconfirmed')" />
```

- [ ] **Step 2: 确认 store 中的 calc 默认结构与 current state**

```js
// state.calc = { debt: 0, wechat: 0, publicExp: 0, unconfirmed: 0, fund: 0 }
```

Read: `src/data/store.js:10-16`

---

### Task 1: calc 日志改进 — HomeModule.vue

**Files:**
- Modify: `src/modules/home/HomeModule.vue`

- [ ] **Step 1: 在 `<script setup>` 中增加 calcBeforeValues 状态和 onCalcFocus 函数**

在 `persistCalc` 函数定义之前插入：

```js
// 记录修改前的值（在 @focus 时捕捉），用于操作日志回溯
const calcBeforeValues = {}
function onCalcFocus(field) {
  calcBeforeValues[field] = store.calc[field]
}
```

- [ ] **Step 2: 修改 persistCalc 函数，增加 before 并重命名类型**

当前代码（约 85-88 行）：

```js
function persistCalc(field) {
  saveToLocalStorage()
  addOperationLog('home_calc', `更新支付宝计算参数: ${field}`, { field, value: store.calc[field] })
}
```

改为：

```js
function persistCalc(field) {
  const before = calcBeforeValues[field] ?? store.calc[field]
  saveToLocalStorage()
  addOperationLog('calc_update', `更新支付宝计算参数: ${field}`, {
    field,
    before,
    after: store.calc[field],
  })
}
```

- [ ] **Step 3: 修改模板，为两个输入框增加 @focus**

找到 debt 和 unconfirmed 的 input 标签，增加 `@focus`：

```html
<input type="number" v-model.number="store.calc.debt" class="apple-input mt-1"
       @focus="onCalcFocus('debt')" @change="persistCalc('debt')" />
```

```html
<input type="number" v-model.number="store.calc.unconfirmed" class="apple-input mt-1"
       @focus="onCalcFocus('unconfirmed')" @change="persistCalc('unconfirmed')" />
```

---

### Task 2: 每日快照功能 — store.js

**Files:**
- Modify: `src/data/store.js`

- [ ] **Step 1: 在 state 定义中增加 snapshots 数组**

在 `src/data/store.js` 的 `state` 定义中（约 76-103 行），在 `operationLogs: []` 之后增加：

```js
snapshots: [],
```

- [ ] **Step 2: 增加 takeDailySnapshot 函数和辅助函数**

在 `addOperationLog` 函数之前（约 459 行前）或之后插入。建议放在 `saveToLocalStorage` 附近（约 339 行）。

```js
function todayDateStr() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * 记录当日快照（每天最多一次），记录 8 个关键指标用于历史回溯。
 * 快照存储在 state.snapshots 中，随 exportData 持久化到 localStorage 和云同步。
 */
function takeDailySnapshot() {
  const today = todayDateStr()
  if (state.snapshots?.some(s => s.date === today)) return

  const loanBalance = state.loanRecords.reduce((s, l) => {
    if (l?.isRepaid || l?.repaid) return s
    return s + (l?.type === 'borrow' ? Number(l.amount || 0) : -Number(l.amount || 0))
  }, 0)

  const publicExpense = state.financeRecords
    .filter(r => r?.type === 'expense')
    .reduce((s, r) => s + Number(r?.amount || 0), 0)

  const soldItems = state.items.filter(i => i?.status === 'sold')
  const inventoryItems = state.items.filter(i => i?.status === 'inventory')
  const purchaseItems = state.items.filter(i => i?.status === 'purchase')

  const snapshot = {
    date: today,
    createdAt: new Date().toISOString(),
    calc: { ...state.calc },
    finance: { loanBalance, publicExpense },
    profit: {
      totalActualProfit: soldItems.reduce((s, i) => s + Number(i?.saleDetails?.profit || 0), 0),
    },
    inventory: {
      value: inventoryItems.reduce((s, i) => s + Number(i?.cost || 0), 0),
      count: inventoryItems.length,
    },
    purchase: {
      totalCost: purchaseItems.reduce((s, i) => s + Number(i?.cost || 0), 0),
      count: purchaseItems.length,
    },
    payton: {
      yebBalance: Number(state.paytonAccounts?.yeb?.balance || 0),
    },
  }

  state.snapshots.push(snapshot)
}
```

- [ ] **Step 3: 在 saveToLocalStorage 开头调用 takeDailySnapshot**

```js
export function saveToLocalStorage() {
  takeDailySnapshot()
  // ... 现有代码不变 ...
  const currentData = exportData()
  // ...
}
```

---

### Task 3: 快照加入 export/import — store.js

**Files:**
- Modify: `src/data/store.js`

- [ ] **Step 1: 在 exportData 中追加快照**

```js
export function exportData() {
  return {
    // ... 现有字段 ...
    snapshots: state.snapshots ? clone(state.snapshots) : [],
  }
}
```

- [ ] **Step 2: 在 loadData 中恢复快照**

在函数末尾（`state.version = APP_VERSION` 之后）：

```js
export function loadData(jsonObject = {}) {
  // ... 现有代码 ...

  // 恢复快照
  if (Array.isArray(jsonObject.snapshots)) {
    state.snapshots = jsonObject.snapshots
  } else if (!state.snapshots) {
    state.snapshots = []
  }
}
```

---

### Task 4: 回溯工具函数 — store.js

**Files:**
- Modify: `src/data/store.js`

- [ ] **Step 1: 在 store.js 末尾（`clearOperationLogs` 之后）新增两个导出函数**

```js
/**
 * 回溯指定时间点的 calc 字段值
 * @param {string} field - calc 字段名 (debt|wechat|publicExp|unconfirmed|fund)
 * @param {string|Date} targetDate - 目标时间点
 * @returns {number} 该字段在目标时间点的值
 *
 * 原理：从当前值出发，逆序回放 targetDate 之后的 calc_update 日志，
 * 将每次 after 替换成 before，最终得到 targetDate 时的值。
 *
 * 限制：仅对 calc_update 类型生效；旧日志（home_calc 类型）不含 before，
 * 会被跳过，新旧日志混合使用正常。
 */
export function reconstructCalcField(field, targetDate) {
  const target = new Date(targetDate).getTime()
  if (isNaN(target)) throw new Error('Invalid targetDate')

  let value = state.calc[field]

  const logs = state.operationLogs
    .filter(l => l.type === 'calc_update' && l.detail?.field === field)
    .filter(l => new Date(l.time).getTime() > target)
    .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())

  for (const log of logs) {
    if (log.detail.before !== undefined) {
      value = log.detail.before
    }
  }

  return value
}

/**
 * 获取离目标日期最近的每日快照
 * @param {string} targetDate - 日期 "2026-06-02"
 * @returns {object|null} 快照对象，若无则返回 null
 */
export function getSnapshotByDate(targetDate) {
  const snapshots = state.snapshots || []
  const exact = snapshots.find(s => s.date === targetDate)
  if (exact) return exact

  // 模糊匹配：找最近的（不超过 targetDate ± 7天）
  const target = new Date(targetDate).getTime()
  let closest = null
  let minDiff = Infinity
  for (const s of snapshots) {
    const diff = Math.abs(new Date(s.date).getTime() - target)
    if (diff < minDiff) {
      minDiff = diff
      closest = s
    }
  }
  return minDiff <= 7 * 86400000 ? closest : null
}
```

---

### Task 5: 验证

- [ ] **Step 1: 检查 calc 日志增加 before**

操作：打开首页，修改 debt 值
验证：执行以下命令确认日志格式

```js
JSON.parse(localStorage.getItem('ysp_ui')).operationLogs
  .filter(l => l.type === 'calc_update')
  .slice(0, 2)
```

预期输出中包含 `{ field: "debt", before: ..., after: ... }`

- [ ] **Step 2: 检查每日快照生成**

操作：调用 `takeDailySnapshot()` 或保存数据（跨天）
验证：

```js
const data = JSON.parse(localStorage.getItem('ysp_data'))
console.log(data.snapshots?.slice(-1)?.[0])
```

预期输出包含今天的快照记录，格式为 `{ date, calc, finance, profit, inventory, purchase, payton }`

- [ ] **Step 3: 测试回溯工具函数**

操作：修改 debt 值 2-3 次，然后调用回溯

```js
const original = store.calc.debt
// 修改...然后再执行：
const restored = reconstructCalcField('debt', new Date(Date.now() - 60000).toISOString())
console.log('当前值:', original, '一分钟前值:', restored)
```

预期：`restored` 等于修改前的值

- [ ] **Step 4: 测试快照查询**

```js
getSnapshotByDate(todayDateStr())
```

预期：返回今天的快照对象

- [ ] **Step 5: 确认云同步兼容性**

操作：
1. 保存数据 → 触发云同步
2. 在 Supabase 控制台或浏览器中查看同步后的数据应包含 `snapshots` 字段
3. 清空 localStorage → 从云端拉取 → 快照恢复

- [ ] **Step 6: 确认旧日志兼容性**

验证：现有的 `home_calc` 旧日志在 `reconstructCalcField` 中被跳过（`before === undefined` → 不修改值），新旧日志混合使用正常
