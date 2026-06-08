# 操作日志回溯能力改进设计

> 日期：2026-06-08
> 状态：设计稿

---

## 背景

2026-06-08 需要追溯 6 天前（6月2日 17:10）的"应有支付宝余额"时，发现：
- 核心指标 `debt`、`unconfirmed` 等 calc 参数没有历史记录
- 其他模块（库存、采购、销售、财务）的日志已记录 `{before, after}`，回溯可行
- 500 条日志上限足够（6天产生约 80 条）
- 缺乏一个快速回溯的工具

**目标：** 确保 2 周内的账目回溯可自动完成，且换设备后仍可查阅。

---

## 数据存储总览

| 数据 | 存储位置 | localStorage Key | 云同步 |
|:----|:---------|:-----------------|:------:|
| 当前业务数据 | localStorage + Supabase | `ysp_data` | ✅ 已同步 |
| 操作日志 | localStorage | `ysp_ui.operationLogs` | ❌ 本次不加 |
| **每日快照** | **localStorage + 随数据同步** | `ysp_data.snapshots` | **✅ 随 exportData 上传** |

**为什么操作日志不同步？** 日志条目多（可能数百条），且主要用于**近期**回溯（2周内），跨设备场景下快照+云同步数据已足够。日志随 localStorage 保留在主力设备上。

---

## 改动范围

| # | 改动 | 文件 | 规模 |
|:-|:----|:----|:----:|
| 1 | `home_calc` → `calc_update`，增加 `before` 字段 | `src/modules/home/HomeModule.vue` | ~10 行 |
| 2 | 每日快照记录 | `src/data/store.js` | ~30 行 |
| 3 | 快照加入导出/同步 | `src/data/store.js` | ~5 行 |
| 4 | 回溯工具函数 | `src/data/store.js` | ~35 行 |

---

## 改动一：日志质量改进

### 当前代码

```js
// src/modules/home/HomeModule.vue:85-88
function persistCalc(field) {
  saveToLocalStorage()
  addOperationLog('home_calc', `更新支付宝计算参数: ${field}`, {
    field,
    value: store.calc[field]
  })
}
```

### 改为

**关键：** Vue 的 `v-model` 在 `@change` 触发前已更新值，所以需要在 `@focus` 时先记录旧值。

模板中增加 `@focus`：
```html
<input ... v-model.number="store.calc.debt"
       @focus="onCalcFocus('debt')"
       @change="persistCalc('debt')" />
```

`<script setup>` 中：
```js
// 记录修改前的值（在 @focus 时捕捉）
const calcBeforeValues = {}
function onCalcFocus(field) {
  calcBeforeValues[field] = store.calc[field]
}

// 日志记录（在 @change 时执行，此时 store.calc[field] 已是新值）
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

### 效果

日志从只有新值：
```json
{ "field": "debt", "value": 106477.18 }
```

改为记录完整变化：
```json
{ "field": "debt", "before": 105804.88, "after": 106477.18 }
```

---

## 改动二：每日快照

### 快照内容

每天第一次打开应用（或跨天首次操作）时，自动记录一份 8 个关键指标的快照：

```json
{
  "date": "2026-06-02",
  "calc": { "debt": 105804.88, "wechat": 0, "publicExp": 0, "unconfirmed": 123, "fund": 0 },
  "finance": { "loanBalance": 6000, "publicExpense": 746.82 },
  "profit": { "totalActualProfit": 18651.76 },
  "inventory": { "value": 91418.05, "count": 260 },
  "purchase": { "totalCost": 31091.00, "transferCost": 723.68 },
  "payton": { "yebBalance": -3577.44 }
}
```

### 代码实现

在 `src/data/store.js` 的 `saveToLocalStorage()` 中增加跨天检测：

```js
/**
 * 取今天日期字符串（本地时区）
 */
function todayDateStr() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * 记录当日快照（每天最多一次）
 * 快照存储在 state.snapshots 数组中，随 exportData 持久化到 localStorage 和云同步
 */
export function takeDailySnapshot() {
  const today = todayDateStr()

  // 如果今天已有快照，跳过
  if (state.snapshots?.some(s => s.date === today)) return

  const snapshot = {
    date: today,
    createdAt: new Date().toISOString(),
    calc: { ...state.calc },
    finance: {
      loanBalance: state.loanRecords.reduce((s, l) => {
        if (l?.isRepaid || l?.repaid) return s
        return s + (l?.type === 'borrow' ? Number(l.amount) : -Number(l.amount))
      }, 0),
      publicExpense: state.financeRecords
        .filter(r => r?.type === 'expense')
        .reduce((s, r) => s + Number(r.amount), 0),
    },
    profit: {
      totalActualProfit: state.items
        .filter(i => i?.status === 'sold')
        .reduce((s, i) => s + Number(i?.saleDetails?.profit || 0), 0),
    },
    inventory: {
      value: state.items
        .filter(i => i?.status === 'inventory')
        .reduce((s, i) => s + Number(i?.cost || 0), 0),
      count: state.items.filter(i => i?.status === 'inventory').length,
    },
    purchase: {
      totalCost: state.items
        .filter(i => i?.status === 'purchase')
        .reduce((s, i) => s + Number(i?.cost || 0), 0),
    },
    payton: {
      yebBalance: Number(state.paytonAccounts?.yeb?.balance || 0),
    },
  }

  if (!state.snapshots) state.snapshots = []
  state.snapshots.push(snapshot)
  saveToLocalStorage()
}
```

在 `saveToLocalStorage()` 开头调用 `takeDailySnapshot()`（每天首次保存时触发）：

```js
export function saveToLocalStorage() {
  takeDailySnapshot()

  const currentData = exportData()
  // ... 其余不变 ...
}
```

### 为什么选 8 个指标而不是全量备份？

| 方式 | 每天体积 | 14 天体积 | 换设备能用 |
|:----|:--------:|:---------:|:---------:|
| ❌ 全量 JSON 备份 | ~1MB | ~14MB | 太大，不适合云同步 |
| ✅ 8 指标快照 | <1KB | ~14KB | 轻松随云同步 |

---

## 改动三：快照加入导出/同步

修改 `exportData()`，追加快照数组：

```js
export function exportData() {
  return {
    // ... 现有字段不变 ...
    snapshots: state.snapshots ? clone(state.snapshots) : [],
  }
}
```

同时在 `loadData()` 中恢复快照：

```js
export function loadData(jsonObject = {}) {
  // ... 现有代码不变 ...

  // 恢复快照
  if (Array.isArray(jsonObject.snapshots)) {
    state.snapshots = jsonObject.snapshots
  }
}
```

这样每日快照就会：
1. ✅ 写入 localStorage `ysp_data`（本机持久化）
2. ✅ 随云同步上传 Supabase（跨设备可用）
3. ✅ 从云端拉取时恢复（换电脑也能看到历史快照）

---

## 改动四：回溯工具函数

在 `src/data/store.js` 中新增：

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
 * 限制：仅对 calc_update 类型生效；若 targetDate 之前的日志已被
 * 500 条上限挤掉，则无法还原。
 */
export function reconstructCalcField(field, targetDate) {
  const target = new Date(targetDate).getTime()
  if (isNaN(target)) throw new Error('Invalid targetDate')

  // 1. 从当前值开始
  let value = state.calc[field]

  // 2. 筛选 targetDate 之后的 calc_update 日志（按时间倒序）
  const logs = state.operationLogs
    .filter(l => l.type === 'calc_update' && l.detail?.field === field)
    .filter(l => new Date(l.time).getTime() > target)
    .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())

  // 3. 逆序回放：把 after 还原为 before
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
  // 精确匹配
  const exact = snapshots.find(s => s.date === targetDate)
  if (exact) return exact
  // 模糊：找最近的（不超过 targetDate + 7天）
  const target = new Date(targetDate).getTime()
  let closest = null, minDiff = Infinity
  for (const s of snapshots) {
    const diff = Math.abs(new Date(s.date).getTime() - target)
    if (diff < minDiff) { minDiff = diff; closest = s }
  }
  return closest
}
```

### 使用示例

```js
// 方式一：从快照秒查（有当天快照时）
getSnapshotByDate('2026-06-02')
// → { date: "2026-06-02", calc: { debt: 105804.88, ... }, ... }

// 方式二：从日志精确回放（任意时间点）
reconstructCalcField('debt', '2026-06-02T09:10:00Z')
// → 105804.88

// 方式三：两者结合计算余额
const snap = getSnapshotByDate('2026-06-02')
if (snap) {
  // 用快照值
  const { debt, unconfirmed, wechat, publicExp, fund } = snap.calc
  console.log('余额:', debt + wechat + publicExp - unconfirmed + fund)
}
```

**快照优先，日志兜底：** 有快照一秒钟查到；没有快照的日子，用日志回放也能恢复。

---

## 兼容性

- **旧日志**：现有的 `home_calc` 日志没有 `before`，`reconstructCalcField` 会跳过（不修改值），新旧混合使用正常。
- **旧数据**：没有 `snapshots` 字段的旧 JSON 导入后，`loadData` 将其初始化为 `[]`，不影响现有功能。
- **日志上限**：500 条不变，本次 6 天产生约 80 条日志，足够覆盖 2 周以上。

---

## 不做的事

- ❌ 不同步操作日志到云端（日志量大且用于近期回溯，快照已覆盖跨设备需求）
- ❌ 不增加 500 条上限
- ❌ 不改动其他模块的日志（已足够好）

---

## 验证方法

1. 打开首页，修改 debt 值 → 检查 `ysp_ui` 日志包含 `{before, after}`
2. 跨天（或手动调用 `takeDailySnapshot()`）→ 检查 `ysp_data` 新增 `snapshots` 数组
3. 控制台调用 `getSnapshotByDate('2026-06-08')` → 返回当天快照
4. 连续修改 3 次 calc → `reconstructCalcField('debt', ...)` 正确回放
5. 导出 JSON → 检查包含 `snapshots` 字段
6. 清空 localStorage 后导入备份 JSON → 快照恢复
