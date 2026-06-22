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
  { key: 'netCollection', label: '每月净回款', color: '#16a34a' },
  { key: 'procurement', label: '每月采购投入', color: '#f97316' },
  { key: 'debt', label: '负债规模', color: '#3b82f6' },
]

function miniBarData(config) {
  const months = cashflow.value.last5Months
  const values = months.map(m => Number(m?.[config.key] || 0))
  const maxV = Math.max(...values, 0.01)
  return months.map((m, i) => ({
    label: `${m.month}月`,
    value: values[i],
    width: (values[i] / maxV) * 100,
    isCurrent: i === months.length - 1,
  }))
}

function momFor(config) {
  const months = cashflow.value.last5Months
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
    const { ctx } = chart
    const meta0 = chart.getDatasetMeta(0)
    const meta1 = chart.getDatasetMeta(1)
    if (!meta0?.data?.length || !meta1?.data?.length) return

    ctx.font = '10px "Microsoft YaHei", sans-serif'
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

function buildChartConfig(fiveMonthData) {
  const labels = fiveMonthData.map(m => `${m.month}月`)
  const netData = fiveMonthData.map(m => m.netCollection)
  const procData = fiveMonthData.map(m => m.procurement)
  const diffData = fiveMonthData.map(m => m.netCollection - m.procurement)
  const debtData = fiveMonthData.map(m => (m.debt != null ? m.debt : NaN))

  return {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: '每月净回款',
          data: netData,
          backgroundColor: 'rgba(22,163,74,0.35)',
          borderRadius: 4,
          yAxisID: 'y',
          barPercentage: 0.6,
          order: 2,
        },
        {
          label: '每月采购投入',
          data: procData,
          backgroundColor: 'rgba(245,158,11,0.35)',
          borderRadius: 4,
          yAxisID: 'y',
          barPercentage: 0.6,
          order: 2,
        },
        {
          label: '现金流差额',
          data: diffData,
          type: 'line',
          borderColor: '#8b5cf6',
          backgroundColor: 'rgba(139,92,246,0.08)',
          borderWidth: 2.5,
          fill: true,
          yAxisID: 'y',
          tension: 0.3,
          pointRadius: 5,
          pointBackgroundColor: '#8b5cf6',
          pointBorderColor: '#fff',
          pointBorderWidth: 2,
          order: 1,
        },
        {
          label: '负债规模',
          data: debtData,
          type: 'line',
          borderColor: '#3b82f6',
          backgroundColor: 'rgba(59,130,246,0.06)',
          borderWidth: 2.5,
          fill: true,
          yAxisID: 'y1',
          tension: 0.3,
          pointRadius: 5,
          pointBackgroundColor: '#3b82f6',
          pointBorderColor: '#fff',
          pointBorderWidth: 2,
          spanGaps: false,
          order: 1,
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
            label(ctx) {
              const val = Number(ctx.raw || 0)
              return `${ctx.dataset.label}: ${val.toFixed(2)}`
            },
            footer(items) {
              const i = items[0]?.dataIndex ?? -1
              if (i < 0) return ''
              const diff = netData[i] - procData[i]
              const sign = diff >= 0 ? '+' : ''
              return `现金流差额: ${sign}${fmtMoney(diff)}`
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
  const data = cashflow.value?.last5Months
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

    <!-- 三指标卡片 -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div
        v-for="cfg in miniBarConfigs"
        :key="cfg.key"
        class="bg-gray-50 rounded-xl p-4 border border-gray-100 flex flex-col gap-2"
      >
        <div class="text-xs text-gray-500">{{ cfg.label }}</div>
        <div class="text-2xl font-extrabold text-gray-800">
          {{ fmtMoney(cashflow.current[cfg.key]) }}
        </div>

        <!-- 迷你横向柱状条 -->
        <div class="flex flex-col gap-1.5 mt-1">
          <div
            v-for="(bar, bi) in miniBarData(cfg)"
            :key="bi"
            class="flex items-center gap-2"
          >
            <span class="text-[10px] text-gray-400 w-7 shrink-0">{{ bar.label }}</span>
            <div class="flex-1 h-3 bg-gray-200 rounded-sm overflow-hidden">
              <div
                class="h-full rounded-sm transition-all"
                :style="{
                  width: bar.width + '%',
                  backgroundColor: bar.isCurrent ? cfg.color : '#d1d5db',
                }"
              />
            </div>
            <span class="text-[10px] text-gray-500 w-10 text-right shrink-0">{{ fmtShort(bar.value) }}</span>
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
      <h4 class="text-sm font-semibold text-gray-700 mb-3">5 个月现金流与负债趋势</h4>
      <div class="relative" style="height: 320px;">
        <canvas ref="chartCanvas"></canvas>
      </div>
    </div>
  </div>
</template>
