# 现金流与负债监控面板设计

> 日期：2026-06-22
> 状态：设计稿

---

## 背景

数据透视页目前侧重销售额/成本/利润的静态统计，缺少**现金流视角**的时间序列展示。大王陛下需要一个位于商品查询器之上的监控区域，直观呈现每月现金流入流出与负债变化趋势。

---

## 布局位置

插入点：支付宝余额计算器 与 商品查询器 之间。

```
HomeModule.vue 当前布局:
  本月数据 + 近三个月
  采购中金额
  库存概览 (3 cards)
  支付宝余额计算器
  ───── ★ 新区域插入点 ★ ─────
  商品查询器
  各批次回款统计
```

---

## 新区域布局

```
┌─────────────────────────────────────────────────────────┐
│  现金流与负债监控                                         │
│                                                         │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐ │
│  │ 净回款    │  │ 库存消化  │  │ 采购总投入│  │ 负债规模  │ │
│  │ ¥12,345  │  │ ¥8,901   │  │ ¥15,000  │  │ ¥45,678  │ │
│  │          │  │          │  │          │  │          │ │
│  │ ▃ ▅ ▇   │  │ ▇ ▅ ▃   │  │ ▃ ▅ ▇   │  │ ▇ ▇ ▅   │ │
│  │ 4 5 6月 │  │ 4 5 6月  │  │ 4 5 6月  │  │ 4 5 6月  │ │
│  │   ↑+12% │  │   ↓-5%   │  │   ↑+8%   │  │   ↓-3%   │ │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘ │
│                                                         │
│  ┌─────────────────────────────────────────────────────┐│
│  │  6 个月现金流与负债趋势  (Chart.js 混合图)            ││
│  │  ▓▓ 净回款(柱)  ▓▓ 采购投入(柱)  ── 负债(折线)       ││
│  │  -2.3k  +1.5k  -3.1k  +0.8k  -4.2k  -2.7k (差额)  ││
│  └─────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────┘
```

---

## 文件规划

| 文件 | 职责 | 规模 |
|------|------|:----:|
| `src/modules/home/useCashflow.js` | 纯计算 composable：按月聚合 4 项指标 | ~80 行 |
| `src/modules/home/CashflowMonitor.vue` | 指标卡片 + Chart.js 混合图 + 交互 | ~200 行 |
| `src/modules/home/HomeModule.vue` | 引入 `<CashflowMonitor>`，插在指定位置 | +3 行 |
| `package.json` | 新增 `chart.js` 依赖 | +1 行 |

---

## 一、指标卡片设计

### 1.1 四卡片规格

4 列 `grid grid-cols-4 gap-4`，每张卡片结构：

```
┌──────────────────────┐
│  标题 (text-sm gray)  │
│  ¥12,345 (text-2xl)  │  ← 当月值
│                      │
│  ▃   ▅   ▇           │  ← 3 根迷你柱 (纯 CSS div)
│  4月 5月 6月         │  ← 月份标签 (text-xs)
│  9.2k 11k 12.3k     │  ← 具体数值 (text-xs)
│            ↑+12%     │  ← 环比箭头 (text-xs, 绿/红)
└──────────────────────┘
```

### 1.2 迷你柱状条实现（零依赖）

```
▇ = 当月最高柱, max-height: 24px
▅ = 中间值, height 按比例缩放
▃ = 最低值

算法: 取 3 个月中的最大值 maxV
  每根柱 height = (value / maxV) * 24  (px)
  柱宽 = 8px, 间距 = 8px, 圆角 = 2px
  颜色: 统一灰色 #9ca3af，当月柱高亮为主色
```

### 1.3 环比计算

```
环比 = (当月值 - 上月值) / 上月值 × 100%
↑ 正值 → 绿色 #16a34a
↓ 负值 → 红色 #dc2626
```

---

## 二、混合图设计

### 2.1 依赖

```bash
npm install chart.js
```

### 2.2 图表配置

| 配置项 | 值 |
|--------|-----|
| 类型 | `bar` (主) + `line` (叠加) |
| 数据点 | 最近 6 个完整月 |
| 左 Y 轴 | 金额（元），净回款 + 采购投入 |
| 右 Y 轴 | 负债金额（元），折线专用 |

### 2.3 数据集

| 系列 | 类型 | 颜色 | Y 轴 |
|------|------|------|:----:|
| 净回款 | bar | `#16a34a` (绿) | 左 |
| 采购投入 | bar | `#f59e0b` (琥珀) | 左 |
| 负债规模 | line | `#3b82f6` (蓝) | 右 |

### 2.4 颜色语义

```
净回款   ▓▓ #16a34a  ← 正向现金流入，绿色
采购投入 ▓▓ #f59e0b  ← 资金消耗，暖色警示
负债     ── #3b82f6  ← 中性蓝色，折线+半透明面积填充
差额     +¥1,500 → 绿字    (回款＞采购)
         -¥2,300 → 红字    (采购＞回款，现金缺口)
```

### 2.5 差额标注

每月两柱之间顶部显示差额（净回款 - 采购投入）：
- 正值用绿色小字标注
- 负值用红色小字标注
- 通过 Chart.js `plugin` 自定义渲染文字

### 2.6 Tooltip 交互

悬停显示：月份 / 净回款 / 采购投入 / 差额 / 负债

---

## 三、数据计算 (useCashflow.js)

### 3.1 净回款（月）

```js
// 口径: saleDetails.price - express - price × feeRate - deduction
// 等价于: profit + cost（利用已有利润公式结果）
function getMonthlyNetCollection(items, year, month) {
  return items
    .filter(i => i?.status === 'sold' && saleMonthMatch(i, year, month))
    .reduce((s, i) => {
      const sd = i?.saleDetails || {}
      return s + Number(sd?.profit || 0) + Number(i?.cost || 0)
    }, 0)
}
```

### 3.2 库存消化（月）

```js
// 口径: 当月售出商品的 cost 总和
function getMonthlyInventoryDigestion(items, year, month) {
  return items
    .filter(i => i?.status === 'sold' && saleMonthMatch(i, year, month))
    .reduce((s, i) => s + Number(i?.cost || 0), 0)
}
```

### 3.3 采购总投入（月）

```js
// 口径: 按 purchaseDetails.purchaseDate 月份聚合所有 item 的 cost
// 日淘+美淘+国内统算
function getMonthlyProcurement(items, year, month) {
  return items
    .filter(i => {
      const d = i?.purchaseDetails?.purchaseDate
      if (!d) return false
      const dt = new Date(d)
      return dt.getFullYear() === year && dt.getMonth() + 1 === month
    })
    .reduce((s, i) => s + Number(i?.cost || 0), 0)
}
```

### 3.4 负债规模

```js
// 当前: calc.debt + loanBalance
// 历史: 从 snapshots[] 取每月最后一条快照的 calc.debt + finance.loanBalance
function getMonthlyDebt(snapshots, year, month) {
  const monthSnapshots = snapshots
    .filter(s => monthMatch(s.date, year, month))
    .sort((a, b) => b.date.localeCompare(a.date))
  if (monthSnapshots.length === 0) return null
  const last = monthSnapshots[0]
  return Number(last.calc?.debt || 0) + Number(last.finance?.loanBalance || 0)
}
```

### 3.5 主函数签名

```js
export function getCashflowData(store, now) {
  // 返回:
  // {
  //   current: { netCollection, inventoryDigestion, procurement, debt },
  //   last3Months: [{ month, year, netCollection, inventoryDigestion, procurement, debt }, ...],
  //   last6Months: [{ month, year, ... }, ...]
  // }
}
```

---

## 四、组件集成

### 4.1 CashflowMonitor.vue

```html
<script setup>
import { computed, onMounted, onBeforeUnmount, ref, watch } from 'vue'
import { Chart, registerables } from 'chart.js'
import { getCashflowData } from './useCashflow'
import { state as store } from '../../data/store'

Chart.register(...registerables)

const now = computed(() => new Date())
const data = computed(() => getCashflowData(store, now.value))

const chartCanvas = ref(null)
let chartInstance = null

function renderChart(sixMonthData) {
  if (chartInstance) chartInstance.destroy()
  if (!chartCanvas.value || !sixMonthData?.length) return
  chartInstance = new Chart(chartCanvas.value, { ... })
}

watch(data, () => renderChart(data.value.last6Months), { deep: true })
onMounted(() => renderChart(data.value.last6Months))
onBeforeUnmount(() => { if (chartInstance) chartInstance.destroy() })
</script>
```

### 4.2 响应式布局

卡片区基础 `grid-cols-4`，屏幕 < 1024px 时退化为 `grid-cols-2`（`lg:grid-cols-4`）。

### 4.3 HomeModule.vue 改动

```html
<!-- 支付宝余额计算器之后 -->
<CashflowMonitor />

<!-- 商品查询器 -->
<div class="apple-card">
  <h3>...商品查询器...</h3>
```

```js
import CashflowMonitor from './CashflowMonitor.vue'
```

### 4.4 依赖安装

```bash
npm install chart.js
```

---

## 五、边界处理

| 场景 | 处理 |
|------|------|
| 某月无售出 | 净回款/库存消化 = 0，柱不渲染 |
| 某月无采购 | 采购投入 = 0，柱不渲染 |
| 快照不足 6 个月 | 图表仅渲染有数据的月份（最少 1 个月起渲染） |
| 负债无历史快照 | 当月值显示，历史月份在图表中留空（折线断点） |
| 组件卸载 | `onBeforeUnmount` 中 `chartInstance.destroy()` |
| 数据更新 | `watch` data deep，销毁旧图重建 |

## 六、测试计划

| 测试文件 | 覆盖内容 |
|----------|---------|
| `src/modules/home/useCashflow.test.js` | 月度聚合计算、边界：空数据/跨年/缺失字段 |

---

## 七、改动汇总

| # | 文件 | 操作 | 规模 |
|:-:|------|:----:|:----:|
| 1 | `package.json` | 新增 chart.js 依赖 | +1 |
| 2 | `src/modules/home/useCashflow.js` | 新建 | ~80 行 |
| 3 | `src/modules/home/CashflowMonitor.vue` | 新建 | ~200 行 |
| 4 | `src/modules/home/HomeModule.vue` | 引入组件 | +3 行 |
| 5 | `src/modules/home/useCashflow.test.js` | 新建 | ~40 行 |
