# 操作日志可读性改进 — 设计文档

> 2026-06-27 · 大王陛下提出 · ysp-app

## 1. 问题总览

操作日志系统记录了 34 种日志类型（44 处 `addOperationLog` 调用），当前存在四级可读性问题：

| 级别 | 问题 | 影响类型数 |
|------|------|-----------|
| P0 | 编辑类日志消息不含变更内容，必须点击详情弹窗才能看见改了什么 | 8 |
| P1 | 同SID多品删除产生多条孤立日志，无法一眼看出"共删几件" | 2 |
| P2 | 新增购买组缺日元原价，菜单内容过多排版占用过大 | 1 |
| P3 | 详情弹窗堆砌原始JSON，技术字段干扰阅读 | 全部 |
| P4 | 列表摘要字段用万能模板，信息密度低、不匹配类型 | 全部 |

## 2. 设计目标

1. **不展示原始JSON** — 用户只看到核心变更字段的中文映射
2. **编辑类日志消息内联变更摘要** — 无需点击即知改了什么
3. **删除操作200ms窗口内合并同SID多品** — 一条日志展示总数
4. **列表分级展开** — 默认折叠，单击展开内联摘要，再单击查看详情弹窗
5. **详情弹窗分层** — 修改明细优先，技术字段隐藏

---

## 3. 第一层：消息文本优化

### 3.1 字段名→中文映射表

放置在 `src/data/store.js` 中作为公共常量，所有模块共用：

```js
export const FIELD_LABEL_MAP = {
  // 通用
  name: '名称',
  brand: '品牌',
  cost: '成本',
  category: '大类',
  batch: '批次',
  amount: '金额',
  type: '类型',
  date: '日期',
  account: '账户',
  note: '备注',

  // 品相
  isDefect: '品相',
  isLongTerm: '长线',

  // 销售
  price: '售价',
  express: '运费',
  feeRate: '费率',
  deduction: '扣减',

  // 采购/转运
  totalRMB: '总RMB',
  paymentBatch: '支付批次',
  paymentAccount: '支付账户',
  exchangeRate: '汇率',
  originalPrice: '日元原价',
  domesticShipping: '国内运费',
  transferCoefficient: '分摊系数',

  // 收支/借贷
  item: '项目',
  counterparty: '对方',

  // calc
  debt: '总负债',
  wechat: '微信余额',
  publicExp: '公摊支出',
  unconfirmed: '未确认款',
  fund: '备用金',
}
```

### 3.2 消息生成函数

在 `src/data/store.js` 新增工具函数：

```js
/**
 * 将 changes 对象转为可读摘要字符串
 * @param {object} changes — { fieldName: { before, after } }
 * @returns {string} 如 "名称, 成本:¥80→¥87"
 */
export function formatChangesSummary(changes) {
  if (!changes || typeof changes !== 'object') return ''
  const entries = Object.entries(changes)
  if (entries.length === 0) return ''
  const parts = entries.map(([key, val]) => {
    const label = FIELD_LABEL_MAP[key] || key
    if (val && typeof val === 'object' && 'before' in val && 'after' in val) {
      return `${label}:${fmtBrief(val.before)}→${fmtBrief(val.after)}`
    }
    return label
  })
  return parts.join(', ')
}

function fmtBrief(v) {
  if (v === null || v === undefined || v === '') return '-'
  if (typeof v === 'number') return `¥${Number(v).toFixed(0)}`
  if (typeof v === 'boolean') return v ? '是' : '否'
  return String(v).slice(0, 20)
}
```

### 3.3 各编辑日志调用点改造

消息格式规范：`[动作]: [对象名] ← [变更字段摘要]`

| 日志类型 | 文件 | 改造前 | 改造后 |
|---------|------|--------|--------|
| `purchase_edit` | PurchaseModule.vue:1520 | `编辑采购商品: ${name}` | `` `编辑采购商品: ${name}` + (变更摘要) `` |
| `inventory_edit` | useInventory.js:119 | `编辑库存` | `` `编辑库存: ${name}` + (变更摘要，含affected件数) `` |
| `sales_edit` | useSales.js:122 | `编辑销售记录: ${name}` | `` `编辑销售: ${name}` + (变更摘要) `` |
| `finance_update_record` | useFinance.js:68 | `编辑收支: ${item}` | `` `编辑收支: ${item}` + (变更摘要) `` |
| `finance_update_loan` | useFinance.js:119 | `编辑借贷: ${counterparty}` | `` `编辑借贷: ${counterparty}` + (变更摘要) `` |
| `payton_edit_record` | usePayton.js:334 | `编辑基金流水: ${category}` | `` `编辑流水: ${category}` + (变更摘要) `` |
| `purchase_group_edit` | PurchaseModule.vue:1309 | `编辑购买组` | `` `编辑购买组: ${groupId}` + (变更摘要) `` |
| `purchase_transfer_edit` | PurchaseModule.vue:1433 | `编辑转运记录: ${batch}` | `` `编辑转运: ${batch}` + (变更摘要) `` |
| `calc_update` | HomeModule.vue:95 | `更新参数: ${field}` | `` `更新参数: ${FIELD_LABEL_MAP[field]}:${before}→${after}` `` |

**示例输出**：
```
编辑采购商品: 高普保罗套R-34 ← 名称, 成本:¥80→¥87
编辑库存: 花园大道银猪 ← 名称, 品牌:Hotwheels→其它 (影响2件)
编辑销售: 永恒经典法拉利F50 ← 售价:¥75→¥80
编辑收支: 买保护壳 ← 金额:¥50→¥62
编辑借贷: 张三 ← 金额:¥1000→¥2000
编辑流水: 买小车 | 花园大道 ← 金额:¥19→¥29
编辑购买组: J20039 ← 支付批次, 总RMB:¥300→¥337
编辑转运: J转支0K ← 总RMB:¥200→¥250
更新参数: 未确认款:¥1760→¥893
```

---

## 4. 第二层：列表内联摘要（分级展开）

### 4.1 列表条目行（折叠态 default）

只显示 `[类型标签] + message + 时间`，移除底部兜底字段（652-660行）。

```
┌─────────────────────────────────────────────────┐
│ [库存编辑] 编辑库存: 银猪 ← 名称, 成本      12:30 │
│ [库存新增] 新增购买组: J20039（4件）        12:25 │
│ [库存删除] 删除商品: 银猪 x3               12:20 │
└─────────────────────────────────────────────────┘
```

### 4.2 展开态（单击条目）

新增内联摘要区域，按日志类型显示2-4个核心字段。每种类型自定义 `summary()` 逻辑。

**实现方案**：在 `logTypeMeta` 中为每种类型增加 `summary(detail)` 函数。

```js
// 在 logTypeMeta 中（App.vue）
purchase_add: {
  label: '采购新增',
  icon: '...',
  pillClass: '...',
  summary(detail) {
    const lines = []
    if (detail.totalItems) lines.push(`${detail.totalItems}件`)
    if (detail.batch) lines.push(`批次:${detail.batch}`)
    if (detail.paymentBatch) lines.push(`支付:${detail.paymentBatch}`)
    // 如果是组模式，显示商品清单
    if (Array.isArray(detail.sidSummary) && detail.sidSummary.length > 0) {
      lines.push(`商品:` + detail.sidSummary.map(s => `${s.sid}(${s.qty}件)`).join('、'))
    }
    return lines
  }
},
purchase_edit: {
  label: '采购编辑',
  summary(detail) {
    const parts = []
    if (detail.sid) parts.push(`SID:${detail.sid}`)
    if (detail.changedFields?.length) parts.push(`改${detail.changedFields.length}字段`)
    return parts
  }
},
inventory_delete: {
  label: '库存删除',
  summary(detail) {
    const parts = []
    if (detail.sid) parts.push(`SID:${detail.sid}`)
    if (detail.deletedCount > 1) parts.push(`共${detail.deletedCount}件`)
    return parts
  }
},
// ... 其余类型同理
```

### 4.3 交互流程

```
单击条目 → 内联展开/折叠（expandedLogId 状态管理）
点击"查看完整详情" → 弹出详情弹窗（原有行为保留）
```

在折叠态保留 `点击查看详情` 引导文字（已有），展开后该文字变为 `收起 ▲`。

---

## 5. 第三层：详情弹窗分层

### 5.1 弹窗结构

```
┌─ 日志详情 ────────────────────────────────────┐
│ 📦 采购编辑 · 2026/6/27 12:30               │
│                                                │
│ ▸ 描述（始终可见）                             │
│   编辑采购商品: 高普保罗套R-34 ← 名称, 成本    │
│                                                │
│ ▸ 修改明细（有 changes 时显示）                │
│   ┌──────────┬──────────────┬──────────────┐   │
│   │ 字段     │ 修改前        │ 修改后        │   │
│   ├──────────┼──────────────┼──────────────┤   │
│   │ 名称     │ 高普保罗套R-34│ 高普保罗套R-35│  │
│   │ 成本     │ ¥80          │ ¥87          │   │
│   └──────────┴──────────────┴──────────────┘   │
│                                                │
│ ▸ 商品清单（有 sidSummary 或批量操作时显示）    │
│   ┌──────────┬──────────────────┬────────┬───┐ │
│   │ SID      │ 名称             │ 日元   │件数│ │
│   ├──────────┼──────────────────┼────────┼───┤ │
│   │ JP-01BB  │ 高普保罗套R-34   │ ¥1,901 │ 1 │ │
│   │ JP-01BC  │ 高普速激Supra黑   │ ¥2,000 │ 1 │ │
│   └──────────┴──────────────────┴────────┴───┘ │
│                                                │
│ ▸ 删除清单（删除类日志）                        │
│   已删除 N 件商品：商品A、商品B、商品C           │
│                                                │
│ ▸ 数据追踪（默认折叠，调试用）                   │
│   type: purchase_edit  id: 1782527075872        │
│   time: 2026-06-27T04:30:00.000Z               │
└────────────────────────────────────────────────┘
```

### 5.2 实现策略

- `getLogDetailEntries()` 不再返回全部 `detail` 字段，改为白名单控制：
  - `changes` → 表格渲染（带中文映射）
  - `sidSummary` → 商品清单表格（sid/名称/日元原价/件数）
  - `deletedNames` → 删除清单列表
  - `changedFields` → 隐藏（已通过 changes 展示）
  - 其余技术字段（`totalItems`, `totalSids`, `purchaseGroupId` 等）→ 不展示或放入数据追踪区

---

## 6. P1：删除聚合机制

### 6.1 问题场景

多库存商品一次删除多条 item（同SID），当前 `deleteItem()` 被循环调用产生N条独立日志。

### 6.2 方案：200ms 时间窗口内合并

在 `addOperationLog` 中新增去重合并逻辑：

```js
const DELETE_LOG_TYPES = new Set(['inventory_delete', 'purchase_delete'])
const DELETE_MERGE_WINDOW_MS = 200

export function addOperationLog(type, message, detail = {}) {
  // 删除聚合：检查上一条日志是否可合并
  if (DELETE_LOG_TYPES.has(type) && state.operationLogs.length > 0) {
    const last = state.operationLogs[0]
    const timeGap = Date.now() - new Date(last.time).getTime()
    if (
      last.type === type &&
      last.detail?.sid === detail?.sid &&
      timeGap < DELETE_MERGE_WINDOW_MS
    ) {
      // 合并：更新计数和消息
      const prevCount = last.detail?.deletedCount || 1
      const newCount = prevCount + 1
      const prevIds = Array.isArray(last.detail?.deletedItemIds) ? last.detail.deletedItemIds : [last.detail?.itemId || last.id]
      last.detail = {
        ...last.detail,
        deletedCount: newCount,
        deletedItemIds: [...prevIds, detail.itemId],
        deletedNames: [...(last.detail.deletedNames || [last.detail.name]), detail.name],
      }
      last.message = `删除商品: ${detail.name} x${newCount}`
      // 更新时间戳到最新
      last.time = new Date().toISOString()
      last.id = Date.now() + Math.floor(Math.random() * 1000)
      saveUiStateToLocalStorage()
      return
    }
  }

  // ... 原有新增逻辑
}
```

**效果**：
```
删除前:  删除商品: 花园大道银猪 (12:20:00.100)
         删除商品: 花园大道银猪 (12:20:00.150)
         删除商品: 花园大道银猪 (12:20:00.180)

删除后:  删除商品: 花园大道银猪 x3 (12:20:00.180)
         内联摘要: SID: JP-01BE · 共3件
```

### 6.3 注意事项

- 只对**同SID**合并，不同SID不合并
- `inventory_delete` 和 `purchase_delete` 分别在自己的队列中合并
- 合并后 `message` 更新为 `xN` 格式
- 合并后的日志 `id` 和 `time` 更新为最新（保持列表顶部位置）

---

## 7. P2：购买组日志增加日元原价

### 7.1 当前结构

`PurchaseModule.vue:939-953` 的 `sidSummary`:
```js
{ sid: "JP-01BB", name: "高普保罗套R-34", qty: 1 }
```

### 7.2 改造后

```js
{
  sid: "JP-01BB",
  name: "高普保罗套R-34",
  qty: 1,
  originalPrice: 1901,          // 新增：日元原价
  cost: 87.44,                  // 新增：人民币成本
}
```

改动点：`PurchaseModule.vue:939-953`，在构建 `sidSummary` 时从 `createdItems` 中读取 `purchaseDetails.originalPrice` 和 `cost`。

---

## 8. 文件变更清单

| 文件 | 改动内容 | 改动量 |
|------|----------|--------|
| `src/data/store.js` | 新增 `FIELD_LABEL_MAP`、`formatChangesSummary()`、删除聚合逻辑、`addOperationLog` 增强 | ~60行 |
| `src/App.vue` | `logTypeMeta` 增加 `summary()` 函数、列表渲染改为分级展开、详情弹窗改为分层结构、`getLogDetailEntries` 改为白名单 | ~150行 |
| `src/modules/inventory/useInventory.js` | `deleteItem` 传更多detail字段、`editItem` 消息改为内联摘要格式 | ~10行 |
| `src/modules/purchase/usePurchase.js` | `deletePurchaseItem` 传更多detail字段 | ~5行 |
| `src/modules/purchase/PurchaseModule.vue` | `sidSummary` 增加 `originalPrice`；编辑类日志消息改为内联摘要 | ~15行 |
| `src/modules/sales/useSales.js` | `editSaleRecord` 消息改为内联摘要 | ~5行 |
| `src/modules/finance/useFinance.js` | `updateFinanceRecord`、`updateLoanRecord` 消息改为内联摘要 | ~8行 |
| `src/modules/payton/usePayton.js` | `editPaytonRecord` 消息改为内联摘要 | ~8行 |
| `src/modules/home/HomeModule.vue` | `calc_update` 消息改为内联 before→after 格式 | ~5行 |

**合计约 260 行**,跨 9 个文件。

---

## 9. 验收标准

1. **编辑类日志**：在操作日志列表中不点击即可看到改了什么字段+新旧值
2. **同SID多品删除**：只显示1条合并日志，消息末尾显示 `x总件数`
3. **新增购买组日志**：展开后能看到每个商品的日元原价
4. **详情弹窗**：不出现任何 `JSON.stringify` 的原始对象输出
5. **分级展开**：默认折叠→单击展开摘要→点击"查看详情"弹窗
6. **向后兼容**：不改变日志数据结构，`operationLogs` 数组格式不变（合并删除除外，只加字段不减字段）
7. **撤销/重做**：不影响 `undoStack`/`redoStack` 的正常工作
