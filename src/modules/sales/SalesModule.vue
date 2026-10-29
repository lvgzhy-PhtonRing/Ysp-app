<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { calcProfit } from '../../utils/calc'
import { state as store } from '../../data/store'
import { editSaleRecord, getOwnerInventory, getSalesChannelStats, getSalesStats, rollbackSale as rollbackSaleRecord, setSaleConfirmation, submitSell } from './useSales'
import { DEFAULT_SALES_CHANNEL, filterSalesByOwner, filterSalesByShop, SALES_CHANNELS } from './salesChannels'

const showAddModal = ref(false)
const showEditModal = ref(false)
const showRollbackRestoreModal = ref(false)
const collapsedSalesGroups = reactive({})
const salesCollapseStorageKey = 'ysp_ui_sales_collapse'
const salesFiltersStorageKey = 'ysp_ui_sales_filters'
const filters = reactive({
  category: '全部',
  batch: '全部',
  keyword: '',
})
const selectedShop = ref('全部')
const ownerScope = ref('current')

const addForm = reactive({
  itemId: null,
  price: 0,
  express: 0,
  feeRate: 0,
  deduction: 0,
  shop: DEFAULT_SALES_CHANNEL,
  date: new Date().toISOString().slice(0, 10),
})

const editForm = reactive({
  itemId: null,
  price: 0,
  express: 0,
  feeRate: 0,
  deduction: 0,
  shop: DEFAULT_SALES_CHANNEL,
  date: '',
  isConfirmed: false,
  entryDate: '',
})

const rollbackForm = reactive({ itemId: null, status: 'inventory', stock: 1 })

const allSoldItems = computed(() => store.items.filter((item) => item?.status === 'sold' && item?.saleDetails))
const soldItems = computed(() => filterSalesByOwner(
  allSoldItems.value,
  ownerScope.value === 'all' ? '全部' : store.currentOwner,
))

const saleCategoryOptions = computed(() => {
  const set = new Set(['全部'])
  shopFilteredItems.value.forEach((item) => {
    if (item?.category) set.add(item.category)
  })
  return Array.from(set)
})

const saleBatchOptions = computed(() => {
  if (filters.category === '全部') {
    const all = new Set(['全部'])
    shopFilteredItems.value.forEach((item) => {
      if (item?.batch) all.add(item.batch)
    })
    return Array.from(all)
  }
  const set = new Set(['全部'])
  shopFilteredItems.value.forEach((item) => {
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
  let list = shopFilteredItems.value
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

const inventoryItems = computed(() => getOwnerInventory(store.items, store.currentOwner))

const shopFilteredItems = computed(() => filterSalesByShop(soldItems.value, selectedShop.value))
const salesStats = computed(() => getSalesStats(shopFilteredItems.value))
const salesChannelStats = computed(() => getSalesChannelStats(soldItems.value))

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

function getSafeDateTs(value) {
  const text = String(value || '').trim()
  if (!text) return 0
  const ts = new Date(text).getTime()
  return Number.isFinite(ts) ? ts : 0
}

function getSaleOrderTs(item) {
  const soldAt = Number(item?.saleDetails?.soldAt || 0)
  if (Number.isFinite(soldAt) && soldAt > 0) return soldAt
  const idTs = Number(item?.id || 0)
  return Number.isFinite(idTs) && idTs > 0 ? idTs : 0
}

function compareSoldItemsDesc(a, b) {
  const da = getSafeDateTs(a?.saleDetails?.date)
  const db = getSafeDateTs(b?.saleDetails?.date)
  if (db !== da) return db - da

  const oa = getSaleOrderTs(a)
  const ob = getSaleOrderTs(b)
  if (ob !== oa) return ob - oa

  return Number(b?.id || 0) - Number(a?.id || 0)
}

const groupedSalesList = computed(() => {
  const map = new Map()

  filteredSoldItems.value.forEach((item) => {
    const key = item.saleDetails?.date?.slice(0, 7) || '未记录月份'

    if (!map.has(key)) {
      map.set(key, { key, items: [], count: 0, revenue: 0, cost: 0, profit: 0 })
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
    g.items.sort(compareSoldItemsDesc)
  })

  return list.sort((a, b) => String(b.key).localeCompare(String(a.key)))
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
  addForm.shop = DEFAULT_SALES_CHANNEL
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
    shop: addForm.shop,
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
  editForm.shop = item.saleDetails?.shop || DEFAULT_SALES_CHANNEL
  editForm.date = item.saleDetails?.date || ''
  editForm.isConfirmed = item.saleDetails?.isConfirmed !== false
  editForm.entryDate = item.saleDetails?.entryDate || ''
  showEditModal.value = true
}

function localToday() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

function onConfirmationChange() {
  if (editForm.isConfirmed && !editForm.entryDate) editForm.entryDate = localToday()
  if (!editForm.isConfirmed) editForm.entryDate = ''
}

function submitEditSale() {
  if (!editForm.itemId) return
  const existingSale = store.items.find((item) => item.id === editForm.itemId)?.saleDetails
  const wasConfirmed = existingSale?.isConfirmed !== false
  const previousEntryDate = existingSale?.entryDate || ''
  editSaleRecord(editForm.itemId, {
    price: Number(editForm.price || 0),
    express: Number(editForm.express || 0),
    feeRate: Number(editForm.feeRate || 0),
    deduction: Number(editForm.deduction || 0),
    shop: editForm.shop,
    date: editForm.date,
  })
  if (wasConfirmed !== editForm.isConfirmed || previousEntryDate !== editForm.entryDate) {
    setSaleConfirmation(editForm.itemId, editForm.isConfirmed, editForm.entryDate)
  }
  showEditModal.value = false
}

function rollbackSale(itemId) {
  const result = rollbackSaleRecord(itemId)
  if (result.status !== 'requires-restore-confirmation') return
  rollbackForm.itemId = itemId
  rollbackForm.status = 'inventory'
  rollbackForm.stock = 1
  showRollbackRestoreModal.value = true
}

function confirmLegacyRollback() {
  if (rollbackForm.itemId == null) return
  const result = rollbackSaleRecord(rollbackForm.itemId, {
    status: rollbackForm.status,
    stock: Number(rollbackForm.stock),
  })
  if (result.status === 'rolled-back') showRollbackRestoreModal.value = false
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
  selectedShop.value = '全部'
  ownerScope.value = 'current'
  filters.category = '全部'
  filters.batch = '全部'
  filters.keyword = ''
  Object.keys(collapsedSalesGroups).forEach((k) => {
    delete collapsedSalesGroups[k]
  })
  localStorage.removeItem(salesCollapseStorageKey)
  localStorage.removeItem(salesFiltersStorageKey)
}

onMounted(() => {
  try {
    const collapsedRaw = localStorage.getItem(salesCollapseStorageKey)
    if (collapsedRaw) Object.assign(collapsedSalesGroups, JSON.parse(collapsedRaw))

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
  <div class="space-y-4">
    <div class="flex items-baseline gap-3 mb-3">
      <h2 class="text-3xl leading-10 font-extrabold">销售记账</h2>
      <span class="text-base text-gray-400 font-light">Sales Bookkeeping</span>
    </div>

    <section aria-label="各店铺销售汇总" class="space-y-2">
      <h3 class="text-sm font-semibold text-gray-500">店铺汇总</h3>
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <article v-for="summary in salesChannelStats" :key="summary.shop" :data-shop-summary="summary.shop" class="rounded-xl border border-gray-100 border-l-4 border-l-blue-400 bg-gray-50 p-3">
          <div class="flex items-center justify-between gap-2">
            <h4 class="font-semibold text-gray-800">{{ summary.shop }}</h4>
            <span class="text-xs text-gray-500">{{ summary.totalSoldCount }} 件</span>
          </div>
          <div class="mt-2 grid grid-cols-2 gap-3">
            <div><div class="text-[11px] text-gray-400">成交额</div><div class="text-sm font-bold text-gray-700">{{ fmtMoney(summary.totalRevenue) }}</div></div>
            <div><div class="text-[11px] text-gray-400">销售利润</div><div class="text-sm font-bold" :class="summary.totalProfit >= 0 ? 'text-success' : 'text-danger'">{{ fmtMoney(summary.totalProfit) }}</div></div>
          </div>
        </article>
      </div>
    </section>

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
        <div class="text-xs text-gray-500 mb-1">销售利润</div>
        <div class="text-2xl font-bold" :class="salesStats.totalProfit >= 0 ? 'text-success' : 'text-danger'">{{ fmtMoney(salesStats.totalProfit) }}</div>
        <div class="mt-1 text-xs text-gray-400">未扣公共支出</div>
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

      <div class="flex flex-col gap-3 border-t border-gray-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
        <div class="flex flex-wrap items-center gap-4">
          <div role="group" aria-label="Owner范围" class="flex flex-wrap items-center gap-2">
            <span class="text-xs font-semibold text-gray-500">Owner</span>
            <button class="px-3 py-1 text-xs rounded-full transition" :class="ownerScope === 'current' ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'" :aria-pressed="ownerScope === 'current'" @click="ownerScope = 'current'">当前 Owner</button>
            <button class="px-3 py-1 text-xs rounded-full transition" :class="ownerScope === 'all' ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'" :aria-pressed="ownerScope === 'all'" @click="ownerScope = 'all'">全部 Owner</button>
          </div>
          <div role="group" aria-label="销售渠道" class="flex flex-wrap items-center gap-2">
            <span class="text-xs font-semibold text-gray-500">店铺</span>
            <button v-for="shop in ['全部', ...SALES_CHANNELS]" :key="shop" class="px-3 py-1 text-xs rounded-full transition" :class="selectedShop === shop ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'" :aria-pressed="selectedShop === shop" @click="selectedShop = shop">{{ shop }}</button>
          </div>
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
          <span class="ml-4 text-gray-500 font-normal">成本: {{ fmtMoney(group.cost) }}</span>
          <span class="ml-4 font-normal" :class="group.cost > 0 ? (group.profit / group.cost * 100 >= 0 ? 'text-success' : 'text-danger') : 'text-gray-500'">利润率: {{ group.cost > 0 ? (group.profit / group.cost * 100).toFixed(2) : '0.00' }}%</span>
          <span class="ml-4 font-normal" :class="group.profit >= 0 ? 'text-success' : 'text-danger'">销售利润: {{ fmtProfit(group.profit) }}<span v-if="group.profit < 0" class="ml-1">(亏损)</span></span>
        </div>

        <div v-show="collapsedSalesGroups[group.key] !== true" class="overflow-x-auto">
          <table class="apple-table min-w-full text-sm">
            <thead class="bg-white text-xs text-gray-500">
              <tr>
              <th class="w-28">下单日期</th>
              <th class="w-28">到账状态 / 入账日期</th>
              <th class="w-28">销售渠道</th>
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
                <td class="whitespace-nowrap">{{ item.saleDetails?.date || '未记录' }}</td>
                <td class="whitespace-nowrap">
                  <span class="mr-1 rounded-full px-2 py-0.5 text-xs" :class="item.saleDetails?.isConfirmed === false ? 'bg-amber-100 text-amber-800' : 'bg-green-100 text-green-800'">{{ item.saleDetails?.isConfirmed === false ? '待确认' : '已确认到账' }}</span>
                  <span class="text-xs text-gray-500">{{ item.saleDetails?.isConfirmed === false ? '—' : (item.saleDetails?.entryDate || '待补入账日') }}</span>
                </td>
                <td class="whitespace-nowrap">{{ item.saleDetails?.shop || DEFAULT_SALES_CHANNEL }}</td>
                <td class="align-middle"><div class="flex items-center gap-2"><span class="font-medium truncate">{{ item.name }}</span><span v-if="ownerScope === 'all'" class="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold" :class="item.owner === 'payton' ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'">{{ item.owner === 'payton' ? 'PAYTON' : 'PAPA' }}</span></div><div class="text-xs text-gray-400 font-mono">{{ item.sid }}</div></td>
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
          <div><label class="block text-sm mb-1 text-gray-600">销售渠道</label><select v-model="addForm.shop" class="apple-select" required><option v-for="shop in SALES_CHANNELS" :key="shop" :value="shop">{{ shop }}</option></select></div>
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
          <div><label class="block text-sm mb-1 text-gray-600">销售渠道</label><select v-model="editForm.shop" class="apple-select" required><option v-for="shop in SALES_CHANNELS" :key="shop" :value="shop">{{ shop }}</option></select></div>
          <div><label class="block text-sm mb-1 text-gray-600">下单日期</label><input v-model="editForm.date" type="date" class="apple-input" /></div>
          <div class="rounded-xl bg-gray-50 p-3 space-y-3">
            <label class="flex items-center gap-2 text-sm font-medium text-gray-700"><input v-model="editForm.isConfirmed" type="checkbox" @change="onConfirmationChange" />买家已确认到账</label>
            <div><label class="block text-xs mb-1 text-gray-500">入账日期（税务归期）</label><input v-model="editForm.entryDate" type="date" class="apple-input" :disabled="!editForm.isConfirmed" /></div>
          </div>
        </div>
        <div class="mt-6 flex justify-end gap-3">
          <button class="btn btn-outline" @click="showEditModal = false">取消</button>
          <button class="btn btn-primary" @click="submitEditSale">保存</button>
        </div>
      </div>
    </div>

    <div v-if="showRollbackRestoreModal" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 glass-modal" role="dialog" aria-label="确认恢复销售前库存状态">
      <div class="apple-card w-full max-w-md">
        <h3 class="text-lg font-bold mb-2">确认恢复销售前状态</h3>
        <p class="text-sm text-gray-500 mb-4">这条旧销售没有保存售前状态，请确认回滚后商品应恢复为哪种状态和数量。</p>
        <div class="space-y-3">
          <div><label class="block text-sm mb-1 text-gray-600">恢复状态</label><select v-model="rollbackForm.status" class="apple-select"><option value="inventory">库存中</option><option value="unlisted">已下架</option></select></div>
          <div><label class="block text-sm mb-1 text-gray-600">恢复数量</label><input v-model.number="rollbackForm.stock" type="number" min="0" class="apple-input" /></div>
        </div>
        <div class="mt-5 flex justify-end gap-3"><button class="btn btn-outline" @click="showRollbackRestoreModal = false">取消</button><button class="btn btn-danger text-white" @click="confirmLegacyRollback">确认恢复并回滚</button></div>
      </div>
    </div>
  </div>
</template>
