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

// ── 迷你柱状条配置 ──

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

      const xPos = (meta0.data[i].x + meta1.data[i].x) / 2
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
  <div class="apple-card space-y-5">
    <h3 class="text-lg font-semibold mb-4 text-gray-800"><i class="fa-solid fa-coins text-blue-500 mr-2"></i>现金流与负债监控</h3>

    <!-- 四指标卡片 -->
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <div
        v-for="cfg in miniBarConfigs"
        :key="cfg.key"
        class="bg-gray-50 rounded-xl p-4 border border-gray-100 flex flex-col gap-2"
      >
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
    <div>
      <h4 class="text-sm font-semibold text-gray-700 mb-3">6 个月趋势</h4>
      <div class="relative" style="height: 320px;">
        <canvas ref="chartCanvas"></canvas>
      </div>
    </div>
  </div>
</template>
