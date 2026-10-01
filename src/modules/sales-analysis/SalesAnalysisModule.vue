<script setup>
import { computed, ref, watch, onMounted, onBeforeUnmount } from 'vue'
import Chart from 'chart.js/auto'
import annotationPlugin from 'chartjs-plugin-annotation'
import { state as store } from '../../data/store'
import {
  aggregateSKUs,
  calcParetoData,
  calcQuadrantStats,
  getQuadrantLabels,
  getTurnoverColor,
  calcCategoryDualAxisData,
  calcProfitContributionData,
} from './useSalesAnalysis'

// 注册 annotation 插件
Chart.register(annotationPlugin)

// 图表引用
const scatterChartRef = ref(null)
const paretoChartRef = ref(null)
const dualAxisChartRef = ref(null)
const pieChartRef = ref(null)
let scatterChart = null
let paretoChart = null
let dualAxisChart = null
let pieChart = null

// 核心数据
const skus = computed(() => aggregateSKUs(store.items))
const paretoData = computed(() => calcParetoData(skus.value))
const quadrantStats = computed(() => calcQuadrantStats(skus.value))
const quadrantLabels = computed(() => getQuadrantLabels(quadrantStats.value))
const dualAxisData = computed(() => calcCategoryDualAxisData(skus.value))
const profitContribution = computed(() => calcProfitContributionData(skus.value))

// 统计卡片
const summary = computed(() => {
  const totalSkuCount = skus.value.length
  const totalProfit = paretoData.value.totalProfit
  const totalQty = skus.value.reduce((s, k) => s + k.totalQty, 0)
  const avgDays = totalQty > 0 
    ? skus.value.reduce((s, k) => s + k.avgDays * k.totalQty, 0) / totalQty 
    : 0
  
  return { totalSkuCount, totalProfit, totalQty, avgDays }
})

// 格式化函数
function fmtMoney(v) {
  return Number(v || 0).toLocaleString('zh-CN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
}

function fmtPercent(v) {
  return `${(Number(v || 0) * 100).toFixed(1)}%`
}

function fmtDays(v) {
  return Number(v || 0).toFixed(0)
}

// 初始化四象限气泡散点图
function initScatterChart() {
  if (!scatterChartRef.value) return
  
  if (scatterChart) {
    scatterChart.destroy()
  }
  
  const ctx = scatterChartRef.value.getContext('2d')
  const data = skus.value
  
  // 计算气泡大小范围
  const maxProfit = Math.max(...data.map(d => Math.abs(d.totalProfit)), 1)
  
  scatterChart = new Chart(ctx, {
    type: 'bubble',
    data: {
      datasets: [{
        label: 'SKU',
        data: data.map(d => ({
          x: d.avgDays,
          y: d.profitRate,
          r: Math.sqrt(Math.abs(d.totalProfit) / maxProfit) * 30 + 5,
          sku: d.key,
          profit: d.totalProfit,
        })),
        backgroundColor: data.map(d => getTurnoverColor(d.avgDays)),
        borderColor: 'rgba(0, 0, 0, 0.3)',
        borderWidth: 1,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (context) => {
              const p = context.raw
              return [
                `SKU: ${p.sku}`,
                `利润: ¥${fmtMoney(p.profit)}`,
                `售出天数: ${fmtDays(p.x)}`,
                `利润率: ${fmtPercent(p.y)}`,
              ]
            }
          }
        },
        annotation: {
          annotations: {
            lineX: {
              type: 'line',
              xMin: 60,
              xMax: 60,
              borderColor: 'rgba(239, 68, 68, 0.5)',
              borderWidth: 2,
              borderDash: [5, 5],
              label: {
                content: '60天',
                display: true,
                position: 'start',
                backgroundColor: 'rgba(239, 68, 68, 0.8)',
                color: '#fff',
                font: { size: 10 },
                padding: 4,
              }
            },
            lineY: {
              type: 'line',
              yMin: 0.2,
              yMax: 0.2,
              borderColor: 'rgba(239, 68, 68, 0.5)',
              borderWidth: 2,
              borderDash: [5, 5],
              label: {
                content: '20%',
                display: true,
                position: 'end',
                backgroundColor: 'rgba(239, 68, 68, 0.8)',
                color: '#fff',
                font: { size: 10 },
                padding: 4,
              }
            },
          }
        }
      },
      scales: {
        x: {
          type: 'linear',
          title: {
            display: true,
            text: '平均售出天数',
            font: { size: 11 }
          },
          ticks: {
            callback: (value) => `${value}天`
          }
        },
        y: {
          type: 'linear',
          title: {
            display: true,
            text: '销售利润率',
            font: { size: 11 }
          },
          min: 0,
          max: 1.2,
          ticks: {
            stepSize: 0.1,
            callback: (value) => {
              // 显示关键刻度：0-60% 密集，60%-120% 稀疏
              if (value <= 0.6) {
                return `${(value * 100).toFixed(0)}%`
              }
              // 60% 之后只显示 75%, 90%, 105%, 120%
              if (Math.abs(value - 0.75) < 0.01) return '75%'
              if (Math.abs(value - 0.9) < 0.01) return '90%'
              if (Math.abs(value - 1.05) < 0.01) return '105%'
              if (Math.abs(value - 1.2) < 0.01) return '120%'
              return ''
            }
          }
        }
      }
    }
  })
}

// 初始化帕累托图
function initParetoChart() {
  if (!paretoChartRef.value) return
  
  if (paretoChart) {
    paretoChart.destroy()
  }
  
  const ctx = paretoChartRef.value.getContext('2d')
  const { skus, cumulativePercentages, totalProfit } = paretoData.value
  
  paretoChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: skus.map(s => s.key),
      datasets: [
        {
          type: 'bar',
          label: '累计利润',
          data: skus.map(s => s.totalProfit),
          backgroundColor: skus.map(s => getTurnoverColor(s.avgDays)),
          borderColor: skus.map(s => getTurnoverColor(s.avgDays).replace('0.7', '1')),
          borderWidth: 1,
          yAxisID: 'y',
          order: 2,
        },
        {
          type: 'line',
          label: '累计百分比',
          data: cumulativePercentages,
          borderColor: 'rgba(249, 115, 22, 1)',
          backgroundColor: 'rgba(249, 115, 22, 0.1)',
          borderWidth: 2,
          pointRadius: 4,
          pointBackgroundColor: 'rgba(249, 115, 22, 1)',
          fill: false,
          tension: 0.1,
          yAxisID: 'y1',
          order: 1,
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'top',
          labels: {
            font: { size: 10 },
            boxWidth: 12,
          }
        },
        tooltip: {
          callbacks: {
            label: (context) => {
              if (context.datasetIndex === 0) {
                return `利润: ¥${fmtMoney(context.raw)}`
              }
              return `累计: ${context.raw.toFixed(1)}%`
            }
          }
        },
        annotation: {
          annotations: {
            line80: {
              type: 'line',
              yMin: 80,
              yMax: 80,
              borderColor: 'rgba(239, 68, 68, 0.5)',
              borderWidth: 2,
              borderDash: [5, 5],
              label: {
                content: '80%',
                display: true,
                position: 'end',
                backgroundColor: 'rgba(239, 68, 68, 0.8)',
                color: '#fff',
                font: { size: 10 },
                padding: 4,
              }
            }
          }
        }
      },
      scales: {
        x: {
          ticks: {
            font: { size: 10 },
            maxRotation: 45,
            minRotation: 45,
          }
        },
        y: {
          type: 'linear',
          position: 'left',
          title: {
            display: true,
            text: '累计利润 (¥)',
            font: { size: 11 }
          },
          ticks: {
            callback: (value) => `¥${fmtMoney(value)}`
          }
        },
        y1: {
          type: 'linear',
          position: 'right',
          max: 100,
          title: {
            display: true,
            text: '累计百分比 (%)',
            font: { size: 11 }
          },
          ticks: {
            callback: (value) => `${value}%`
          },
          grid: { drawOnChartArea: false }
        }
      }
    }
  })
}

// 初始化品类双轴柱状图
function initDualAxisChart() {
  if (!dualAxisChartRef.value) return
  
  if (dualAxisChart) {
    dualAxisChart.destroy()
  }
  
  const ctx = dualAxisChartRef.value.getContext('2d')
  const data = dualAxisData.value
  
  dualAxisChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: data.map(d => d.key),
      datasets: [
        {
          type: 'bar',
          label: '利润率',
          data: data.map(d => d.profitRate),
          backgroundColor: data.map(d => getTurnoverColor(d.avgDays)),
          borderColor: data.map(d => getTurnoverColor(d.avgDays).replace('0.7', '1')),
          borderWidth: 1,
          yAxisID: 'y',
          order: 2,
        },
        {
          type: 'line',
          label: '平均售出天数',
          data: data.map(d => d.avgDays),
          borderColor: 'rgba(59, 130, 246, 1)',
          backgroundColor: 'rgba(59, 130, 246, 0.1)',
          borderWidth: 2,
          pointRadius: 4,
          pointBackgroundColor: 'rgba(59, 130, 246, 1)',
          fill: false,
          tension: 0.1,
          yAxisID: 'y1',
          order: 1,
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'top',
          labels: {
            font: { size: 10 },
            boxWidth: 12,
          }
        },
        tooltip: {
          callbacks: {
            label: (context) => {
              if (context.datasetIndex === 0) {
                return `利润率: ${fmtPercent(context.raw)}`
              }
              return `售出天数: ${fmtDays(context.raw)}`
            }
          }
        }
      },
      scales: {
        x: {
          ticks: {
            font: { size: 10 },
            maxRotation: 45,
            minRotation: 45,
          }
        },
        y: {
          type: 'linear',
          position: 'left',
          title: {
            display: true,
            text: '利润率',
            font: { size: 11 }
          },
          min: 0,
          max: 1.2,
          ticks: {
            stepSize: 0.1,
            callback: (value) => {
              // 显示关键刻度：0-60% 密集，60%-120% 稀疏
              if (value <= 0.6) {
                return `${(value * 100).toFixed(0)}%`
              }
              // 60% 之后只显示 75%, 90%, 105%, 120%
              if (Math.abs(value - 0.75) < 0.01) return '75%'
              if (Math.abs(value - 0.9) < 0.01) return '90%'
              if (Math.abs(value - 1.05) < 0.01) return '105%'
              if (Math.abs(value - 1.2) < 0.01) return '120%'
              return ''
            }
          }
        },
        y1: {
          type: 'linear',
          position: 'right',
          title: {
            display: true,
            text: '售出天数',
            font: { size: 11 }
          },
          ticks: {
            callback: (value) => `${value}天`
          },
          grid: { drawOnChartArea: false }
        }
      }
    }
  })
}

// 初始化利润贡献饼图
function initPieChart() {
  if (!pieChartRef.value) return
  
  if (pieChart) {
    pieChart.destroy()
  }
  
  const ctx = pieChartRef.value.getContext('2d')
  const { pieData } = profitContribution.value
  
  // 饼图颜色
  const colors = [
    'rgba(59, 130, 246, 0.7)',
    'rgba(99, 102, 241, 0.7)',
    'rgba(139, 92, 246, 0.7)',
    'rgba(168, 85, 247, 0.7)',
    'rgba(192, 132, 252, 0.7)',
    'rgba(232, 121, 249, 0.7)',
    'rgba(236, 72, 153, 0.7)',
    'rgba(239, 68, 68, 0.7)',
    'rgba(249, 115, 22, 0.7)',
  ]
  
  pieChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: pieData.map(d => d.label),
      datasets: [{
        data: pieData.map(d => d.value),
        backgroundColor: colors.slice(0, pieData.length),
        borderWidth: 1,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            boxWidth: 12,
            padding: 8,
            font: { size: 10 }
          }
        },
        tooltip: {
          callbacks: {
            label: (context) => {
              return `${context.label}: ${context.raw.toFixed(1)}%`
            }
          }
        }
      }
    }
  })
}

// 监听数据变化，更新图表
watch([skus, paretoData, dualAxisData, profitContribution], () => {
  initScatterChart()
  initParetoChart()
  initDualAxisChart()
  initPieChart()
}, { deep: true })

onMounted(() => {
  setTimeout(() => {
    initScatterChart()
    initParetoChart()
    initDualAxisChart()
    initPieChart()
  }, 100)
})

onBeforeUnmount(() => {
  if (scatterChart) {
    scatterChart.destroy()
  }
  if (paretoChart) {
    paretoChart.destroy()
  }
  if (dualAxisChart) {
    dualAxisChart.destroy()
  }
  if (pieChart) {
    pieChart.destroy()
  }
})

// 表格展开状态
const expandedSkus = ref({})

function toggleExpand(key) {
  expandedSkus.value[key] = !expandedSkus.value[key]
}
</script>

<template>
  <div class="space-y-6">
    <!-- 页面标题 -->
    <div class="flex items-center justify-between">
      <div class="flex items-baseline gap-3">
        <h2 class="text-3xl font-extrabold">销售分析</h2>
        <span class="text-base text-gray-400 font-light">Sales Analysis</span>
      </div>
    </div>

    <!-- 统计卡片 -->
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <div class="bg-gray-50 p-4 rounded-xl border-l-4 border-gray-400">
        <div class="text-xs text-gray-500 mb-1">已售 SKU 数</div>
        <div class="text-2xl font-bold text-gray-800">{{ summary.totalSkuCount }}</div>
      </div>
      <div class="bg-gray-50 p-4 rounded-xl border-l-4 border-blue-500">
        <div class="text-xs text-gray-500 mb-1">总利润</div>
        <div class="text-2xl font-bold text-gray-800">¥{{ fmtMoney(summary.totalProfit) }}</div>
      </div>
      <div class="bg-gray-50 p-4 rounded-xl border-l-4 border-purple-500">
        <div class="text-xs text-gray-500 mb-1">已售件数</div>
        <div class="text-2xl font-bold text-gray-800">{{ summary.totalQty }}</div>
      </div>
      <div class="bg-gray-50 p-4 rounded-xl border-l-4 border-green-500">
        <div class="text-xs text-gray-500 mb-1">平均售出周期</div>
        <div class="text-2xl font-bold text-gray-800">{{ fmtDays(summary.avgDays) }} 天</div>
      </div>
    </div>

    <!-- 图表区域 -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <!-- 四象限气泡散点图 -->
      <div class="apple-card p-4">
        <div class="flex justify-between items-center mb-3">
          <div class="text-xs text-gray-500">四象限分析 <span class="text-gray-400">（气泡越大 = 对整体利润贡献越大）</span></div>
          <div class="flex gap-2 text-xs">
            <span class="px-2 py-0.5 rounded bg-green-100 text-green-700">&lt;60天</span>
            <span class="px-2 py-0.5 rounded bg-yellow-100 text-yellow-700">60-180天</span>
            <span class="px-2 py-0.5 rounded bg-red-100 text-red-700">&gt;180天</span>
          </div>
        </div>
        <div class="h-[320px]">
          <canvas ref="scatterChartRef"></canvas>
        </div>
      </div>

      <!-- 帕累托图 -->
      <div class="apple-card p-4">
        <div class="flex justify-between items-center mb-3">
          <div class="text-xs text-gray-500">帕累托分析</div>
          <div class="flex gap-2 text-xs">
            <span class="px-2 py-0.5 rounded bg-green-100 text-green-700">快周转</span>
            <span class="px-2 py-0.5 rounded bg-yellow-100 text-yellow-700">预警</span>
            <span class="px-2 py-0.5 rounded bg-red-100 text-red-700">慢周转</span>
          </div>
        </div>
        <div class="h-[320px]">
          <canvas ref="paretoChartRef"></canvas>
        </div>
      </div>

      <!-- 品类双轴柱状图 -->
      <div class="apple-card p-4">
        <div class="flex justify-between items-center mb-3">
          <div class="text-xs text-gray-500">品类双轴分析</div>
          <div class="flex gap-2 text-xs">
            <span class="px-2 py-0.5 rounded bg-green-100 text-green-700">&lt;60天</span>
            <span class="px-2 py-0.5 rounded bg-yellow-100 text-yellow-700">60-180天</span>
            <span class="px-2 py-0.5 rounded bg-red-100 text-red-700">&gt;180天</span>
          </div>
        </div>
        <div class="h-[320px]">
          <canvas ref="dualAxisChartRef"></canvas>
        </div>
      </div>

      <!-- 利润贡献饼图 -->
      <div class="apple-card p-4">
        <div class="text-xs text-gray-500 mb-3">利润贡献分布</div>
        <div class="h-[320px]">
          <canvas ref="pieChartRef"></canvas>
        </div>
      </div>
    </div>

    <!-- 利润贡献表格 -->
    <div class="apple-card p-0 overflow-hidden">
      <div class="px-4 py-2 bg-gray-50 border-b border-gray-100 text-xs text-gray-500 font-medium">
        利润贡献明细
      </div>
      <div class="overflow-x-auto">
        <table class="min-w-full text-sm">
          <thead class="bg-gray-50 text-gray-600">
            <tr>
              <th class="text-left px-3 py-2">品类</th>
              <th class="text-right px-3 py-2">利润占比</th>
              <th class="text-right px-3 py-2">利润金额</th>
              <th class="text-right px-3 py-2">平均售出天数</th>
              <th class="text-center px-3 py-2">周转</th>
            </tr>
          </thead>
          <tbody class="text-gray-700">
            <tr v-for="item in profitContribution.tableData" :key="item.label" class="border-t border-gray-100">
              <td class="px-3 py-2 font-medium">{{ item.label }}</td>
              <td class="text-right px-3 py-2">{{ item.percentage.toFixed(1) }}%</td>
              <td class="text-right px-3 py-2">¥{{ fmtMoney(item.totalProfit) }}</td>
              <td class="text-right px-3 py-2">{{ fmtDays(item.avgDays) }}</td>
              <td class="text-center px-3 py-2">
                <span 
                  class="inline-block w-3 h-3 rounded-full" 
                  :style="{ backgroundColor: getTurnoverColor(item.avgDays) }"
                ></span>
              </td>
            </tr>
            <tr v-if="profitContribution.tableData.length === 0">
              <td colspan="5" class="text-center text-gray-400 py-6">暂无数据</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- 四象限统计 -->
    <div class="apple-card p-4">
      <div class="text-xs text-gray-500 mb-3">象限分布</div>
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div v-for="q in quadrantLabels" :key="q.label" class="p-3 rounded-lg border" :class="{
          'border-green-200 bg-green-50': q.color === 'green',
          'border-orange-200 bg-orange-50': q.color === 'orange',
          'border-blue-200 bg-blue-50': q.color === 'blue',
          'border-red-200 bg-red-50': q.color === 'red',
        }">
          <div class="text-xs text-gray-500 mb-1">{{ q.label }}</div>
          <div class="text-xl font-bold" :class="{
            'text-green-700': q.color === 'green',
            'text-orange-700': q.color === 'orange',
            'text-blue-700': q.color === 'blue',
            'text-red-700': q.color === 'red',
          }">{{ q.count }}</div>
          <div class="text-xs text-gray-500 mt-1">利润: ¥{{ fmtMoney(q.profit) }}</div>
        </div>
      </div>
    </div>

    <!-- SKU 明细表格 -->
    <div class="apple-card p-0 overflow-hidden">
      <div class="px-4 py-2 bg-gray-50 border-b border-gray-100 text-xs text-gray-500 font-medium">
        SKU 明细
      </div>
      <div class="overflow-x-auto">
        <table class="min-w-full text-sm">
          <thead class="bg-gray-50 text-gray-600">
            <tr>
              <th class="text-left px-3 py-2">聚合 SKU</th>
              <th class="text-right px-3 py-2">件数</th>
              <th class="text-right px-3 py-2">总成本</th>
              <th class="text-right px-3 py-2">总利润</th>
              <th class="text-right px-3 py-2">利润率</th>
              <th class="text-right px-3 py-2">平均天数</th>
              <th class="text-center px-3 py-2">周转</th>
            </tr>
          </thead>
          <tbody class="text-gray-700">
            <template v-for="sku in skus" :key="sku.key">
              <tr class="border-t border-gray-100 cursor-pointer hover:bg-gray-50" @click="toggleExpand(sku.key)">
                <td class="px-3 py-2 font-medium">
                  <span class="mr-2">{{ expandedSkus[sku.key] ? '▼' : '▶' }}</span>
                  {{ sku.key }}
                </td>
                <td class="text-right px-3 py-2">{{ sku.totalQty }}</td>
                <td class="text-right px-3 py-2">¥{{ fmtMoney(sku.totalCost) }}</td>
                <td class="text-right px-3 py-2 font-semibold" :class="sku.totalProfit >= 0 ? 'text-green-600' : 'text-red-600'">
                  ¥{{ fmtMoney(sku.totalProfit) }}
                </td>
                <td class="text-right px-3 py-2">{{ fmtPercent(sku.profitRate) }}</td>
                <td class="text-right px-3 py-2">{{ fmtDays(sku.avgDays) }}</td>
                <td class="text-center px-3 py-2">
                  <span 
                    class="inline-block w-3 h-3 rounded-full" 
                    :style="{ backgroundColor: getTurnoverColor(sku.avgDays) }"
                  ></span>
                </td>
              </tr>
              <tr v-if="expandedSkus[sku.key]" class="bg-gray-50">
                <td colspan="7" class="px-6 py-3">
                  <table class="min-w-full text-xs">
                    <thead>
                      <tr class="text-gray-500">
                        <th class="text-left py-1">SID</th>
                        <th class="text-left py-1">名称</th>
                        <th class="text-right py-1">数量</th>
                        <th class="text-right py-1">成本</th>
                        <th class="text-right py-1">售价</th>
                        <th class="text-right py-1">利润</th>
                        <th class="text-right py-1">售出日期</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="(item, idx) in sku.items" :key="idx" class="border-t border-gray-200">
                        <td class="text-gray-500 py-1">{{ item.sid }}</td>
                        <td class="py-1">{{ item.name }}</td>
                        <td class="text-right py-1">{{ item.qty }}</td>
                        <td class="text-right py-1">¥{{ fmtMoney(item.cost) }}</td>
                        <td class="text-right py-1">¥{{ fmtMoney(item.price) }}</td>
                        <td class="text-right py-1" :class="item.profit >= 0 ? 'text-green-600' : 'text-red-600'">
                          ¥{{ fmtMoney(item.profit) }}
                        </td>
                        <td class="text-right py-1">{{ item.soldDate }}</td>
                      </tr>
                    </tbody>
                  </table>
                </td>
              </tr>
            </template>
            <tr v-if="skus.length === 0">
              <td colspan="7" class="text-center text-gray-400 py-6">暂无已售商品数据</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
