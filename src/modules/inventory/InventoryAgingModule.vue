<script setup>
import { computed, ref } from 'vue'
import { state as store } from '../../data/store'
import { buildInventoryAgingRows } from './useInventoryAging'

const emit = defineEmits(['back'])

const sortBy = ref('months_desc')
const filterCategory = ref('全部')
const filterBatch = ref('全部')
const filterBrand = ref('全部')
const filterKeyword = ref('')

const rows = computed(() => buildInventoryAgingRows(store.items, store.transfers, new Date()))

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

const summary = computed(() => {
  const total = sortedRows.value.length
  const totalMonths = sortedRows.value.reduce((s, r) => s + Number(r.monthsInStock || 0), 0)
  const avgMonths = total > 0 ? totalMonths / total : 0
  return { total, totalMonths, avgMonths }
})

function fmtNum(v) {
  return Number(v || 0).toFixed(2)
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
</script>

<template>
  <div class="space-y-5 max-w-7xl mx-auto text-slate-700">
    <div class="rounded-2xl border border-sky-200 bg-gradient-to-r from-sky-100 via-cyan-50 to-blue-100 px-5 py-4 shadow-sm">
      <div class="flex justify-between items-end">
        <div>
          <div class="text-xs font-semibold tracking-wider text-sky-700 mb-1">库存管理</div>
          <div class="flex items-baseline gap-3">
            <h2 class="text-3xl font-extrabold text-sky-900">库存账龄分析</h2>
            <span class="text-base text-sky-400 font-light">Inventory Aging</span>
          </div>
          <div class="text-xs text-sky-700 mt-1">库龄统一按入库日计算；缺失时使用批次时间兜底</div>
        </div>
        <button class="btn btn-sm border border-sky-200 text-sky-800 bg-white/80 hover:bg-white" @click="emit('back')"><i class="fa-solid fa-arrow-left mr-1"></i>返回库存管理</button>
      </div>
    </div>

    <div class="grid grid-cols-3 gap-4">
      <div class="bg-white/90 p-4 rounded-xl border border-sky-100">
        <div class="text-xs text-slate-500 mb-1">非长线库存件数</div>
        <div class="text-2xl font-bold text-slate-800">{{ summary.total }}</div>
      </div>
      <div class="bg-white/90 p-4 rounded-xl border border-sky-100">
        <div class="text-xs text-slate-500 mb-1">总库存月数</div>
        <div class="text-2xl font-bold text-warning">{{ fmtNum(summary.totalMonths) }}</div>
      </div>
      <div class="bg-white/90 p-4 rounded-xl border border-sky-100">
        <div class="text-xs text-slate-500 mb-1">平均库存月数</div>
        <div class="text-2xl font-bold text-purple-700">{{ fmtNum(summary.avgMonths) }}</div>
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
               <th class="text-right">成本</th>
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
              <td class="text-right text-primary font-semibold px-3 py-2">{{ fmtNum(r.cost) }}</td>
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
              <td colspan="9" class="text-center text-slate-400 py-6">暂无数据</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>
