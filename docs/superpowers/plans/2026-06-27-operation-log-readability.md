# 操作日志可读性改进 — 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 改进操作日志的三层展示（消息文本→列表摘要→详情弹窗），使用户不打开弹窗即知操作内容，删除自动合并，不暴露原始JSON。

**Architecture:** 在 `store.js` 新增公共工具（字段映射表、摘要格式化、删除聚合），在 `App.vue` 重构日志列表和详情弹窗的渲染逻辑，在各业务模块的 `addOperationLog` 调用点改写消息格式。数据模型不变，仅改变展示层。

**Tech Stack:** Vue 3 (Composition API), vanilla JS

---

### Task 1: store.js — 新增 FIELD_LABEL_MAP 和 formatChangesSummary

**Files:**
- Modify: `src/data/store.js` (after line 6, after `MAX_UNDO_STEPS`)

- [ ] **Step 1: 在 store.js 顶部新增常量**

在 `const HISTORY_META_EXPIRE_MS = 3000` 之后插入：

```js
// 操作日志：字段名→中文映射（编辑日志内联摘要用）
export const FIELD_LABEL_MAP = {
  name: '名称', brand: '品牌', cost: '成本', category: '大类', batch: '批次',
  amount: '金额', type: '类型', date: '日期', account: '账户', note: '备注',
  isDefect: '品相', isLongTerm: '长线',
  price: '售价', express: '运费', feeRate: '费率', deduction: '扣减',
  totalRMB: '总RMB', paymentBatch: '支付批次', paymentAccount: '支付账户',
  exchangeRate: '汇率', originalPrice: '日元原价', domesticShipping: '国内运费',
  transferCoefficient: '分摊系数',
  item: '项目', counterparty: '对方',
  debt: '总负债', wechat: '微信余额', publicExp: '公摊支出',
  unconfirmed: '未确认款', fund: '备用金',
  website: '网站', discount: '折扣', fee: '手续费',
  transferBatch: '转运批次', inStockDate: '入库日期',
}

const DELETE_MERGE_WINDOW_MS = 500
const DELETE_LOG_TYPES = new Set(['inventory_delete', 'purchase_delete'])
```

- [ ] **Step 2: 新增 formatChangesSummary 和 fmtBrief 函数**

在 `FIELD_LABEL_MAP` 之后插入：

```js
function fmtBrief(v) {
  if (v === null || v === undefined || v === '') return '-'
  if (typeof v === 'number') return '¥' + Number(v).toFixed(0)
  if (typeof v === 'boolean') return v ? '是' : '否'
  return String(v).slice(0, 20)
}

/**
 * 将 changes 对象转为可读摘要字符串
 * @param {object} changes — { fieldName: { before, after } }
 * @returns {string} 如 "名称, 成本:¥80→¥87"
 */
export function formatChangesSummary(changes) {
  if (!changes || typeof changes !== 'object') return ''
  const entries = Object.entries(changes)
  if (entries.length === 0) return ''
  const parts = entries.map(function (_a) {
    var key = _a[0], val = _a[1]
    var label = FIELD_LABEL_MAP[key] || key
    if (val && typeof val === 'object' && 'before' in val && 'after' in val) {
      return label + ':' + fmtBrief(val.before) + '→' + fmtBrief(val.after)
    }
    return label
  })
  return parts.join(', ')
}
```

> 注意：此项目不支持箭头函数(=>)和模板字符串(\`...\`)，使用 function 和字符串拼接。

- [ ] **Step 3: 验证语法**

```bash
node -e "import('./src/data/store.js').then(m => console.log('FIELD_LABEL_MAP keys:', Object.keys(m.FIELD_LABEL_MAP).length, 'formatChangesSummary:', typeof m.formatChangesSummary))"
```

Expected: `FIELD_LABEL_MAP keys: 30 formatChangesSummary: function`

- [ ] **Step 4: Commit**

```bash
git add src/data/store.js
git commit -m "feat: add FIELD_LABEL_MAP and formatChangesSummary for operation log readability"
```

---

### Task 2: store.js — addOperationLog 删除聚合

**Files:**
- Modify: `src/data/store.js:522-545`

- [ ] **Step 1: 在 addOperationLog 开头增加合并逻辑**

将 `addOperationLog` 函数（line 522）改为：

```js
export function addOperationLog(type, message, detail) {
  if (detail === undefined) detail = {}

  // 删除聚合：同一SID在 500ms 内连续删除 → 合并为 1 条日志
  if (DELETE_LOG_TYPES.has(type) && state.operationLogs.length > 0) {
    var last = state.operationLogs[0]
    var timeGap = Date.now() - new Date(last.time).getTime()
    if (
      last.type === type &&
      last.detail && last.detail.sid === detail.sid &&
      timeGap < DELETE_MERGE_WINDOW_MS
    ) {
      var prevCount = last.detail.deletedCount || 1
      var newCount = prevCount + 1
      var prevNames = Array.isArray(last.detail.deletedNames) ? last.detail.deletedNames : [last.detail.name || '']
      var prevIds = Array.isArray(last.detail.deletedItemIds) ? last.detail.deletedItemIds : [last.detail.itemId]

      last.detail = Object.assign({}, last.detail, {
        deletedCount: newCount,
        deletedItemIds: prevIds.concat([detail.itemId || detail.sid]),
        deletedNames: prevNames.concat([detail.name || '']),
      })
      last.message = '删除商品: ' + (detail.name || '') + ' x' + newCount
      last.time = new Date().toISOString()
      last.id = Date.now() + Math.floor(Math.random() * 1000)
      saveUiStateToLocalStorage()
      return
    }
  }

  // --- 以下为原有逻辑，不变 ---
  attachHistoryMetaFromOperationLog(type, message)

  state.operationLogs.unshift({
    id: Date.now() + Math.floor(Math.random() * 1000),
    time: new Date().toISOString(),
    type: type,
    message: message,
    detail: detail,
  })

  if (state.operationLogs.length > 500) {
    state.operationLogs.splice(500)
  }

  saveUiStateToLocalStorage()

  if (!_cloudUnhealthyWarned && isCloudSyncUnhealthy()) {
    _cloudUnhealthyWarned = true
    setTimeout(function () {
      alert('⚠️ 云端同步未连接，操作仅保存在本地浏览器中。\n更换设备或清除浏览器缓存后数据将丢失，请尽快登录云端账号同步。')
    }, 100)
  }
}
```

> 注意：保留原有 `attachHistoryMetaFromOperationLog` 调用位置不变，仅新增头部合并逻辑。

- [ ] **Step 2: 在 deleteItem 中传入 sid 和 itemId**

修改 `src/modules/inventory/useInventory.js:136` 的 addOperationLog 调用，增加 `itemId` 字段：

```js
addOperationLog('inventory_delete', '删除商品: ' + (target ? target.name : itemId), {
  name: target ? target.name : '',
  sid: target ? target.sid : '',
  itemId: itemId,
})
```

- [ ] **Step 3: 在 deletePurchaseItem 中传入 sid 和 itemId**

修改 `src/modules/purchase/usePurchase.js:285` 的 addOperationLog 调用，增加 `itemId` 字段：

```js
addOperationLog('purchase_delete', '删除采购商品: ' + (target ? target.name : itemId), {
  name: target ? target.name : '',
  sid: target ? target.sid : '',
  transferId: transferId,
  itemId: itemId,
})
```

- [ ] **Step 4: 验证**

启动应用，在库存页面连续快速点击删除两个同SID商品，检查操作日志弹窗：应显示合并后的1条日志 `删除商品: XXX x2`。

- [ ] **Step 5: Commit**

```bash
git add src/data/store.js src/modules/inventory/useInventory.js src/modules/purchase/usePurchase.js
git commit -m "feat: add delete aggregation in operation logs (500ms same-SID merge)"
```

---

### Task 3: 编辑类日志消息内联变更摘要（批量改造各模块）

**Files:**
- Modify: `src/modules/purchase/PurchaseModule.vue:1520`
- Modify: `src/modules/inventory/useInventory.js:119`
- Modify: `src/modules/sales/useSales.js:122`
- Modify: `src/modules/finance/useFinance.js:68,119`
- Modify: `src/modules/payton/usePayton.js:334`
- Modify: `src/modules/home/HomeModule.vue:95`

- [ ] **Step 1: 在文件顶部导入 formatChangesSummary**

每个需要改造的文件，在 import 语句中追加 `formatChangesSummary`：

```js
// src/modules/purchase/PurchaseModule.vue 顶部已有 import { addOperationLog, saveToLocalStorage, state as store }
// 改为：
import { addOperationLog, formatChangesSummary, saveToLocalStorage, state as store } from '../../data/store'

// 同理 src/modules/inventory/useInventory.js:
import { addOperationLog, formatChangesSummary, saveToLocalStorage, state as store } from '../../data/store'

// 同理 src/modules/sales/useSales.js:
import { addOperationLog, formatChangesSummary, saveToLocalStorage, state as store } from '../../data/store'

// 同理 src/modules/finance/useFinance.js:
import { addOperationLog, formatChangesSummary, saveToLocalStorage, state as store } from '../../data/store'

// 同理 src/modules/payton/usePayton.js:
import { addOperationLog, formatChangesSummary, saveToLocalStorage, state as store } from '../../data/store'

// 同理 src/modules/home/HomeModule.vue:
import { addOperationLog, FIELD_LABEL_MAP, formatChangesSummary, saveToLocalStorage, state as store } from '../../data/store'
```

- [ ] **Step 2: purchase_edit 消息内联变更**

在 `src/modules/purchase/PurchaseModule.vue:1520`，将消息改为：

```js
var changesText = formatChangesSummary(changes)
addOperationLog('purchase_edit', '编辑采购商品: ' + item.name + (changesText ? ' ← ' + changesText : ''), {
  sid: item.sid,
  changedFields: Object.keys(changes),
  changes: changes,
})
```

- [ ] **Step 3: inventory_edit 消息内联变更**

在 `src/modules/inventory/useInventory.js:119`，将消息改为：

```js
var changesText = formatChangesSummary(changes)
addOperationLog('inventory_edit', '编辑库存: ' + item.name + (changesText ? ' ← ' + changesText : '') + (targets.length > 1 ? ' (影响' + targets.length + '件)' : ''), {
  name: item.name,
  sid: item.sid,
  affected: targets.length,
  changedFields: Object.keys(changes),
  changes: changes,
})
```

> `影响` = "影响"

- [ ] **Step 4: sales_edit 消息内联变更**

在 `src/modules/sales/useSales.js:122`，将消息改为：

```js
var changesText = formatChangesSummary(changes)
addOperationLog('sales_edit', '编辑销售: ' + item.name + (changesText ? ' ← ' + changesText : ''), {
  sid: item.sid,
  changedFields: Object.keys(changes),
  changes: changes,
})
```

- [ ] **Step 5: finance_update_record 消息内联变更**

在 `src/modules/finance/useFinance.js:68`，将消息改为：

```js
var changesText = formatChangesSummary(changes)
addOperationLog('finance_update_record', '编辑收支: ' + record.item + (changesText ? ' ← ' + changesText : ''), {
  type: record.type,
  amount: record.amount,
  changedFields: Object.keys(changes),
  changes: changes,
})
```

- [ ] **Step 6: finance_update_loan 消息内联变更**

在 `src/modules/finance/useFinance.js:119`，将消息改为：

```js
var changesText = formatChangesSummary(changes)
addOperationLog('finance_update_loan', '编辑借贷: ' + (loan.counterparty || '-') + (changesText ? ' ← ' + changesText : ''), {
  loanId: loanId,
  counterparty: loan.counterparty,
  changedFields: Object.keys(changes),
  changes: changes,
})
```

- [ ] **Step 7: payton_edit_record 消息内联变更**

在 `src/modules/payton/usePayton.js:334`，将消息改为：

```js
var changesText = formatChangesSummary(changes)
addOperationLog('payton_edit_record', '编辑流水: ' + (record.category || '-') + (record.carName ? ' | ' + record.carName : '') + (changesText ? ' ← ' + changesText : ''), {
  recordId: recordId,
  category: record.category,
  carName: record.carName,
  account: record.account,
  changedFields: Object.keys(changes),
  changes: changes,
})
```

- [ ] **Step 8: calc_update 消息内联 before→after**

在 `src/modules/home/HomeModule.vue:95`，将消息改为：

```js
var fieldLabel = FIELD_LABEL_MAP[field] || field
addOperationLog('calc_update', '更新参数: ' + fieldLabel + ':\xA5' + Number(before || 0).toFixed(0) + '→\xA5' + Number(store.calc[field] || 0).toFixed(0), {
  field: field,
  before: before,
  after: store.calc[field],
})
```

> `\xA5` = ¥

- [ ] **Step 9: purchase_group_edit 消息内联变更数**

在 `src/modules/purchase/PurchaseModule.vue:1309`，将消息改为：

```js
var changedItemCount = Object.keys(groupEditChanges).length
addOperationLog('purchase_group_edit', '编辑购买组: ' + editGroupForm.purchaseGroupId + (changedItemCount > 0 ? ' ← ' + changedItemCount + '个商品变更' : ''), {
  category: editGroupForm.category,
  batch: editGroupForm.batch,
  count: lines.length,
  changes: groupEditChanges,
})
```

> `个商品变更` = "个商品变更"

- [ ] **Step 10: Commit**

```bash
git add src/modules/purchase/PurchaseModule.vue src/modules/inventory/useInventory.js src/modules/sales/useSales.js src/modules/finance/useFinance.js src/modules/payton/usePayton.js src/modules/home/HomeModule.vue
git commit -m "feat: inline change summaries in edit-type operation log messages"
```

---

### Task 4: App.vue — logTypeMeta 增加 summary() 函数

**Files:**
- Modify: `src/App.vue:59-105`

- [ ] **Step 1: 为关键日志类型添加 summary 函数**

在 `logTypeMeta` 对象中，为以下类型增加 `summary` 属性（在现有 `pillClass` 之后）：

```js
purchase_add: {
  label: '采购新增', color: 'text-yellow-600', icon: 'fa-solid fa-plus', pillClass: 'bg-yellow-100 text-yellow-700',
  summary: function (d) {
    var lines = []
    if (d.totalItems) lines.push(d.totalItems + '件')
    if (d.batch) lines.push('批次:' + d.batch)
    if (d.paymentBatch) lines.push('支付:' + d.paymentBatch)
    if (Array.isArray(d.sidSummary) && d.sidSummary.length > 0) {
      lines.push('商品:' + d.sidSummary.map(function (s) { return s.sid + '(' + s.qty + '件)' }).join('、'))
    }
    return lines
  },
},
purchase_edit: {
  label: '采购编辑', color: 'text-blue-600', icon: 'fa-solid fa-pen', pillClass: 'bg-blue-100 text-blue-700',
  summary: function (d) {
    var parts = []
    if (d.sid) parts.push('SID:' + d.sid)
    if (d.changedFields && d.changedFields.length) parts.push('改' + d.changedFields.length + '字段')
    return parts
  },
},
purchase_delete: {
  label: '采购删除', color: 'text-red-600', icon: 'fa-solid fa-trash', pillClass: 'bg-red-100 text-red-700',
  summary: function (d) {
    var parts = []
    if (d.sid) parts.push('SID:' + d.sid)
    if (d.deletedCount > 1) parts.push('共' + d.deletedCount + '件')
    return parts
  },
},
purchase_transfer: {
  label: '采购转运', color: 'text-amber-600', icon: 'fa-solid fa-truck', pillClass: 'bg-amber-100 text-amber-700',
  summary: function (d) {
    var parts = []
    if (d.count) parts.push(d.count + '件')
    if (d.totalRMB) parts.push('总RMB:\xA5' + Number(d.totalRMB).toFixed(0))
    return parts
  },
},
purchase_batch_to_inventory: {
  label: '采购入库', color: 'text-green-600', icon: 'fa-solid fa-boxes-stacked', pillClass: 'bg-green-100 text-green-700',
  summary: function (d) {
    var parts = []
    if (d.count) parts.push(d.count + '件')
    return parts
  },
},
inventory_edit: {
  label: '库存编辑', color: 'text-blue-600', icon: 'fa-solid fa-pen', pillClass: 'bg-blue-100 text-blue-700',
  summary: function (d) {
    var parts = []
    if (d.sid) parts.push('SID:' + d.sid)
    if (d.affected > 1) parts.push('影响' + d.affected + '件')
    if (d.changedFields && d.changedFields.length) parts.push('改' + d.changedFields.length + '字段')
    return parts
  },
},
inventory_delete: {
  label: '库存删除', color: 'text-red-600', icon: 'fa-solid fa-trash', pillClass: 'bg-red-100 text-red-700',
  summary: function (d) {
    var parts = []
    if (d.sid) parts.push('SID:' + d.sid)
    if (d.deletedCount > 1) parts.push('共' + d.deletedCount + '件')
    return parts
  },
},
sales_submit: {
  label: '销售新增', color: 'text-green-600', icon: 'fa-solid fa-cash-register', pillClass: 'bg-green-100 text-green-700',
  summary: function (d) {
    var parts = []
    if (d.price) parts.push('售价:\xA5' + Number(d.price).toFixed(0))
    return parts
  },
},
sales_edit: {
  label: '销售编辑', color: 'text-blue-600', icon: 'fa-solid fa-pen', pillClass: 'bg-blue-100 text-blue-700',
  summary: function (d) {
    var parts = []
    if (d.sid) parts.push('SID:' + d.sid)
    if (d.changedFields && d.changedFields.length) parts.push('改' + d.changedFields.length + '字段')
    return parts
  },
},
finance_add_record: {
  label: '收支新增', color: 'text-indigo-600', icon: 'fa-solid fa-receipt', pillClass: 'bg-indigo-100 text-indigo-700',
  summary: function (d) {
    var parts = []
    if (d.type) parts.push(d.type === 'income' ? '收入' : '支出')
    if (d.amount) parts.push('\xA5' + Number(d.amount).toFixed(0))
    return parts
  },
},
finance_update_record: {
  label: '收支编辑', color: 'text-blue-600', icon: 'fa-solid fa-pen', pillClass: 'bg-blue-100 text-blue-700',
  summary: function (d) {
    var parts = []
    if (d.type) parts.push(d.type === 'income' ? '收入' : '支出')
    if (d.amount) parts.push('\xA5' + Number(d.amount).toFixed(0))
    return parts
  },
},
payton_add_record: {
  label: "Payton's新增", color: 'text-teal-600', icon: 'fa-solid fa-wallet', pillClass: 'bg-teal-100 text-teal-700',
  summary: function (d) {
    var parts = []
    if (d.type) parts.push(d.type === 'income' ? '收入' : '支出')
    if (d.amount) parts.push('\xA5' + Number(d.amount).toFixed(0))
    if (d.account) parts.push(d.account)
    return parts
  },
},
payton_edit_record: {
  label: "Payton's编辑", color: 'text-blue-600', icon: 'fa-solid fa-pen', pillClass: 'bg-blue-100 text-blue-700',
  summary: function (d) {
    var parts = []
    if (d.account) parts.push(d.account)
    if (d.changedFields && d.changedFields.length) parts.push('改' + d.changedFields.length + '字段')
    return parts
  },
},
calc_update: {
  label: '计算器', color: 'text-blue-600', icon: 'fa-solid fa-calculator', pillClass: 'bg-blue-100 text-blue-700',
  summary: function (d) {
    if (d.before !== undefined && d.after !== undefined) {
      return ['\xA5' + Number(d.before).toFixed(0) + ' → \xA5' + Number(d.after).toFixed(0)]
    }
    return []
  },
},
```

- [ ] **Step 2: 修改 getLogMeta 返回 summary 函数**

```js
function getLogMeta(type) {
  return (
    logTypeMeta[type] || {
      label: formatLogKey(type),
      color: 'text-gray-500',
      icon: 'fa-solid fa-circle-info',
      pillClass: 'bg-gray-100 text-gray-700',
      summary: function () { return [] },
    }
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add src/App.vue
git commit -m "feat: add type-specific summary functions to logTypeMeta"
```

---

### Task 5: App.vue — 列表分级展开（折叠/展开/详情三级）

**Files:**
- Modify: `src/App.vue:637-668`

- [ ] **Step 1: 新增 expandedLogId 状态**

在 `<script setup>` 中（约 line 56 `const selectedLog` 附近）：

```js
var expandedLogId = ref(null)
```

- [ ] **Step 2: 新增 toggleExpand 函数**

在 `openLogDetail` 函数附近：

```js
function toggleExpand(log) {
  if (expandedLogId.value === log.id) {
    expandedLogId.value = null
  } else {
    expandedLogId.value = log.id
  }
}
```

- [ ] **Step 3: 重写日志列表模板（line 637-668）**

将现有的日志列表模板替换为：

```html
<div class="flex-1 overflow-y-auto space-y-2 p-4">
  <div v-if="store.operationLogs.length === 0" class="text-center text-gray-400 py-8">暂无日志记录</div>
  <div
    v-for="log in store.operationLogs.slice(0, 100)"
    :key="log.id"
    class="p-3 rounded-lg cursor-pointer transition-colors"
    :class="expandedLogId === log.id ? 'bg-blue-50 border border-blue-200' : 'bg-gray-50 hover:bg-gray-100'"
    @click="toggleExpand(log)"
  >
    <!-- 折叠态总是可见的 -->
    <div class="flex justify-between items-start">
      <div class="flex items-start gap-2 min-w-0">
        <span class="inline-block px-2 py-0.5 rounded text-xs font-medium shrink-0" :class="getLogMeta(log.type).pillClass">
          {{ getLogMeta(log.type).label }}
        </span>
        <div class="min-w-0">
          <span class="text-sm text-gray-800 break-words">{{ log.message }}</span>
        </div>
      </div>
      <span class="text-xs text-gray-400 whitespace-nowrap ml-2 shrink-0">{{ new Date(log.time).toLocaleString() }}</span>
    </div>

    <!-- 展开态：内联摘要 -->
    <div v-if="expandedLogId === log.id && getLogMeta(log.type).summary" class="mt-2 border-t border-blue-100 pt-2">
      <div class="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
        <span v-for="(line, i) in getLogMeta(log.type).summary(log.detail)" :key="i">{{ line }}</span>
      </div>
      <div class="mt-2 flex items-center gap-3">
        <button class="text-[11px] text-blue-600 hover:text-blue-800 font-medium" @click.stop="openLogDetail(log)">
          <i class="fa-solid fa-magnifying-glass mr-1" />查看详情
        </button>
        <span class="text-[11px] text-gray-300">收起 ▲</span>
      </div>
    </div>

    <!-- 折叠态提示 -->
    <div v-if="expandedLogId !== log.id" class="mt-1 text-[11px] text-blue-500">点击查看详情</div>
  </div>
</div>
```

- [ ] **Step 4: 删除旧的兜底字段段（原是 line 652-660）**

旧代码中的 `v-if="log.detail.qty"` 等万能模板已在 Step 3 中整体替换。

- [ ] **Step 5: Commit**

```bash
git add src/App.vue
git commit -m "feat: implement fold/expand/detail three-level operation log display"
```

---

### Task 6: App.vue — 详情弹窗分层（修改明细优先，技术字段折叠）

**Files:**
- Modify: `src/App.vue:124-168, 671-737`

- [ ] **Step 1: 重写 getLogDetailEntries — 白名单模式**

将 `getLogDetailEntries`（line 141-144）替换为：

```js
function getLogDetailEntries(detail) {
  if (!detail || typeof detail !== 'object') return []
  // 白名单：只展示用户关心的字段，不展示技术属性
  var userFields = ['sid', 'name', 'affected', 'deletedCount', 'count', 'totalItems', 'totalSids',
    'batch', 'purchaseGroupId', 'paymentBatch', 'category', 'transferId', 'inStockDate']
  return Object.entries(detail).filter(function (entry) {
    var key = entry[0]
    // 隐藏 changes（单独表格渲染）、内部数组、以及已通过 message/摘要展示的字段
    if (key === 'changes' || key === 'sidSummary' || key === 'deletedNames' || key === 'deletedItemIds' || key === 'changedFields' || key === 'itemId' || key === 'itemNames' || key === 'qty' || key === 'price' || key === 'cost' || key === 'profit' || key === 'amount' || key === 'account' || key === 'recordId' || key === 'loanId') return false
    return userFields.indexOf(key) >= 0
  })
}
```

- [ ] **Step 2: 重写 formatLogDetailValue — 不展示 JSON**

```js
function formatLogDetailValue(value) {
  if (value === null || value === undefined || value === '') return '-'
  if (typeof value === 'object') {
    // 不再 JSON.stringify，改为显示类型提示
    return '[复杂数据，请查看上方明细]'
  }
  return String(value)
}
```

- [ ] **Step 3: 在详情弹窗模板中添加 sidSummary 商品清单表格**

在详情弹窗中 `changes` 渲染块之后（line 726 `</template>` 之后），插入：

```html
<!-- 商品清单（购买组新增） -->
<template v-if="selectedLog?.detail?.sidSummary && selectedLog.detail.sidSummary.length > 0">
  <div class="bg-green-50 text-green-700 px-3 py-2 text-xs font-medium border-b border-green-100">商品清单</div>
  <div class="overflow-x-auto">
    <table class="w-full text-xs">
      <thead>
        <tr class="bg-gray-50 text-gray-500">
          <th class="px-3 py-1.5 text-left font-medium">SID</th>
          <th class="px-3 py-1.5 text-left font-medium">名称</th>
          <th class="px-3 py-1.5 text-right font-medium">日元原价</th>
          <th class="px-3 py-1.5 text-center font-medium">件数</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(s, si) in selectedLog.detail.sidSummary" :key="si" class="border-b border-gray-50">
          <td class="px-3 py-1.5 text-gray-500 font-mono">{{ s.sid }}</td>
          <td class="px-3 py-1.5">{{ s.name }}</td>
          <td class="px-3 py-1.5 text-right">{{ s.originalPrice ? '\xA5' + s.originalPrice : '-' }}</td>
          <td class="px-3 py-1.5 text-center">{{ s.qty }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<!-- 删除清单 -->
<template v-if="selectedLog?.detail?.deletedNames && selectedLog.detail.deletedNames.length > 0">
  <div class="bg-red-50 text-red-700 px-3 py-2 text-xs font-medium border-b border-red-100">
    已删除 {{ selectedLog.detail.deletedCount || selectedLog.detail.deletedNames.length }} 件商品
  </div>
  <div class="px-3 py-2 text-xs text-gray-600">
    {{ selectedLog.detail.deletedNames.join('、') }}
  </div>
</template>
```

- [ ] **Step 4: 将技术字段区改为默认折叠**

在详情弹窗底部（在商品清单/删除清单之后，`getLogDetailEntries` 渲染之前），包装技术字段：

```html
<!-- 数据追踪（默认折叠） -->
<div class="border-t border-gray-100 pt-3">
  <button class="text-xs text-gray-400 hover:text-gray-600 w-full text-left" @click="showLogMeta = !showLogMeta">
    <i :class="showLogMeta ? 'fa-solid fa-chevron-down' : 'fa-solid fa-chevron-right'" class="mr-1" />
    数据追踪
  </button>
  <div v-if="showLogMeta" class="mt-2 text-xs text-gray-400 space-y-1">
    <div>type: {{ selectedLog?.type || '-' }}</div>
    <div>id: {{ selectedLog?.id || '-' }}</div>
    <div>time: {{ selectedLog?.time || '-' }}</div>
  </div>
</div>
```

在 `<script setup>` 中新增：

```js
var showLogMeta = ref(false)
```

并在 `openLogDetail` 中重置：

```js
function openLogDetail(log) {
  selectedLog.value = log || null
  showLogDetailModal.value = true
  showLogMeta.value = false  // 重置折叠
}
```

- [ ] **Step 5: Commit**

```bash
git add src/App.vue
git commit -m "feat: restructure log detail popup - whitelist fields, product table, collapsed meta"
```

---

### Task 7: PurchaseModule.vue — sidSummary 增加日元原价

**Files:**
- Modify: `src/modules/purchase/PurchaseModule.vue:939-953`

- [ ] **Step 1: 在 sidSummary 中增加 originalPrice 和 cost**

将 line 939-953 的 `sidSummary` 构建逻辑改为：

```js
var sidSummary = Array.from(
  createdItems.reduce(function (m, item) {
    var sid = String(item && item.sid ? item.sid : '').trim()
    if (!sid) return m
    var pd = item.purchaseDetails || {}
    if (!m.has(sid)) {
      m.set(sid, {
        sid: sid,
        name: item.name || '未命名商品',
        qty: 0,
        originalPrice: Number(pd.originalPrice || 0),
        cost: Number(item.cost || 0),
      })
    }
    m.get(sid).qty += 1
    return m
  }, new Map()).values(),
)
```

- [ ] **Step 2: Commit**

```bash
git add src/modules/purchase/PurchaseModule.vue
git commit -m "feat: add originalPrice and cost to sidSummary in purchase_add log"
```

---

### Task 8: 全面验证

- [ ] **Step 1: 启动应用**

```bash
npm run dev
```

- [ ] **Step 2: 验证编辑类日志消息**

在库存页面编辑任意商品（改名称+成本），检查操作日志弹窗 → 应直接看到 `编辑库存: XXX ← 名称:旧→新, 成本:¥80→¥87`

在采购页面编辑商品 → `编辑采购商品: XXX ← 品牌:A→B`

在销售页面编辑 → `编辑销售: XXX ← 售价:¥75→¥80`

在基金流水编辑 → `编辑流水: 买小车 | XXX ← 金额:¥19→¥29`

在支付宝计算参数修改 → `更新参数: 未确认款:¥1760→¥893`

在购买组编辑 → `编辑购买组: J20039 ← 3个商品变更`

- [ ] **Step 3: 验证分级展开**

1. 打开操作日志弹窗 → 所有条目默认折叠，只显示标签+消息+时间
2. 单击某个购买组新增日志 → 展开显示"4件 · 批次:26h批 · 支付:J2支0T · 商品:JP-01BB(1件)、JP-01BC(1件)"
3. 再次单击同一条目 → 折叠
4. 单击另一条目 → 前一个自动折叠，新条目展开

- [ ] **Step 4: 验证删除聚合**

在库存页面，连续快速点击删除同SID的2-3件商品 → 检查日志弹窗 → 应只显示1条合并日志 `删除商品: XXX x3`

- [ ] **Step 5: 验证详情弹窗**

1. 展开任意编辑类日志 → 点击"查看详情" → 弹窗中修改明细表格显示字段中文名+修改前/后
2. 展开新增购买组日志 → 点击"查看详情" → 商品清单表格显示 SID/名称/日元原价/件数
3. 弹窗底部"数据追踪"默认折叠，点击展开才显示 type/id/time
4. **确认弹窗中不出现任何 JSON.stringify 的原始输出**

- [ ] **Step 6: 验证撤销/重做**

1. 编辑商品 → 查看日志 → 点击撤销 → 数据回滚
2. 删除商品(多品) → 查看日志 → 点击撤销 → 逐一恢复
3. 确认撤销/重做计数器正常

- [ ] **Step 7: 验证向后兼容**

刷新页面后，旧日志（改进前生成的）仍正常显示，不报错。
旧日志的 `detail` 无 `originalPrice` 时，商品清单表格该列显示 `-`。

- [ ] **Step 8: Commit（如有修复）**

```bash
git add -A
git commit -m "fix: verification fixes for operation log readability"
```

---

## 依赖关系

```
Task 1 (FIELD_LABEL_MAP) ──┬── Task 3 (edit messages) ── Task 8 (verify)
                           │
                           ├── Task 4 (summary meta)
                           │        │
Task 2 (delete aggregate) ─┤        ├── Task 5 (expand/collapse)
                                    │        │
                                    │        └── Task 6 (detail popup)
                                    │
Task 7 (sidSummary price) ─────────┘
```

- Tasks 1+2 可并行
- Task 3 依赖 Task 1
- Tasks 4+7 可并行
- Task 5 依赖 Task 4
- Task 6 依赖 Task 5
- Task 8 依赖全部

## 风险点

| 风险 | 缓解 |
|------|------|
| 删除合并影响 undo（每个 deleteItem 对应一个 undo entry，合并日志后第一个 undo entry 被 attach 了 message，后续的未 attach 仍可独立撤销） | Task 8 Step 6 验证撤销/重做 |
| `formatChangesSummary` 对 purchase_group_edit 的嵌套 changes（key=商品label, value={before:{},after:{}}）不适用 | purchase_group_edit 已单独处理，不调用 formatChangesSummary |
| 旧日志无 `summary` 函数 → expand 时空白 | `getLogMeta` 默认返回 `summary: function(){return []}` |
