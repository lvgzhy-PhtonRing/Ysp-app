<script setup>
import { computed, ref, watch, onMounted, onBeforeUnmount } from 'vue'
import Chart from 'chart.js/auto'
import { state as store } from '../../data/store'
import { buildInventoryAgingRows } from './useInventoryAging'

const emit = defineEmits(['back'])

// 视图模式：all | long | short
const viewMode = ref('all')

const sortBy = ref('months_desc')
const filterCategory = ref('全部')
const filterBatch = ref('全部')
const filterBrand = ref('全部')
const filterKeyword = ref('')

// 根据视图模式过滤数据
const baseRows = computed(() => {
  const allRows = buildInventoryAgingRows(store.items, store.transfers, new Date())
  if (viewMode.value === 'long') {
    return allRows.filter(r => r.isLongTerm === true)
  } else if (viewMode.value === 'short') {
    return allRows.filter(r => r.isLongTerm !== true)
  }
  return allRows
})

const rows = baseRows

const categoryOptions = computed(() => ['全部', ...Array.from(new Set(rows.value.map((r) => r.category))).sort((a, b) => String(a).localeCompare(String(b), 'zh-CN'))])
const batchOptions = computed(() => ['全部', ...Array.from(new Set(rows.value.map((r) => r.batch))).sort((a, b) => String(a).localeCompare(String(b), 'zh-CN'))])
const brandOptions = computed(() => ['全部', ...Array.from(new Set(rows.value.map((r) => r.brand || '其它'))).sort((a, b) => String(a).localeCompare(String(b), 'zh-CN'))])

const filteredRows = computed(() =>
  rows.value.filter((r) => {
    if (filterCategory.value !== '全部' && r.category !== filterCategory.value) return false
    if (filterBatch.value !== '全部' && r.batch !== filterBatch.value) return false
    if (filterBrand.value !== '全部' && (r.brand || '其它') !== filterBrand.value) return false
    const kw = String(filterKeyword.value || '').trim().toLowerCase()
    if (kw) {
      const text = `${r.sid || ''} ${r.name || ''} ${r.brand || ''} ${r.category || ''} ${r.batch || ''}`.toLowerCase()
      if (!text.includes(kw)) return false
    }
    return true
  }),
)

const sortedRows = computed(() => {
  const list = [...filteredRows.value]
  if (sortBy.value === 'months_desc') {
    list.sort((a, b) => b.monthsInStock - a.monthsInStock)
  } else if (sortBy.value === 'months_asc') {
    list.sort((a, b) => a.monthsInStock - b.monthsInStock)
  } else if (sortBy.value === 'brand') {
    list.sort((a, b) => String(a.brand || '').localeCompare(String(b.brand || ''), 'zh-CN'))
  } else if (sortBy.value === 'batch') {
    list.sort((a, b) => String(a.batch || '').localeCompare(String(b.batch || ''), 'zh-CN'))
  } else if (sortBy.value === 'category') {
    list.sort((a, b) => String(a.category || '').localeCompare(String(b.category || ''), 'zh-CN'))
  }
  return list
})

// 货值计算：cost × qty
const summary = computed(() => {
  const total = sortedRows.value.length
  const totalValue = sortedRows.value.reduce((s, r) => s + Number(r.cost || 0) * Number(r.qty || 1), 0)
  const totalMonths = sortedRows.value.reduce((s, r) => s + Number(r.monthsInStock || 0), 0)
  const avgMonths = total > 0 ? totalMonths / total : 0
  return { total, totalValue, avgMonths }
})

// 库龄区间配置
function getAgingBuckets(mode) {
  if (mode === 'long') {
    return [
      [0, 6, '6个月内'],
      [6, 12, '6-12个月'],
      [12, 18, '12-18个月'],
      [18, 24, '18-24个月'],
      [24, 36, '24-36个月'],
      [36, Infinity, '36个月+'],
    ]
  }
  // short 和 all 使用混合区间
  return [
    [0, 1, '1个月内'],
    [1, 2, '1-2个月'],
    [2, 3, '2-3个月'],
    [3, 6, '3-6个月'],
    [6, 12, '6-12个月'],
    [12, 18, '12-18个月'],
    [18, 24, '18-24个月'],
    [24, 36, '24-36个月'],
    [36, Infinity, '36个月+'],
  ]
}

// 计算库龄区间统计
const agingBuckets = computed(() => {
  const buckets = getAgingBuckets(viewMode.value)
  const totalValue = summary.value.totalValue
  
  return buckets.map(([min, max, label]) => {
    const items = sortedRows.value.filter(r => {
      const months = Number(r.monthsInStock || 0)
      return months >= min && (max === Infinity ? true : months < max)
    })
    const bucketValue = items.reduce((s, r) => s + Number(r.cost || 0) * Number(r.qty || 1), 0)
    const percentage = totalValue > 0 ? (bucketValue / totalValue) * 100 : 0
    return { label, value: bucketValue, percentage }
  })
})

function fmtNum(v) {
  return Number(v || 0).toFixed(2)
}

function fmtMoney(v) {
  return Number(v || 0).toLocaleString('zh-CN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
}

function sourceBadgeClass(source) {
  if (source === '入库日') return 'bg-green-100 text-green-700'
  if (source === '转运日') return 'bg-blue-100 text-blue-700'
  if (source === '采购日') return 'bg-cyan-100 text-cyan-700'
  if (source === '批次') return 'bg-amber-100 text-amber-700'
  return 'bg-gray-100 text-gray-600'
}

const maxMonths = computed(() => {
  const max = sortedRows.value.reduce((m, r) => Math.max(m, Number(r.monthsInStock || 0)), 0)
  return max > 0 ? max : 1
})

function monthBarStyle(months) {
  const ratio = Math.max(0, Math.min(1, Number(months || 0) / Number(maxMonths.value || 1)))
  return { width: `${(ratio * 100).toFixed(1)}%` }
}

// 图表相关
const chartCanvasRef = ref(null)
const pieChartCanvasRef = ref(null)
let chartInstance = null
let pieChartInstance = null

// 饼图颜色
const PIE_COLORS = [
  'rgba(59, 130, 246, 0.7)',   // blue
  'rgba(99, 102, 241, 0.7)',   // indigo
  'rgba(139, 92, 246, 0.7)',   // violet
  'rgba(168, 85, 247, 0.7)',   // purple
  'rgba(192, 132, 252, 0.7)',  // light purple
  'rgba(232, 121, 249, 0.7)',  // fuchsia
  'rgba(236, 72, 153, 0.7)',   // pink
  'rgba(239, 68, 68, 0.7)',    // red
  'rgba(249, 115, 22, 0.7)',   // orange
]

// 自定义插件：在饼图扇形内显示百分比
const datalabelsPlugin = {
  id: 'datalabels',
  afterDatasetsDraw(chart) {
    const { ctx } = chart
    const meta = chart.getDatasetMeta(0)
    
    if (!meta || !meta.data) return
    
    meta.data.forEach((element, index) => {
      const value = chart.data.datasets[0].data[index]
      if (value < 2) return // 太小的扇形不显示
      
      const { x, y } = element.tooltipPosition()
      const percentage = value.toFixed(1)
      
      ctx.save()
      ctx.fillStyle = '#ffffff'
      ctx.font = 'bold 11px sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(`${percentage}%`, x, y)
      ctx.restore()
    })
  }
}

function initChart() {
  if (!chartCanvasRef.value) return
  
  if (chartInstance) {
    chartInstance.destroy()
  }
  
  const buckets = agingBuckets.value
  const ctx = chartCanvasRef.value.getContext('2d')
  
  chartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: buckets.map(b => b.label),
      datasets: [{
        label: '库存金额',
        data: buckets.map(b => b.value),
        backgroundColor: 'rgba(59, 130, 246, 0.6)',
        borderColor: 'rgba(59, 130, 246, 1)',
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
              const bucket = buckets[context.dataIndex]
              return `金额: ¥${fmtMoney(bucket.value)} (${bucket.percentage.toFixed(1)}%)`
            }
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            callback: (value) => `¥${fmtMoney(value)}`
          }
        }
      }
    }
  })
}

function initPieChart() {
  if (!pieChartCanvasRef.value) return
  
  if (pieChartInstance) {
    pieChartInstance.destroy()
  }
  
  const buckets = agingBuckets.value
  const ctx = pieChartCanvasRef.value.getContext('2d')
  
  pieChartInstance = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: buckets.map(b => b.label),
      datasets: [{
        data: buckets.map(b => b.percentage),
        backgroundColor: PIE_COLORS.slice(0, buckets.length),
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
              const bucket = buckets[context.dataIndex]
              return `${bucket.label}: ${bucket.percentage.toFixed(1)}% (¥${fmtMoney(bucket.value)})`
            }
          }
        }
      }
    },
    plugins: [datalabelsPlugin]
  })
}

// 监听数据变化，更新图表
watch([agingBuckets, viewMode], () => {
  initChart()
  initPieChart()
}, { deep: true })

onMounted(() => {
  setTimeout(() => {
    initChart()
    initPieChart()
  }, 100)
})

onBeforeUnmount(() => {
  if (chartInstance) {
    chartInstance.destroy()
  }
  if (pieChartInstance) {
    pieChartInstance.destroy()
  }
})
</script>

<template>
  <div class="space-y-6">
    <!-- 页面标题 -->
    <div class="flex items-center justify-between">
      <div class="flex items-baseline gap-3">
        <h2 class="text-3xl font-extrabold">账龄分析</h2>
        <span class="text-base text-gray-400 font-light">Inventory Aging Analysis</span>
      </div>
      <div class="flex gap-2">
        <button 
          class="btn btn-outline btn-sm px-4"
          :class="viewMode === 'all' ? 'ring-2 ring-sky-500' : ''"
          @click="viewMode = 'all'"
        >
          所有库存
        </button>
        <button 
          class="btn btn-outline btn-sm px-4"
          :class="viewMode === 'long' ? 'ring-2 ring-purple-500' : ''"
          @click="viewMode = 'long'"
        >
          长线库存
        </button>
        <button 
          class="btn btn-outline btn-sm px-4"
          :class="viewMode === 'short' ? 'ring-2 ring-blue-500' : ''"
          @click="viewMode = 'short'"
        >
          短线库存
        </button>
      </div>
    </div>

    <div class="grid grid-cols-3 gap-4">
      <div class="bg-white/90 p-4 rounded-xl border border-sky-100">
        <div class="text-xs text-slate-500 mb-1">库存件数</div>
        <div class="text-2xl font-bold text-slate-800">{{ summary.total }}</div>
      </div>
      <div class="bg-white/90 p-4 rounded-xl border border-sky-100">
        <div class="text-xs text-slate-500 mb-1">库存总货值</div>
        <div class="text-2xl font-bold text-warning">¥{{ fmtMoney(summary.totalValue) }}</div>
      </div>
      <div class="bg-white/90 p-4 rounded-xl border border-sky-100">
        <div class="text-xs text-slate-500 mb-1">平均库存月数</div>
        <div class="text-2xl font-bold text-purple-700">{{ fmtNum(summary.avgMonths) }}</div>
      </div>
    </div>

    <!-- 库龄区间金额图表 -->
    <div class="grid grid-cols-3 gap-4">
      <div class="col-span-2 apple-card p-4">
        <div class="flex justify-between items-center mb-3">
          <div class="text-xs text-gray-500">库龄区间金额分布</div>
          <span class="text-xs text-gray-400">单位：元</span>
        </div>
        <div class="h-64">
          <canvas ref="chartCanvasRef"></canvas>
        </div>
      </div>
      <div class="apple-card p-4">
        <div class="text-xs text-gray-500 mb-3">各区间占比</div>
        <div class="h-64">
          <canvas ref="pieChartCanvasRef"></canvas>
        </div>
      </div>
    </div>

    <div class="rounded-xl border border-sky-100 bg-white/90 p-4">
      <div class="grid grid-cols-1 md:grid-cols-6 gap-3">
        <select v-model="filterCategory" class="apple-select py-1.5 bg-white text-slate-800">
          <option v-for="c in categoryOptions" :key="c" :value="c">{{ c === '全部' ? '所有大类' : c }}</option>
        </select>
        <select v-model="filterBatch" class="apple-select py-1.5 bg-white text-slate-800">
          <option v-for="b in batchOptions" :key="b" :value="b">{{ b === '全部' ? '所有批次' : b }}</option>
        </select>
        <select v-model="filterBrand" class="apple-select py-1.5 bg-white text-slate-800">
          <option v-for="b in brandOptions" :key="b" :value="b">{{ b === '全部' ? '所有品牌' : b }}</option>
        </select>
        <input v-model="filterKeyword" class="apple-input py-1.5 bg-white text-slate-800 placeholder:text-slate-400" placeholder="搜索SID/名称/品牌..." />
        <select v-model="sortBy" class="apple-select py-1.5 col-span-2 bg-white text-slate-800">
          <option value="months_desc">按库存月数（高→低）</option>
          <option value="months_asc">按库存月数（低→高）</option>
          <option value="brand">按品牌</option>
          <option value="batch">按批次</option>
          <option value="category">按大类</option>
        </select>
      </div>
    </div>

    <div class="rounded-xl border border-sky-100 bg-white/90 p-0 overflow-hidden">
      <div class="overflow-x-auto">
        <table class="min-w-full text-sm">
          <thead class="bg-sky-50 text-slate-600">
            <tr>
              <th>SID</th>
              <th>名称</th>
              <th>品牌</th>
              <th>大类/批次</th>
              <th class="text-right">单价</th>
              <th class="text-right">数量</th>
              <th class="text-right">货值</th>
              <th>入库</th>
              <th>来源</th>
              <th class="text-right">已入库(月)</th>
              <th>月数可视化</th>
            </tr>
          </thead>
          <tbody class="text-slate-700">
            <tr v-for="r in sortedRows" :key="r.id" class="border-t border-sky-100">
              <td class="text-xs text-slate-400 font-mono px-3 py-2">{{ r.sid }}</td>
              <td class="font-medium px-3 py-2">{{ r.name }}</td>
              <td class="px-3 py-2">{{ r.brand }}</td>
              <td>
                <div class="leading-tight px-3 py-2">
                  <div><span class="bg-sky-100 text-sky-800 px-2 py-0.5 rounded text-[11px]">{{ r.category }}</span></div>
                  <div class="text-xs text-slate-500 mt-0.5">{{ r.batch }}</div>
                </div>
              </td>
              <td class="text-right px-3 py-2">¥{{ fmtNum(r.cost) }}</td>
              <td class="text-right px-3 py-2">{{ r.qty || 1 }}</td>
              <td class="text-right text-primary font-semibold px-3 py-2">¥{{ fmtMoney(Number(r.cost || 0) * Number(r.qty || 1)) }}</td>
              <td class="px-3 py-2">{{ r.inStockDate || '-' }}</td>
              <td class="px-3 py-2">
                <span class="text-xs px-2 py-1 rounded whitespace-nowrap" :class="sourceBadgeClass(r.source)">{{ r.source }}</span>
              </td>
              <td class="text-right font-semibold px-3 py-2">{{ fmtNum(r.monthsInStock) }}</td>
              <td class="px-3 py-2">
                <div class="h-2 bg-sky-100 rounded overflow-hidden w-40">
                  <div class="h-full bg-blue-500" :style="monthBarStyle(r.monthsInStock)" />
                </div>
              </td>
            </tr>
            <tr v-if="sortedRows.length === 0">
              <td colspan="11" class="text-center text-slate-400 py-6">暂无数据</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
