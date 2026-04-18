<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { calcProfit } from '../../utils/calc'
import { addOperationLog, saveToLocalStorage, state as store } from '../../data/store'
import { editSaleRecord, getSalesStats, submitSell } from './useSales'

const showAddModal = ref(false)
const showEditModal = ref(false)
const collapsedSalesGroups = reactive({})
const salesViewMode = ref('month')
const salesCollapseStorageKey = 'ysp_ui_sales_collapse'
const salesViewModeStorageKey = 'ysp_ui_sales_view_mode'
const salesFiltersStorageKey = 'ysp_ui_sales_filters'
const CATEGORY_ORDER = ['日淘', '美淘', '国内', '2025JAPAN']
const BRAND_ORDER = ['hotwheels', 'minigt', 'tlv', 'kyosho', '红白盒', '其它']

function normalizeBrand(brand) {
  return String(brand || '').trim().toLowerCase()
}

function brandRank(brand) {
  const n = normalizeBrand(brand)
  const idx = BRAND_ORDER.indexOf(n)
  return idx >= 0 ? idx : 99
}

function categoryRank(category) {
  const idx = CATEGORY_ORDER.indexOf(String(category || ''))
  return idx >= 0 ? idx : 99
}

function batchRank(category, batch) {
  const b = String(batch || '').trim().toLowerCase()
  if (category === '日淘') {
    if (b.includes('26h')) return 0
    if (b.includes('26g')) return 1
    if (b.includes('26f')) return 2
    if (b.includes('26e')) return 3
    if (b.includes('预订')) return 4
    if (b === 'd' || b.includes('d批')) return 5
    if (b === 'c' || b.includes('c批')) return 6
    if (b === 'b' || b.includes('b批')) return 7
    if (b === 'a' || b.includes('a批')) return 8
    return 99
  }
  if (category === '美淘') {
    if (b.includes('26下半年')) return 0
    if (b.includes('26上半年')) return 1
    if (b.includes('b组下半年')) return 2
    if (b.includes('b组上半年')) return 3
    if (b.includes('a组下半年')) return 4
    if (b.includes('a组上半年')) return 5
    return 99
  }
  if (category === '国内') {
    if (b.includes('国内现货')) return 0
    if (b.includes('代理预定')) return 1
    if (b.includes('苏州gtshow')) return 2
    return 99
  }
  return 99
}

const filters = reactive({
  category: '全部',
  batch: '全部',
  keyword: '',
})

const addForm = reactive({
  itemId: null,
  price: 0,
  express: 0,
  feeRate: 0,
  deduction: 0,
  date: new Date().toISOString().slice(0, 10),
})

const editForm = reactive({
  itemId: null,
  price: 0,
  express: 0,
  feeRate: 0,
  deduction: 0,
  date: '',
})

const soldItems = computed(() =>
  store.items.filter((item) => item?.status === 'sold' && item?.saleDetails),
)

const saleCategoryOptions = computed(() => {
  const set = new Set(['全部'])
  soldItems.value.forEach((item) => {
    if (item?.category) set.add(item.category)
  })
  return Array.from(set)
})

const saleBatchOptions = computed(() => {
  if (filters.category === '全部') {
    const all = new Set(['全部'])
    soldItems.value.forEach((item) => {
      if (item?.batch) all.add(item.batch)
    })
    return Array.from(all)
  }
  const set = new Set(['全部'])
  soldItems.value.forEach((item) => {
    if (item?.category === filters.category && item?.batch) set.add(item.batch)
  })
  return Array.from(set)
})

function normalizeFuzzy(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]/g, '')
}

const filteredSoldItems = computed(() => {
  let list = soldItems.value
  if (filters.category !== '全部') {
    list = list.filter((item) => item?.category === filters.category)
  }
  if (filters.batch !== '全部') {
    list = list.filter((item) => item?.batch === filters.batch)
  }
  const kw = normalizeFuzzy(filters.keyword)
  if (kw) {
    list = list.filter((item) => {
      const hay = normalizeFuzzy(`${item?.sid || ''} ${item?.name || ''} ${item?.brand || ''} ${item?.batch || ''} ${item?.category || ''}`)
      return hay.includes(kw)
    })
  }
  return list
})

const inventoryItems = computed(() =>
  store.items.filter((item) => item?.status === 'inventory'),
)

const salesStats = computed(() => getSalesStats(store.items))

const addSelectedItem = computed(() =>
  inventoryItems.value.find((item) => item.id === addForm.itemId) || null,
)

const addPreviewProfit = computed(() => {
  if (!addSelectedItem.value) return 0
  return calcProfit(
    Number(addForm.price || 0),
    Number(addForm.express || 0),
    Number(addForm.feeRate || 0),
    Number(addForm.deduction || 0),
    Number(addSelectedItem.value.cost || 0),
  )
})

const groupedSalesList = computed(() => {
  const map = new Map()
  const getItemTs = (item) => {
    const d = item?.saleDetails?.date
    if (!d) return 0
    const t = new Date(d).getTime()
    return Number.isFinite(t) ? t : 0
  }

  const getGroupLatestTs = (group) => Math.max(...(group?.items || []).map(getItemTs), 0)

  filteredSoldItems.value.forEach((item) => {
    let key = '全部'
    if (salesViewMode.value === 'all') key = String(item.id)
    if (salesViewMode.value === 'month') key = item.saleDetails?.date?.slice(0, 7) || '未记录月份'
    if (salesViewMode.value === 'category') key = item.category || '未分类'
    if (salesViewMode.value === 'batch') key = `${item.category || '未分类'} / ${item.batch || '未分批'}`
    if (salesViewMode.value === 'brand') key = item.brand || '未分类品牌'

    if (!map.has(key)) {
      map.set(key, { key, title: salesViewMode.value === 'all' ? `${item.sid || ''} / ${item.name || ''}` : key, items: [], count: 0, revenue: 0, cost: 0, profit: 0 })
    }
    const g = map.get(key)
    g.items.push(item)
    g.count += 1
    g.revenue += Number(item.saleDetails?.price || 0)
    g.cost += Number(item.cost || 0)
    g.profit += Number(item.saleDetails?.profit || 0)
  })

  const list = Array.from(map.values())
  list.forEach((g) => {
    g.items.sort((a, b) => getItemTs(b) - getItemTs(a))
  })

  // 各分组统一：最新条目在最上（先按成交日期，再按id兜底）
  list.forEach((g) => {
    g.items.sort((a, b) => {
      const ta = getItemTs(a)
      const tb = getItemTs(b)
      if (tb !== ta) return tb - ta
      return Number(b?.id || 0) - Number(a?.id || 0)
    })
  })

  if (salesViewMode.value === 'all') {
    return list.sort((a, b) => {
      const da = a.items?.[0]?.saleDetails?.date || ''
      const db = b.items?.[0]?.saleDetails?.date || ''
      return String(db).localeCompare(String(da))
    })
  }
  if (salesViewMode.value === 'month') {
    return list.sort((a, b) => String(b.key).localeCompare(String(a.key)))
  }
  if (salesViewMode.value === 'category') {
    return list.sort((a, b) => {
      const x = categoryRank(a.key)
      const y = categoryRank(b.key)
      if (x !== y) return x - y
      return String(a.key).localeCompare(String(b.key), 'zh-CN')
    })
  }
  if (salesViewMode.value === 'batch') {
    return list.sort((a, b) => {
      const [ca, ba] = String(a.key || '').split(' / ')
      const [cb, bb] = String(b.key || '').split(' / ')
      const c1 = categoryRank(ca)
      const c2 = categoryRank(cb)
      if (c1 !== c2) return c1 - c2
      const br1 = batchRank(ca, ba)
      const br2 = batchRank(cb, bb)
      if (br1 !== br2) return br1 - br2
      return String(ba).localeCompare(String(bb), 'zh-CN')
    })
  }
  if (salesViewMode.value === 'brand') {
    return list.sort((a, b) => {
      const r1 = brandRank(a.key)
      const r2 = brandRank(b.key)
      if (r1 !== r2) return r1 - r2
      return String(a.key).localeCompare(String(b.key), 'zh-CN')
    })
  }
  return list.sort((a, b) => {
    const ta = getGroupLatestTs(a)
    const tb = getGroupLatestTs(b)
    if (ta !== tb) return tb - ta
    return String(a.key).localeCompare(String(b.key), 'zh-CN')
  })
})

function fmtMoney(v) {
  return Number(v || 0).toFixed(2)
}

function fmtPercent(v) {
  return `${Number(v || 0).toFixed(2)}%`
}

function fmtProfit(v) {
  const n = Number(v || 0)
  return `${n >= 0 ? '+' : ''}${fmtMoney(n)}`
}

function openAddSaleModal() {
  addForm.itemId = inventoryItems.value[0]?.id ?? null
  addForm.price = 0
  addForm.express = 0
  addForm.feeRate = 0
  addForm.deduction = 0
  addForm.date = new Date().toISOString().slice(0, 10)
  showAddModal.value = true
}

function submitAddSale() {
  if (!addForm.itemId) return
  submitSell(addForm.itemId, {
    price: Number(addForm.price || 0),
    express: Number(addForm.express || 0),
    feeRate: Number(addForm.feeRate || 0),
    deduction: Number(addForm.deduction || 0),
    date: addForm.date,
  })
  showAddModal.value = false
}

function openEditSale(item) {
  editForm.itemId = item.id
  editForm.price = Number(item.saleDetails?.price || 0)
  editForm.express = Number(item.saleDetails?.express || 0)
  editForm.feeRate = Number(item.saleDetails?.feeRate || 0)
  editForm.deduction = Number(item.saleDetails?.deduction || 0)
  editForm.date = item.saleDetails?.date || ''
  showEditModal.value = true
}

function submitEditSale() {
  if (!editForm.itemId) return
  editSaleRecord(editForm.itemId, {
    price: Number(editForm.price || 0),
    express: Number(editForm.express || 0),
    feeRate: Number(editForm.feeRate || 0),
    deduction: Number(editForm.deduction || 0),
    date: editForm.date,
  })
  showEditModal.value = false
}

function rollbackSale(itemId) {
  const idx = store.items.findIndex((x) => x.id === itemId)
  if (idx < 0) return
  const item = store.items[idx]
  item.status = 'inventory'
  item.stock = 1
  delete item.saleDetails
  saveToLocalStorage()
  addOperationLog('sales_rollback', `回滚销售: ${item?.name || itemId}`, { sid: item?.sid })
}

function toggleSalesGroup(key) {
  collapsedSalesGroups[key] = !collapsedSalesGroups[key]
}

function expandAllSalesGroups() {
  groupedSalesList.value.forEach((g) => {
    collapsedSalesGroups[g.key] = false
  })
}

function collapseAllSalesGroups() {
  groupedSalesList.value.forEach((g) => {
    collapsedSalesGroups[g.key] = true
  })
}

function resetSalesViewState() {
  salesViewMode.value = 'month'
  filters.category = '全部'
  filters.batch = '全部'
  filters.keyword = ''
  Object.keys(collapsedSalesGroups).forEach((k) => {
    delete collapsedSalesGroups[k]
  })
  localStorage.removeItem(salesCollapseStorageKey)
  localStorage.removeItem(salesViewModeStorageKey)
  localStorage.removeItem(salesFiltersStorageKey)
}

function viewModeLabel() {
  if (salesViewMode.value === 'all') return '全列表'
  if (salesViewMode.value === 'month') return '按月份'
  if (salesViewMode.value === 'category') return '按大类'
  if (salesViewMode.value === 'batch') return '按批次'
  if (salesViewMode.value === 'brand') return '按品牌'
  return '按分组'
}

onMounted(() => {
  try {
    const collapsedRaw = localStorage.getItem(salesCollapseStorageKey)
    if (collapsedRaw) Object.assign(collapsedSalesGroups, JSON.parse(collapsedRaw))

    const modeRaw = localStorage.getItem(salesViewModeStorageKey)
    if (modeRaw && ['all', 'month', 'category', 'batch', 'brand'].includes(modeRaw)) {
      salesViewMode.value = modeRaw
    }

    const filtersRaw = localStorage.getItem(salesFiltersStorageKey)
    if (filtersRaw) {
      const parsed = JSON.parse(filtersRaw)
      if (parsed && typeof parsed === 'object') {
        filters.category = parsed.category || '全部'
        filters.batch = parsed.batch || '全部'
        filters.keyword = parsed.keyword || ''
      }
    }
  } catch (_) {
    // ignore invalid cache
  }
})

watch(
  collapsedSalesGroups,
  (val) => {
    localStorage.setItem(salesCollapseStorageKey, JSON.stringify(val))
  },
  { deep: true },
)

watch(salesViewMode, (val) => {
  localStorage.setItem(salesViewModeStorageKey, val)
})

watch(
  filters,
  (val) => {
    localStorage.setItem(salesFiltersStorageKey, JSON.stringify(val))
  },
  { deep: true },
)

watch(
  () => filters.category,
  () => {
    filters.batch = '全部'
  },
)
</script>

<template>
  <div class="space-y-6">
    <div class="flex justify-between items-end mb-6">
      <div class="flex items-baseline gap-3">
        <h2 class="text-3xl font-extrabold">销售记账</h2>
        <span class="text-base text-gray-400 font-light">Sales Bookkeeping</span>
      </div>
    </div>

    <div class="grid grid-cols-3 gap-4">
      <div class="bg-gray-50 p-4 rounded-xl border-l-4 border-gray-400">
        <div class="text-xs text-gray-500 mb-1">累计成交</div>
        <div class="text-2xl font-bold text-gray-800">{{ salesStats.totalSoldCount }} <span class="text-sm font-normal text-gray-500">件</span></div>
      </div>
      <div class="bg-gray-50 p-4 rounded-xl border-l-4 border-blue-500">
        <div class="text-xs text-gray-500 mb-1">成交总额</div>
        <div class="text-2xl font-bold text-gray-800">{{ fmtMoney(salesStats.totalRevenue) }}</div>
      </div>
      <div class="bg-gray-50 p-4 rounded-xl border-l-4" :class="salesStats.totalProfit >= 0 ? 'border-green-500' : 'border-red-500'">
        <div class="text-xs text-gray-500 mb-1">实盈利润</div>
        <div class="text-2xl font-bold" :class="salesStats.totalProfit >= 0 ? 'text-success' : 'text-danger'">{{ fmtMoney(salesStats.totalProfit) }}</div>
      </div>
    </div>

    <div class="apple-card p-4 flex flex-col gap-4">
      <div class="flex gap-4 items-center">
        <select v-model="filters.category" class="apple-select py-1.5 w-32">
          <option v-for="c in saleCategoryOptions" :key="c" :value="c">{{ c === '全部' ? '所有大类' : c }}</option>
        </select>
        <select v-model="filters.batch" class="apple-select py-1.5 w-32">
          <option v-for="b in saleBatchOptions" :key="b" :value="b">{{ b === '全部' ? '所有批次' : b }}</option>
        </select>
        <input v-model="filters.keyword" placeholder="搜索名称、SID..." class="apple-input py-1.5 w-64 text-sm" />
      </div>

      <div class="flex items-center justify-between gap-3 border-t border-gray-100 pt-4">
        <div class="flex flex-wrap gap-2">
          <button class="px-3 py-1 text-xs rounded-full transition" :class="salesViewMode==='all' ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'" @click="salesViewMode='all'">全列表</button>
          <button class="px-3 py-1 text-xs rounded-full transition" :class="salesViewMode==='month' ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'" @click="salesViewMode='month'">按月份</button>
          <button class="px-3 py-1 text-xs rounded-full transition" :class="salesViewMode==='category' ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'" @click="salesViewMode='category'">按大类</button>
          <button class="px-3 py-1 text-xs rounded-full transition" :class="salesViewMode==='batch' ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'" @click="salesViewMode='batch'">按批次</button>
          <button class="px-3 py-1 text-xs rounded-full transition" :class="salesViewMode==='brand' ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'" @click="salesViewMode='brand'">按品牌</button>
        </div>
        <div class="flex gap-2 shrink-0">
          <button class="btn btn-outline btn-xs" @click="expandAllSalesGroups">展开全部</button>
          <button class="btn btn-outline btn-xs" @click="collapseAllSalesGroups">折叠全部</button>
        </div>
      </div>
    </div>

    <div class="apple-card p-0 overflow-hidden">
      <div v-if="groupedSalesList.length === 0" class="p-6 text-sm text-gray-400">暂无销售记录</div>

      <div v-for="group in groupedSalesList" :key="group.key" class="border-b border-gray-100 last:border-b-0">
        <div class="group-header-row flex items-center px-4 py-3 cursor-pointer" @click="toggleSalesGroup(group.key)">
          <span class="cursor-pointer mr-2"><i :class="collapsedSalesGroups[group.key] ? 'fa-solid fa-chevron-right' : 'fa-solid fa-chevron-down'" /></span>
          <span class="font-semibold">{{ group.title || group.key }}</span>
          <span class="ml-2 text-gray-500 font-normal">共 {{ group.count }} 件</span>
          <span class="ml-4 text-primary font-normal">成交总额: {{ fmtMoney(group.revenue) }}</span>
          <template v-if="salesViewMode !== 'all'">
            <span class="ml-4 text-gray-500 font-normal">成本: {{ fmtMoney(group.cost) }}</span>
            <span class="ml-4 font-normal" :class="group.cost > 0 ? (group.profit / group.cost * 100 >= 0 ? 'text-success' : 'text-danger') : 'text-gray-500'">利润率: {{ group.cost > 0 ? (group.profit / group.cost * 100).toFixed(2) : '0.00' }}%</span>
          </template>
          <span class="ml-4 font-normal" :class="group.profit >= 0 ? 'text-success' : 'text-danger'">实盈利润: {{ fmtProfit(group.profit) }}<span v-if="group.profit < 0" class="ml-1">(亏损)</span></span>
        </div>

        <div v-show="collapsedSalesGroups[group.key] !== true" class="overflow-x-auto">
          <table class="apple-table min-w-full text-sm">
            <thead class="bg-white text-xs text-gray-500">
              <tr>
              <th class="w-28">成交日期</th>
              <th class="w-72">SID / 名称</th>
              <th class="w-40">品牌 / 批次</th>
              <th class="w-20">数量</th>
              <th class="w-28">成交价</th>
              <th class="w-28">成本</th>
              <th class="w-28">利润</th>
              <th class="w-24">操作</th>
            </tr>
            </thead>
            <tbody>
              <tr v-for="item in group.items" :key="item.id">
                <td class="whitespace-nowrap">{{ item.saleDetails?.date }}</td>
                <td class="align-middle"><div class="font-medium truncate">{{ item.name }}</div><div class="text-xs text-gray-400 font-mono">{{ item.sid }}</div></td>
                <td class="whitespace-nowrap">{{ item.brand }}<br><span class="text-xs text-gray-500">{{ item.batch }}</span></td>
                <td class="text-center"><span class="bg-primary/10 text-primary px-2 py-1 rounded font-semibold">{{ item.qty || 1 }}</span></td>
                <td class="font-semibold text-gray-900 text-right whitespace-nowrap">{{ fmtMoney(item.saleDetails?.price) }}</td>
                <td class="text-gray-500 text-right whitespace-nowrap">{{ fmtMoney(item.cost) }}</td>
                <td class="text-right whitespace-nowrap" :class="Number(item.saleDetails?.profit || 0) >= 0 ? 'text-success font-bold' : 'text-danger font-bold'">{{ fmtProfit(item.saleDetails?.profit) }}</td>
                <td class="flex gap-2">
                  <button class="btn btn-outline" style="font-size:10px; padding:2px 6px; line-height:1.25;" @click="openEditSale(item)"><i class="fa-solid fa-pen"></i></button>
                  <button class="btn btn-danger text-white" style="font-size:10px; padding:2px 7px; line-height:1.25;" @click="rollbackSale(item.id)">回滚</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- 记录销售弹窗 -->
    <div v-if="showAddModal" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 glass-modal">
      <div class="apple-card w-full max-w-lg relative">
        <button class="absolute top-4 right-4 text-gray-400 hover:text-gray-800" @click="showAddModal = false"><i class="fa-solid fa-xmark text-xl" /></button>
        <h3 class="text-xl font-bold mb-6">记录销售</h3>
        <div class="space-y-4">
          <div>
            <label class="block text-sm mb-1 text-gray-600">选择库存商品</label>
            <select v-model="addForm.itemId" class="apple-select">
              <option :value="null" disabled>请选择</option>
              <option v-for="item in inventoryItems" :key="item.id" :value="item.id">
                {{ item.sid || '-' }} · {{ item.name }} · 成本{{ fmtMoney(item.cost) }}
              </option>
            </select>
          </div>
          <div class="grid grid-cols-2 gap-4">
            <div><label class="block text-sm mb-1 text-gray-600">成交总价</label><input v-model.number="addForm.price" type="number" class="apple-input" /></div>
            <div><label class="block text-sm mb-1 text-gray-600">快递费</label><input v-model.number="addForm.express" type="number" class="apple-input" /></div>
            <div><label class="block text-sm mb-1 text-gray-600">平台费率</label><input v-model.number="addForm.feeRate" type="number" step="0.001" class="apple-input" /></div>
            <div><label class="block text-sm mb-1 text-gray-600">扣减</label><input v-model.number="addForm.deduction" type="number" class="apple-input" /></div>
          </div>
          <div><label class="block text-sm mb-1 text-gray-600">日期</label><input v-model="addForm.date" type="date" class="apple-input" /></div>
          <div class="bg-gray-50 p-3 rounded-xl text-sm">预计利润：<span :class="addPreviewProfit >= 0 ? 'text-success font-bold' : 'text-danger font-bold'">{{ fmtProfit(addPreviewProfit) }}</span><span v-if="addPreviewProfit < 0" class="text-danger ml-1">(亏损)</span></div>
        </div>
        <div class="mt-6 flex justify-end gap-3">
          <button class="btn btn-outline" @click="showAddModal = false">取消</button>
          <button class="btn btn-primary" @click="submitAddSale">确认</button>
        </div>
      </div>
    </div>

    <!-- 编辑销售弹窗 -->
    <div v-if="showEditModal" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 glass-modal">
      <div class="apple-card w-full max-w-md relative">
        <button class="absolute top-4 right-4 text-gray-400 hover:text-gray-800" @click="showEditModal = false"><i class="fa-solid fa-xmark text-xl" /></button>
        <h3 class="text-xl font-bold mb-6">编辑销售记录</h3>
        <div class="space-y-4">
          <div class="grid grid-cols-2 gap-4">
            <div><label class="block text-sm mb-1 text-gray-600">成交总价</label><input v-model.number="editForm.price" type="number" class="apple-input" /></div>
            <div><label class="block text-sm mb-1 text-gray-600">快递费</label><input v-model.number="editForm.express" type="number" class="apple-input" /></div>
            <div><label class="block text-sm mb-1 text-gray-600">平台费率</label><input v-model.number="editForm.feeRate" type="number" step="0.001" class="apple-input" /></div>
            <div><label class="block text-sm mb-1 text-gray-600">扣减</label><input v-model.number="editForm.deduction" type="number" class="apple-input" /></div>
          </div>
          <div><label class="block text-sm mb-1 text-gray-600">日期</label><input v-model="editForm.date" type="date" class="apple-input" /></div>
        </div>
        <div class="mt-6 flex justify-end gap-3">
          <button class="btn btn-outline" @click="showEditModal = false">取消</button>
          <button class="btn btn-primary" @click="submitEditSale">保存</button>
        </div>
      </div>
    </div>
  </div>
</template>
