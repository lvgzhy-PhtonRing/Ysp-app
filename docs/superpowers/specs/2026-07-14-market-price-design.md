# 市场价格模块 — 设计文档

> 2026-07-14 · 大王陛下提出 · ysp-app

## 1. 概述

为长线库存货品（`isLongTerm=true`）新增**市场价格**属性，支持带时间戳的历史价格记录，用于监控长线货品的市值变化、盈亏分析和涨跌幅排行。

### 核心目标

1. 用户可在独立板块内输入长线货品的市场价格
2. 同 `name+brand` 的货品自动联动，价格保持一致
3. 统计总市值、品牌市值、盈亏分布、涨跌幅排行
4. 短线货品（`isLongTerm≠true`）不显示此属性
5. 完整保留历史价格变更记录，支持趋势回溯

### 成功标准

- [ ] 侧边栏出现第 7 个板块"市场价格"
- [ ] 长线货品可输入/更新市场价格，带时间戳
- [ ] `name+brand` 联动：修改一个 → 所有同名同品牌长线货品同步更新
- [ ] 短线货品在任何界面都不显示市场价格字段
- [ ] 统计摘要：总市值、品牌市值、品牌涨跌幅、盈亏计数
- [ ] 涨幅/跌幅 TOP 5 排行榜

---

## 2. 数据模型

### 2.1 item 新增字段

在现有 item 对象上追加 `marketPrices` 数组，**仅在 `isLongTerm=true` 时有效**：

```js
{
  // ... 现有字段
  isLongTerm: true,

  // 新增 ↓
  marketPrices: [
    { price: 420, timestamp: "2026-07-14T10:23:00Z" },
    { price: 380, timestamp: "2026-07-01T14:05:00Z" },
    { price: 350, timestamp: "2026-06-15T09:30:00Z" },
  ]
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `marketPrices` | `Array<{price, timestamp}>` | 价格历史列表，**降序**（最新在前） |
| `price` | `Number` | 市场价格（RMB） |
| `timestamp` | `String` (ISO 8601) | 记录时间 |

### 2.2 派生属性（computed）

- **当前市价** = `marketPrices[0]?.price`（数组第一项，最新）
- **上次更新** = `marketPrices[0]?.timestamp`
- **涨跌幅** = `(当前市价 − 成本) / 成本 × 100%`
- **是否标价** = `Array.isArray(marketPrices) && marketPrices.length > 0`

### 2.3 数据约束

- `isLongTerm !== true` 的货品：`marketPrices` 始终为 `undefined`，不参与任何计算
- `marketPrices` 数组**最大保留 100 条**（防无限增长），超出时丢弃最旧记录

---

## 3. 侧边栏

### 3.1 新板块注册

在 `src/App.vue` 的 `tabs` 数组中追加第 7 项：

```js
const tabs = [
  { id: 'home',        name: '数据透视' },
  { id: 'inventory',   name: '库存管理' },
  { id: 'sales',       name: '销售记账' },
  { id: 'purchase',    name: '采购管理' },
  { id: 'finance',     name: '公共收支' },
  { id: 'rushcar',     name: '美淘记录' },
  // ↑ 现有 6 项
  { id: 'market-price', name: '市场价格' },  // ← 新增第 7 项
]
```

### 3.2 侧边栏渲染图标

在 `src/components/AppSidebar.vue` 的 `iconMap` 追加：

```js
const iconMap = {
  // ... 现有图标
  'market-price': 'fa-solid fa-chart-line',
}
```

### 3.3 模板路由

在 `src/App.vue` 模板追加条件渲染：

```html
<MarketPriceModule v-else-if="currentTab === 'market-price'" />
```

---

## 4. 模块架构

### 4.1 文件结构

```
src/modules/market-price/
  index.js                       # 模块入口标记
  MarketPriceModule.vue          # 主组件：布局容器
  useMarketPrice.js              # composable：数据查询/计算逻辑
  useMarketPrice.test.js         # 单元测试
```

### 4.2 依赖关系

```
MarketPriceModule.vue
  └─ useMarketPrice.js
       ├─ 读取 store.items（过滤 isLongTerm=true + 有 marketPrices 的）
       ├─ 按 brand 分组统计
       ├─ 计算总市值/涨跌幅/排行
       └─ 导出 updateMarketPrice(item, newPrice) 写入函数
            ├─ 遍历匹配 name+brand 的 items
            ├─ 每条 push { price, timestamp: new Date().toISOString() }
            ├─ 截断至 max 100 条
            ├─ saveToLocalStorage()
            └─ addOperationLog('market_price_update', ...)
```

---

## 5. 页面布局

### 5.1 整体结构

```
┌─────────────────────────────────────────────────┐
│ 侧边栏  │  📈 市场价格   长线货品市值监控        │
│         │                                        │
│ 数据透视 │  ┌──────┬──────┬──────┬──────┐       │
│ 库存管理 │  │总市值 │ 件数 │ 盈利 │收益率│       │
│ 销售记账 │  └──────┴──────┴──────┴──────┘       │
│ 采购管理 │                                        │
│ 公共收支 │  [TLV  ¥32,400  ↑22.6%] [MINIGT ...] │ ← 品牌统计条
│ 美淘记录 │  ───────                              │
│ ─────── │  搜索框  品牌筛选  按涨跌幅/市值排序    │
│ 📈市场  │  ┌────────────────────────────────┐   │
│  价格   │  │ ▼ TLV       12件  +22.6%       │   │ ← 品牌分组
│   [NEW] │  │  GT-R R35    成本280  市价420  │   │
│         │  │  Supra A90   成本320  市价245  │   │
│         │  │ ▼ MINIGT     9件   +15.3%     │   │
│         │  │  911 GT3 RS  成本195  市价259  │   │
│         │  └────────────────────────────────┘   │
│         │                                        │
│         │  ┌─────────────┬─────────────┐       │
│         │  │ 📈 涨幅TOP5  │ 📉 跌幅TOP5  │       │
│         │  └─────────────┴─────────────┘       │
└─────────────────────────────────────────────────┘
```

### 5.2 统计摘要卡片（4 张）

| 卡片 | 计算逻辑 |
|------|---------|
| **总市值** | `∑ 各长线货品当前市价`（未标价不参与） |
| **长线货品数量** | `count(isLongTerm=true)` / 已标价 N / 未标价 M |
| **整体盈利** | `∑ (当前市价 − 成本)`，绿色为正红色为负 |
| **整体收益率** | `(∑盈利) / (∑成本) × 100%` |

### 5.3 品牌统计条

横向滚动容器，每品牌一个卡片：

| 显示 | 计算 |
|------|------|
| **品牌名** | `brand` 字段 |
| **品牌总市值** | `∑ (该品牌长线货品当前市价)` |
| **品牌涨跌幅** | `(∑当前市价 − ∑成本) / ∑成本 × 100%` |
| **件数统计** | `N 件 · M 件已标价` |

按品牌涨跌幅降序排列，正数绿色 ↑，负数红色 ↓。

### 5.4 货品列表（按品牌分组）

**分组标题行**（蓝色背景）：
- `▼ 品牌名` + `N 件 · 市值 ¥X · ↑/↓ 涨幅 X%`

**货品行**：

| 列 | 内容 |
|------|------|
| **货品** | 名称 + 批次标签 |
| **成本** | `item.cost` |
| **最新市价** | `marketPrices[0]?.price` 或 `—`（未标价） |
| **涨跌幅** | 百分比 + 迷你进度条（绿涨红跌） |
| **状态** | `盈利` (绿色) / `亏损` (红色) / `未标价` (灰色) |
| **操作** | `更新价格` 按钮 + `🕐` 展开历史 + `🔗 联动` 标识 |

**联动标识**：当修改此货品的市场价格会同步更新其他同 `name+brand` 货品时显示。

**空状态**：若无长线货品 → 显示"暂无长线库存货品"。
**无价格状态**：有长线货品但均未标价 → 显示"尚未输入任何市场价格"。

### 5.5 价格历史时间线

点击 `🕐` 展开行，展示：

```
市场价格历史 · Nissan GT-R (R35)
● ¥420  2026-07-14 10:23  +¥40
● ¥380  2026-07-01 14:05  +¥30
● ¥350  2026-06-15 09:30  +¥70
● ¥280  2026-06-01 16:00  首次标价 = 成本
```

最新记录绿色圆点，其余蓝色圆点。每条显示与上一条的价差。

### 5.6 涨跌幅排行榜

| 排行 | 涨幅 TOP 5 | 跌幅 TOP 5 |
|------|-----------|-----------|
| 🥇 金 | 涨幅最大 | 跌幅最大 |
| 🥈 银 | ... | ... |
| 🥉 铜 | ... | ... |
| 4 | ... | ... |
| 5 | ... | ... |

每行：排行奖牌 + 名称（品牌） + 涨跌幅百分比。

---

## 6. 交互逻辑

### 6.1 更新市场价格

1. 用户点击行内 `更新价格` 按钮
2. 弹出价格输入弹窗：
   - **货品名**：`Nissan GT-R (R35) · TLV`
   - **当前市价**：¥420（若已标价）/ —（若未标价）
   - **新价格**：数字输入框（默认上次价格）
   - **联动提示**：`将同时更新 N 件同名称+品牌货品的市场价格`
3. 用户输入新价格，点击确认
4. 系统：
   - 在当前 item 的 `marketPrices` 追加 `{ price, timestamp: now }`
   - 自动截断至 100 条
   - 查找所有 `isLongTerm=true && name===X && brand===Y` 的 items
   - 对每个匹配 item 执行同样追加操作
   - `saveToLocalStorage()`
   - `addOperationLog('market_price_update', message, detail)`

### 6.2 联动范围

```js
function getLinkedItems(item) {
  return store.items.filter(i =>
    i.isLongTerm === true &&
    i.name === item.name &&
    i.brand === item.brand
  )
}
```

### 6.3 短线货品隐藏

- 在 `useMarketPrice.js` 的计算属性中过滤 `isLongTerm === true`
- 短线货品永远不会出现在市场价格板块中
- 短线货品对象上即使意外存在 `marketPrices` 字段也不显示

---

## 7. 操作日志

新增日志类型：

```js
market_price_update: {
  label: '市价更新',
  color: 'text-blue-600',
  icon: 'fa-solid fa-chart-line',
  pillClass: 'bg-blue-100 text-blue-700',
  summary: function(d) {
    var parts = []
    if (d.price) parts.push('¥' + Number(d.price).toFixed(0))
    if (d.linkedCount > 1) parts.push('联动' + d.linkedCount + '件')
    return parts
  },
}
```

---

## 8. 字段映射

在 `FIELD_LABEL_MAP` 中新增：

```js
marketPrices: '市场价格',
```

---

## 9. 排除范围

以下场景**不**属于此版本范围：
- ❌ 市场价格趋势图表（Chart.js）— 仅展示文本时间线
- ❌ 单独的历史价格编辑/删除功能
- ❌ 从外部数据源自动获取市场价格
- ❌ 导出/云同步特殊处理（marketPrices 作为 item 属性已包含在标准导出中）

---

## 10. 实现步骤

| # | 任务 | 涉及文件 |
|---|------|---------|
| 1 | 创建 `src/modules/market-price/` 目录及 index.js | 新建 |
| 2 | 编写 `useMarketPrice.js` — 数据查询、分组、统计、更新逻辑 + 单元测试 | 新建 |
| 3 | 编写 `MarketPriceModule.vue` — 完整页面布局 | 新建 |
| 4 | 注册侧面栏：`App.vue` tabs + 模板路由 + import | `src/App.vue` |
| 5 | 追加图标：`AppSidebar.vue` iconMap | `src/components/AppSidebar.vue` |
| 6 | 注册操作日志类型 + 字段映射 | `src/App.vue` / `src/data/store.js` |
| 7 | 端到端验证：输入价格 → 联动 → 统计 → 排行 | 手动测试 |
