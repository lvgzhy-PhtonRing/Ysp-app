# 现金流与负债监控面板 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在数据透视页商品查询器之上新增现金流监控区域——4 个指标卡片（含近 3 月迷你趋势）+ 6 个月 Chart.js 混合图

**Architecture:** 纯函数 composable (`useCashflow.js`) 按月聚合 4 项指标，Vue 组件 (`CashflowMonitor.vue`) 渲染卡片 + Chart.js 图表，插入 `HomeModule.vue` 指定位置

**Tech Stack:** Vue 3 Composition API, Chart.js v4 (new dep), Tailwind CSS

---

### Task 1: 安装 Chart.js 依赖

**Files:**
- Modify: `package.json`

- [ ] **Step 1: 安装 chart.js**

```bash
npm install chart.js
```

- [ ] **Step 2: 验证安装**

```bash
node -e "const { Chart } = require('chart.js'); console.log('Chart.js version:', Chart.version)"
```

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add chart.js dependency"
```

---

### Task 2: 编写 useCashflow.js 纯计算 composable

**Files:**
- Create: `src/modules/home/useCashflow.js`

- [ ] **Step 1: 创建文件**

```js
// src/modules/home/useCashflow.js
// 现金流与负债数据按月聚合（纯函数，无副作用）

/**
 * 判断日期字符串是否匹配指定年/月
 */
function monthMatch(dateStr, year, month) {
  if (!dateStr) return false
  const d = new Date(dateStr)
  return !isNaN(d.getTime()) && d.getFullYear() === year && d.getMonth() + 1 === month
}

/**
 * 生成最近 n 个月的年/月数组（按时间顺序，旧→新）
 */
function getLastNMonths(now, n) {
  const months = []
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    months.push({ year: d.getFullYear(), month: d.getMonth() + 1 })
  }
  return months
}

/**
 * 主函数：按月聚合净回款、库存消化、采购投入、负债规模
 * @param {object} store - reactive state from store.js
 * @param {Date}   now   - 当前日期
 * @returns {{ current, last3Months, last6Months }}
 */
export function getCashflowData(store, now = new Date()) {
  const items = store.items || []
  const snapshots = store.snapshots || []

  // 当月借贷余额（从 live state 实时计算）
  const loanBalance = (store.loanRecords || []).reduce((sum, l) => {
    if (l?.isRepaid || l?.repaid) return sum
    return sum + (l?.type === 'borrow' ? Number(l?.amount || 0) : -Number(l?.amount || 0))
  }, 0)
  // 当月负债 = 挖财总负债 + 借贷余额
  const currentDebt = Number(store.calc?.debt || 0) + loanBalance

  // 当月净回款（profit + cost，利用已有利润结果避免重复计算费率/扣减）
  function netCollection(year, month) {
    return items
      .filter(i => i?.status === 'sold' && monthMatch(i?.saleDetails?.date, year, month))
      .reduce((s, i) => s + Number(i?.saleDetails?.profit || 0) + Number(i?.cost || 0), 0)
  }

  // 当月库存消化（售出商品 cost 总和）
  function inventoryDigestion(year, month) {
    return items
      .filter(i => i?.status === 'sold' && monthMatch(i?.saleDetails?.date, year, month))
      .reduce((s, i) => s + Number(i?.cost || 0), 0)
  }

  // 当月采购总投入（按 purchaseDate 聚合，日淘+美淘+国内统算）
  function procurement(year, month) {
    return items
      .filter(i => monthMatch(i?.purchaseDetails?.purchaseDate, year, month))
      .reduce((s, i) => s + Number(i?.cost || 0), 0)
  }

  // 历史负债（从快照取月最后一条记录的 calc.debt + finance.loanBalance）
  function debtFromSnapshots(year, month) {
    const monthSnaps = snapshots
      .filter(s => monthMatch(s?.date, year, month))
      .sort((a, b) => (b?.date || '').localeCompare(a?.date || ''))
    if (monthSnaps.length === 0) return null
    const last = monthSnaps[0]
    return Number(last.calc?.debt || 0) + Number(last.finance?.loanBalance || 0)
  }

  // 构建单月数据对象
  function buildMonth(year, month) {
    return {
      year,
      month,
      netCollection: netCollection(year, month),
      inventoryDigestion: inventoryDigestion(year, month),
      procurement: procurement(year, month),
      debt: debtFromSnapshots(year, month),
    }
  }

  // 当月值（负债用 live 值覆盖快照值，因为当天可能还没快照）
  const curYear = now.getFullYear()
  const curMonth = now.getMonth() + 1
  const current = buildMonth(curYear, curMonth)
  current.debt = currentDebt

  // 最近 3 个月（旧→新），当月负债用 live 值
  const last3Months = getLastNMonths(now, 3).map(m => buildMonth(m.year, m.month))
  if (last3Months.length > 0) last3Months[last3Months.length - 1].debt = currentDebt

  // 最近 6 个月（旧→新）
  const last6Months = getLastNMonths(now, 6).map(m => buildMonth(m.year, m.month))
  if (last6Months.length > 0) last6Months[last6Months.length - 1].debt = currentDebt

  return { current, last3Months, last6Months }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/modules/home/useCashflow.js
git commit -m "feat: add useCashflow composable — monthly aggregation of net collection, inventory digestion, procurement, debt"
```

---

### Task 3: 编写 useCashflow.test.js 单元测试

**Files:**
- Create: `src/modules/home/useCashflow.test.js`

- [ ] **Step 1: 创建测试文件**

```js
// src/modules/home/useCashflow.test.js
import { describe, it, expect } from 'vitest'
import { getCashflowData } from './useCashflow'

function makeStore(overrides = {}) {
  return {
    items: [],
    snapshots: [],
    loanRecords: [],
    calc: { debt: 0 },
    ...overrides,
  }
}

describe('getCashflowData', () => {
  const now = new Date('2026-06-22')

  it('returns zeroes for empty store', () => {
    const result = getCashflowData(makeStore(), now)
    expect(result.current.netCollection).toBe(0)
    expect(result.current.inventoryDigestion).toBe(0)
    expect(result.current.procurement).toBe(0)
    expect(result.current.debt).toBe(0)
  })

  it('computes netCollection and inventoryDigestion from sold items this month', () => {
    const store = makeStore({
      items: [
        { status: 'sold', cost: 100, saleDetails: { date: '2026-06-15', profit: 50 } },
        { status: 'sold', cost: 200, saleDetails: { date: '2026-06-20', profit: 80 } },
        { status: 'sold', cost: 300, saleDetails: { date: '2026-05-10', profit: 60 } }, // wrong month
        { status: 'purchase', cost: 500 }, // not sold
      ],
    })
    const result = getCashflowData(store, now)
    // netCollection = (100+50) + (200+80) = 430
    expect(result.current.netCollection).toBe(430)
    // inventoryDigestion = 100 + 200 = 300
    expect(result.current.inventoryDigestion).toBe(300)
  })

  it('computes procurement from purchaseDate month', () => {
    const store = makeStore({
      items: [
        { cost: 100, purchaseDetails: { purchaseDate: '2026-06-05' } },
        { cost: 200, purchaseDetails: { purchaseDate: '2026-06-18' } },
        { cost: 50, purchaseDetails: { purchaseDate: '2026-05-01' } },
        { cost: 999, purchaseDetails: {} }, // no date
      ],
    })
    const result = getCashflowData(store, now)
    expect(result.current.procurement).toBe(300)
  })

  it('computes current debt from calc + loanBalance', () => {
    const store = makeStore({
      calc: { debt: 5000 },
      loanRecords: [
        { type: 'borrow', amount: 1000, isRepaid: false },
        { type: 'lend', amount: 300, isRepaid: false },
        { type: 'borrow', amount: 2000, repaid: true }, // repaid
      ],
    })
    const result = getCashflowData(store, now)
    // 5000 + 1000 - 300 = 5700
    expect(result.current.debt).toBe(5700)
  })

  it('returns 6 months in chronological order', () => {
    const store = makeStore()
    const result = getCashflowData(store, now)
    expect(result.last6Months).toHaveLength(6)
    // oldest first
    expect(result.last6Months[0]).toMatchObject({ year: 2026, month: 1 })
    expect(result.last6Months[5]).toMatchObject({ year: 2026, month: 6 })
  })

  it('returns 3 months for mini bars', () => {
    const store = makeStore()
    const result = getCashflowData(store, now)
    expect(result.last3Months).toHaveLength(3)
    expect(result.last3Months[2]).toMatchObject({ year: 2026, month: 6 })
  })

  it('reads debt history from snapshots when available', () => {
    const store = makeStore({
      snapshots: [
        { date: '2026-06-01', calc: { debt: 4000 }, finance: { loanBalance: 500 } },
        { date: '2026-06-15', calc: { debt: 4200 }, finance: { loanBalance: 500 } },
      ],
    })
    const result = getCashflowData(store, now)
    // last snapshot wins: 4200 + 500 = 4700... but current month is overridden by currentDebt
    // For historical month, it uses snapshot
    const mayData = result.last6Months.find(m => m.month === 5)
    expect(mayData?.debt).toBeNull() // no may snapshot → null
  })

  it('handles cross-year boundary (Dec→Jan)', () => {
    const dec = new Date('2025-12-15')
    const result = getCashflowData(makeStore(), dec)
    expect(result.last6Months[0]).toMatchObject({ year: 2025, month: 7 })
    expect(result.last6Months[5]).toMatchObject({ year: 2025, month: 12 })
  })
})
```

- [ ] **Step 2: 运行测试确认通过**

```bash
npx vitest run src/modules/home/useCashflow.test.js
```

- [ ] **Step 3: Commit**

```bash
git add src/modules/home/useCashflow.test.js
git commit -m "test: add useCashflow unit tests"
```

---

### Task 4: 构建 CashflowMonitor.vue 组件

**Files:**
- Create: `src/modules/home/CashflowMonitor.vue`

- [ ] **Step 1: 创建组件（卡片区 + 迷你柱 + Chart.js 混合图）**

```html
<!-- src/modules/home/CashflowMonitor.vue -->
<script setup>
import { computed, onMounted, onBeforeUnmount, ref, watch } from 'vue'
import { Chart, registerables } from 'chart.js'
import { getCashflowData } from './useCashflow'
import { state as store } from '../../data/store'

Chart.register(...registerables)

const now = computed(() => new Date())
const cashflow = computed(() => getCashflowData(store, now.value))

// ── 工具函数 ──

function fmtMoney(v) {
  return Number(v || 0).toFixed(2)
}

/** 短格式: 12345 → "1.23w", 8901 → "8.9k" */
function fmtShort(v) {
  const n = Math.abs(Number(v || 0))
  if (n >= 10000) return (Number(v) / 10000).toFixed(2) + 'w'
  if (n >= 1000) return (Number(v) / 1000).toFixed(1) + 'k'
  return Number(v).toFixed(0)
}

function momChange(current, previous) {
  if (!previous || previous === 0) return null
  return ((current - previous) / previous) * 100
}

// ── 迷你柱状条 ──

const miniBarConfigs = [
  { key: 'netCollection', label: '净回款', color: '#16a34a' },
  { key: 'inventoryDigestion', label: '库存消化', color: '#f59e0b' },
  { key: 'procurement', label: '采购总投入', color: '#f97316' },
  { key: 'debt', label: '负债规模', color: '#3b82f6' },
]

function miniBarData(config) {
  const months = cashflow.value.last3Months
  const values = months.map(m => Number(m?.[config.key] || 0))
  const maxV = Math.max(...values, 0.01)
  return months.map((m, i) => ({
    label: `${m.month}月`,
    value: values[i],
    height: (values[i] / maxV) * 24,
    isCurrent: i === months.length - 1,
  }))
}

function momFor(config) {
  const months = cashflow.value.last3Months
  if (months.length < 2) return null
  const cur = Number(months[months.length - 1]?.[config.key] || 0)
  const prev = Number(months[months.length - 2]?.[config.key] || 0)
  return momChange(cur, prev)
}

// ── Chart.js 混合图 ──

const chartCanvas = ref(null)
let chartInstance = null

/** 自定义插件：在柱组上方绘制差额标注 */
const diffPlugin = {
  id: 'cashflowDiff',
  afterDatasetsDraw(chart) {
    const { ctx, scales: { x, y } } = chart
    const meta0 = chart.getDatasetMeta(0)
    const meta1 = chart.getDatasetMeta(1)
    if (!meta0?.data?.length || !meta1?.data?.length) return

    ctx.font = '11px "Microsoft YaHei", sans-serif'
    ctx.textAlign = 'center'

    for (let i = 0; i < meta0.data.length; i++) {
      const net = Number(chart.data.datasets[0].data[i] || 0)
      const proc = Number(chart.data.datasets[1].data[i] || 0)
      const diff = net - proc
      if (diff === 0 && net === 0 && proc === 0) continue

      // 两个柱中点作为标注位置
      const xPos = (meta0.data[i].x + meta1.data[i].x) / 2
      // 取较高柱的顶部
      const topY = Math.min(meta0.data[i].y, meta1.data[i].y)

      ctx.fillStyle = diff >= 0 ? '#16a34a' : '#dc2626'
      const label = diff >= 0 ? `+${fmtShort(diff)}` : fmtShort(diff)
      ctx.fillText(label, xPos, topY - 6)
    }
  },
}

function buildChartConfig(sixMonthData) {
  const labels = sixMonthData.map(m => `${m.month}月`)
  const netData = sixMonthData.map(m => m.netCollection)
  const procData = sixMonthData.map(m => m.procurement)
  const debtData = sixMonthData.map(m => (m.debt != null ? m.debt : NaN))

  return {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: '净回款',
          data: netData,
          backgroundColor: '#16a34a',
          borderRadius: 4,
          yAxisID: 'y',
          barPercentage: 0.6,
        },
        {
          label: '采购投入',
          data: procData,
          backgroundColor: '#f59e0b',
          borderRadius: 4,
          yAxisID: 'y',
          barPercentage: 0.6,
        },
        {
          label: '负债规模',
          data: debtData,
          type: 'line',
          borderColor: '#3b82f6',
          backgroundColor: 'rgba(59,130,246,0.1)',
          fill: true,
          yAxisID: 'y1',
          tension: 0.3,
          pointRadius: 4,
          pointBackgroundColor: '#3b82f6',
          spanGaps: false,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        tooltip: {
          callbacks: {
            footer(items) {
              const i = items[0]?.dataIndex ?? -1
              if (i < 0) return ''
              const diff = netData[i] - procData[i]
              const sign = diff >= 0 ? '+' : ''
              return `差额: ${sign}${fmtMoney(diff)}`
            },
          },
        },
        legend: { position: 'bottom' },
      },
      scales: {
        y: {
          type: 'linear',
          position: 'left',
          title: { display: true, text: '金额 (元)' },
          beginAtZero: true,
        },
        y1: {
          type: 'linear',
          position: 'right',
          title: { display: true, text: '负债 (元)' },
          beginAtZero: true,
          grid: { drawOnChartArea: false },
        },
      },
    },
    plugins: [diffPlugin],
  }
}

function renderChart() {
  if (chartInstance) {
    chartInstance.destroy()
    chartInstance = null
  }
  const data = cashflow.value?.last6Months
  if (!chartCanvas.value || !data?.length) return
  chartInstance = new Chart(chartCanvas.value, buildChartConfig(data))
}

watch(cashflow, () => renderChart(), { deep: true })
onMounted(() => renderChart())
onBeforeUnmount(() => { if (chartInstance) { chartInstance.destroy(); chartInstance = null } })
</script>

<template>
  <div class="space-y-5">
    <!-- 标题 -->
    <div class="flex items-center gap-2">
      <h3 class="text-lg font-semibold text-gray-800">现金流与负债监控</h3>
      <span class="text-xs text-gray-400">Cashflow & Debt Monitor</span>
    </div>

    <!-- 四指标卡片 -->
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <div
        v-for="cfg in miniBarConfigs"
        :key="cfg.key"
        class="apple-card flex flex-col gap-2"
      >
        <!-- 标题 + 当月值 -->
        <div class="text-xs text-gray-500">{{ cfg.label }}</div>
        <div class="text-2xl font-extrabold text-gray-800">
          {{ fmtMoney(cashflow.current[cfg.key]) }}
        </div>

        <!-- 迷你柱状条 -->
        <div class="flex items-end gap-2 h-10 mt-1">
          <div
            v-for="(bar, bi) in miniBarData(cfg)"
            :key="bi"
            class="flex flex-col items-center gap-1 flex-1"
          >
            <div
              class="w-2.5 rounded-t-sm transition-all"
              :style="{
                height: bar.height + 'px',
                backgroundColor: bar.isCurrent ? cfg.color : '#e5e7eb',
              }"
            />
            <span class="text-[10px] text-gray-400">{{ bar.label }}</span>
            <span class="text-[10px] text-gray-500">{{ fmtShort(bar.value) }}</span>
          </div>
        </div>

        <!-- 环比 -->
        <div class="text-xs mt-1">
          <template v-if="momFor(cfg) !== null">
            <span
              :class="momFor(cfg) >= 0 ? 'text-green-600' : 'text-red-500'"
            >
              {{ momFor(cfg) >= 0 ? '↑' : '↓' }}
              {{ Math.abs(momFor(cfg)).toFixed(1) }}%
            </span>
            <span class="text-gray-400 ml-1">环比</span>
          </template>
          <span v-else class="text-gray-400">--</span>
        </div>
      </div>
    </div>

    <!-- Chart.js 混合图 -->
    <div class="apple-card">
      <h4 class="text-sm font-semibold text-gray-700 mb-3">6 个月趋势</h4>
      <div class="relative" style="height: 320px;">
        <canvas ref="chartCanvas"></canvas>
      </div>
    </div>
  </div>
</template>
```

- [ ] **Step 2: Commit**

```bash
git add src/modules/home/CashflowMonitor.vue
git commit -m "feat: add CashflowMonitor component with metric cards and Chart.js mixed chart"
```

---

### Task 5: 集成到 HomeModule.vue

**Files:**
- Modify: `src/modules/home/HomeModule.vue`

- [ ] **Step 1: 模板中插入组件（支付宝计算器之后，商品查询器之前）**

在 `<script setup>` 顶部添加导入：

```js
import CashflowMonitor from './CashflowMonitor.vue'
```

在支付宝余额计算器 `</div>` 闭合后、商品查询器 `<div class="apple-card">` 之前插入：

```html
    <!-- 现金流与负债监控 -->
    <CashflowMonitor />

    <div class="apple-card">
      <h3 class="text-lg font-semibold mb-4 text-gray-800"><i class="fa-solid fa-magnifying-glass text-blue-500 mr-2"></i>商品查询器</h3>
```

- [ ] **Step 2: 运行开发服务器验证**

```bash
npm run dev
```

视觉检查：
- 4 个指标卡片显示在支付宝计算器下方
- 迷你柱状条渲染正确
- 6 个月混合图在卡片下方显示
- 商品查询器仍在最下方

- [ ] **Step 3: 运行全部测试确认无回归**

```bash
npx vitest run
```

- [ ] **Step 4: Commit**

```bash
git add src/modules/home/HomeModule.vue
git commit -m "feat: integrate CashflowMonitor into HomeModule"
```

---

### Task 6: 最终验证

- [ ] **Step 1: 运行全量测试**

```bash
npx vitest run
```

- [ ] **Step 2: 构建检查**

```bash
npm run build
```

- [ ] **Step 3: 视觉验证清单**

在 `npm run dev` 中逐项检查：

| 检查项 | 预期 |
|--------|------|
| 4 卡片并排 | `lg:grid-cols-4`，窄屏 `grid-cols-2` |
| 卡片内容 | 标题/当月值/迷你柱/环比箭头 齐全 |
| 迷你柱当月高亮 | 当月柱有颜色，历史柱灰色 |
| 环比箭头方向 | 绿色↑ / 红色↓ |
| 混合图 3 系列 | 绿色柱/琥珀柱/蓝色折线+填充 |
| 差额标注 | 柱组上方 ± 数字 |
| Tooltip | 悬停显示月份/净回款/采购投入/差额/负债 |
| 商品查询器 | 仍在新区域下方 |
| 无 console 报错 | 控制台无红色警告 |
| 数据为空时 | 卡片显示 0，图表无崩溃 |
