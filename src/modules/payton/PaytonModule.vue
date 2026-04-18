<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { saveToLocalStorage, state as store } from '../../data/store'
import {
  addPaytonCar,
  addPaytonCarByPurchase,
  addPaytonRecord,
  deletePaytonRecord,
  editPaytonRecord,
  getPaytonStats,
  movePaytonCarToKeep,
  movePaytonCarToSell,
  sellPaytonCar,
} from './usePayton'

const showAddCarModal = ref(false)
const showSellCarModal = ref(false)
const showEditCarModal = ref(false)
const showAddRecordModal = ref(false)
const showEditRecordModal = ref(false)
const paytonViewMode = ref('record')
const collapsedMonthGroups = reactive({})
const collapsedInventoryGroups = reactive({ sell: false, keep: false })
const paytonViewModeStorageKey = 'ysp_ui_payton_view_mode'
const paytonMonthCollapseStorageKey = 'ysp_ui_payton_month_collapse'
const paytonInventoryCollapseStorageKey = 'ysp_ui_payton_inventory_collapse'

const addCarForm = reactive({
  name: '',
  brand: 'Hotwheels',
  qty: 1,
  avgPrice: 0,
})

const editCarForm = reactive({
  id: null,
  name: '',
  brand: 'Hotwheels',
  qty: 1,
  avgPrice: 0,
  keepQty: 1,
  keepUnitPrice: 0,
})

const sellCarForm = reactive({
  carId: null,
  qty: 1,
  sellPrice: 0,
  date: new Date().toISOString().slice(0, 10),
  account: 'yeb',
})

const addRecordForm = reactive({
  type: 'expense',
  category: '买小车',
  account: 'yeb',
  date: new Date().toISOString().slice(0, 10),
  amount: 0,
  note: '',
  carName: '',
  carQty: 1,
  carBrand: 'Hotwheels',
})

const carNameInputRef = ref(null)
const carNameSuggestions = ref([])
const showCarNameDropdown = ref(false)
const addCarNameSuggestions = ref([])
const showAddCarNameDropdown = ref(false)
const editCarNameSuggestions = ref([])
const showEditCarNameDropdown = ref(false)

const paytonCarSuggestionSource = computed(() => {
  const seen = new Set()
  const list = []
  ;(store.paytonInventory || []).forEach((car) => {
    const name = String(car?.name || '').trim()
    if (!name) return
    const brand = String(car?.brand || '').trim()
    const key = `${name.toLowerCase()}__${brand.toLowerCase()}`
    if (seen.has(key)) return
    seen.add(key)
    list.push(car)
  })
  return list
})

function getCarSuggestions(query) {
  const normalized = (query || '').trim().toLowerCase()
  if (!normalized) return []
  return paytonCarSuggestionSource.value
    .filter((car) => {
      const name = String(car.name || '').toLowerCase()
      const brand = String(car.brand || '').toLowerCase()
      return name.includes(normalized) || brand.includes(normalized)
    })
    .slice(0, 8)
}

watch(
  () => addRecordForm.carName,
  (value) => {
    carNameSuggestions.value = value ? getCarSuggestions(value) : []
    showCarNameDropdown.value = carNameSuggestions.value.length > 0
  },
)

function selectCarSuggestion(car) {
  addRecordForm.carName = car.name
  if (car.brand) addRecordForm.carBrand = car.brand
  showCarNameDropdown.value = false
}

function handleCarNameFocus() {
  if (addRecordForm.carName?.trim()) {
    carNameSuggestions.value = getCarSuggestions(addRecordForm.carName)
    showCarNameDropdown.value = carNameSuggestions.value.length > 0
  }
}

function handleCarNameBlur() {
  setTimeout(() => {
    showCarNameDropdown.value = false
  }, 150)
}

watch(
  () => addCarForm.name,
  (value) => {
    addCarNameSuggestions.value = value ? getCarSuggestions(value) : []
    showAddCarNameDropdown.value = addCarNameSuggestions.value.length > 0
  },
)

function selectAddCarSuggestion(car) {
  addCarForm.name = car.name
  if (car.brand) addCarForm.brand = car.brand
  showAddCarNameDropdown.value = false
}

function handleAddCarNameFocus() {
  if (addCarForm.name?.trim()) {
    addCarNameSuggestions.value = getCarSuggestions(addCarForm.name)
    showAddCarNameDropdown.value = addCarNameSuggestions.value.length > 0
  }
}

function handleAddCarNameBlur() {
  setTimeout(() => {
    showAddCarNameDropdown.value = false
  }, 150)
}

watch(
  () => editCarForm.name,
  (value) => {
    editCarNameSuggestions.value = value ? getCarSuggestions(value) : []
    showEditCarNameDropdown.value = editCarNameSuggestions.value.length > 0
  },
)

function selectEditCarSuggestion(car) {
  editCarForm.name = car.name
  if (car.brand) editCarForm.brand = car.brand
  showEditCarNameDropdown.value = false
}

function handleEditCarNameFocus() {
  if (editCarForm.name?.trim()) {
    editCarNameSuggestions.value = getCarSuggestions(editCarForm.name)
    showEditCarNameDropdown.value = editCarNameSuggestions.value.length > 0
  }
}

function handleEditCarNameBlur() {
  setTimeout(() => {
    showEditCarNameDropdown.value = false
  }, 150)
}

const editRecordForm = reactive({
  id: null,
  type: 'expense',
  category: '',
  account: 'yeb',
  date: '',
  amount: 0,
  note: '',
})

const brandOptions = ['Hotwheels', 'MINIGT', 'Tomica', 'TLV', 'Kyosho', '其它']

const accountEntries = computed(() => Object.entries(store.paytonAccounts || {}))
const accountOptions = computed(() => accountEntries.value.map(([k, v]) => ({ key: k, name: v?.name || k })))

const stats = computed(() =>
  getPaytonStats(store.paytonAccounts, store.paytonRecords, store.paytonInventory),
)

const sortedRecords = computed(() =>
  [...store.paytonRecords].sort((a, b) => String(b.date || '').localeCompare(String(a.date || ''))),
)

const groupedRecordsByMonth = computed(() => {
  const map = new Map()
  sortedRecords.value.forEach((r) => {
    const month = String(r.date || '').slice(0, 7) || '未记录月份'
    if (!map.has(month)) {
      map.set(month, { month, income: 0, expense: 0, records: [] })
    }
    const g = map.get(month)
    g.records.push(r)
    if (r.type === 'income') g.income += Number(r.amount || 0)
    if (r.type === 'expense') g.expense += Number(r.amount || 0)
  })
  return Array.from(map.values())
})

const sortedPaytonInventory = computed(() =>
  [...store.paytonInventory].sort((a, b) => String(a.brand || '').localeCompare(String(b.brand || ''))),
)

const sellInventoryList = computed(() =>
  sortedPaytonInventory.value.filter((c) => String(c?.pool || 'sell') === 'sell'),
)

const keepInventoryList = computed(() =>
  sortedPaytonInventory.value.filter((c) => String(c?.pool || 'sell') === 'keep'),
)

function toggleMonthGroup(month) {
  collapsedMonthGroups[month] = !collapsedMonthGroups[month]
}

function fmtMoney(v) {
  return Number(v || 0).toFixed(2)
}

function openAddCar() {
  addCarForm.name = ''
  addCarForm.brand = 'Hotwheels'
  addCarForm.qty = 1
  addCarForm.avgPrice = 0
  showAddCarNameDropdown.value = false
  showAddCarModal.value = true
}

function submitAddCar() {
  addPaytonCar({
    name: addCarForm.name,
    brand: addCarForm.brand,
    qty: Number(addCarForm.qty || 0),
    avgPrice: Number(addCarForm.avgPrice || 0),
  })
  showAddCarModal.value = false
}

function openEditCar(car) {
  editCarForm.id = car.id
  editCarForm.name = car.name
  editCarForm.brand = car.brand
  editCarForm.qty = Number(car.qty || 0)
  editCarForm.avgPrice = Number(car.avgPrice || 0)
  editCarForm.keepQty = 1
  editCarForm.keepUnitPrice = Number(car.avgPrice || 0)
  showEditCarNameDropdown.value = false
  showEditCarModal.value = true
}

function submitEditCar() {
  const car = store.paytonInventory.find((x) => x.id === editCarForm.id)
  if (!car) return
  car.name = editCarForm.name
  car.brand = editCarForm.brand
  car.qty = Number(editCarForm.qty || 0)
  car.avgPrice = Number(editCarForm.avgPrice || 0)
  car.totalCost = Number(car.qty) * Number(car.avgPrice)
  saveToLocalStorage()
  showEditCarModal.value = false
}

function removeCar(carId) {
  const idx = store.paytonInventory.findIndex((x) => x.id === carId)
  if (idx < 0) return
  store.paytonInventory.splice(idx, 1)
  saveToLocalStorage()
}

function openSellCar(car) {
  sellCarForm.carId = car.id
  sellCarForm.qty = 1
  sellCarForm.sellPrice = Number(car.avgPrice || 0)
  sellCarForm.date = new Date().toISOString().slice(0, 10)
  sellCarForm.account = accountOptions.value[0]?.key || 'yeb'
  showSellCarModal.value = true
}

function submitSellCar() {
  sellPaytonCar(sellCarForm.carId, {
    qty: Number(sellCarForm.qty || 0),
    sellPrice: Number(sellCarForm.sellPrice || 0),
    date: sellCarForm.date,
    account: sellCarForm.account,
  })
  showSellCarModal.value = false
}

function openAddRecord() {
  addRecordForm.type = 'expense'
  addRecordForm.category = '买小车'
  addRecordForm.account = accountOptions.value[0]?.key || 'yeb'
  addRecordForm.date = new Date().toISOString().slice(0, 10)
  addRecordForm.amount = 0
  addRecordForm.note = ''
  addRecordForm.carName = ''
  addRecordForm.carQty = 1
  addRecordForm.carBrand = 'Hotwheels'
  showAddRecordModal.value = true
}

function submitAddRecord() {
  const isBuyCar = addRecordForm.type === 'expense' && addRecordForm.category === '买小车'
  let noteContent = addRecordForm.note || ''
  
  if (isBuyCar) {
    const qty = Number(addRecordForm.carQty || 0)
    const amount = Number(addRecordForm.amount || 0)
    if (!addRecordForm.carName?.trim()) return alert('请填写小车名称')
    if (qty <= 0) return alert('小车数量需大于0')
    addPaytonCarByPurchase({
      name: addRecordForm.carName,
      brand: addRecordForm.carBrand,
      qty,
      avgPrice: qty > 0 ? amount / qty : 0,
    })
    noteContent = `[买小车] ${addRecordForm.carName} x${qty}`
  }

  addPaytonRecord({
    type: addRecordForm.type,
    category: addRecordForm.category,
    account: addRecordForm.account,
    date: addRecordForm.date,
    amount: Number(addRecordForm.amount || 0),
    note: noteContent,
  })
  showAddRecordModal.value = false
}

function submitMoveToKeepFromEdit() {
  const qty = Number(editCarForm.keepQty || 0)
  const keepUnitPrice = Number(editCarForm.keepUnitPrice || 0)
  const keepTotalCost = keepUnitPrice * qty
  if (!editCarForm.id || qty <= 0) return alert('请输入正确的自留数量')
  if (keepUnitPrice <= 0) return alert('请输入正确的自留单价')
  if (!movePaytonCarToKeep(editCarForm.id, qty, keepTotalCost)) return alert('自留失败，请检查数量或自留价格')
  showEditCarModal.value = false
}

function promptMoveToSell(car) {
  const raw = window.prompt(`请输入移出库数量（1-${Number(car?.qty || 0)}）`, '1')
  if (raw === null) return
  const qty = Number(raw)
  if (!Number.isFinite(qty) || qty <= 0) return alert('请输入正确数量')
  if (!movePaytonCarToSell(car.id, qty)) return alert('移出库失败，请检查数量')
}

function toggleInventoryGroup(key) {
  collapsedInventoryGroups[key] = !collapsedInventoryGroups[key]
}

function openEditRecord(record) {
  editRecordForm.id = record.id
  editRecordForm.type = record.type
  editRecordForm.category = record.category
  editRecordForm.account = record.account
  editRecordForm.date = record.date
  editRecordForm.amount = Number(record.amount || 0)
  editRecordForm.note = record.note || ''
  showEditRecordModal.value = true
}

function submitEditRecord() {
  editPaytonRecord(editRecordForm.id, {
    type: editRecordForm.type,
    category: editRecordForm.category,
    account: editRecordForm.account,
    date: editRecordForm.date,
    amount: Number(editRecordForm.amount || 0),
    note: editRecordForm.note,
  })
  showEditRecordModal.value = false
}

onMounted(() => {
  try {
    const modeRaw = localStorage.getItem(paytonViewModeStorageKey)
    if (modeRaw && ['record', 'inventory'].includes(modeRaw)) {
      paytonViewMode.value = modeRaw
    }
    const collapsedRaw = localStorage.getItem(paytonMonthCollapseStorageKey)
    if (collapsedRaw) Object.assign(collapsedMonthGroups, JSON.parse(collapsedRaw))

    const inventoryCollapsedRaw = localStorage.getItem(paytonInventoryCollapseStorageKey)
    if (inventoryCollapsedRaw) Object.assign(collapsedInventoryGroups, JSON.parse(inventoryCollapsedRaw))
  } catch (_) {
    // ignore
  }
})

watch(paytonViewMode, (val) => {
  localStorage.setItem(paytonViewModeStorageKey, val)
})

watch(
  collapsedMonthGroups,
  (val) => {
    localStorage.setItem(paytonMonthCollapseStorageKey, JSON.stringify(val))
  },
  { deep: true },
)

watch(
  collapsedInventoryGroups,
  (val) => {
    localStorage.setItem(paytonInventoryCollapseStorageKey, JSON.stringify(val))
  },
  { deep: true },
)
</script>

<template>
  <div class="space-y-6">
    <!-- 页面标题 -->
    <div class="mb-6 flex justify-between items-end">
      <div class="flex items-baseline gap-3">
        <h2 class="text-3xl font-extrabold">Payton's基金</h2>
        <span class="text-base text-gray-400 font-light">Payton's Fund</span>
      </div>
      <div class="flex gap-2">
        <button class="btn btn-primary btn-sm" @click="openAddRecord">
          <i class="fa-solid fa-plus" /> 记一笔
        </button>
        <button class="btn btn-success btn-sm" @click="openAddCar">
          <i class="fa-solid fa-car" /> 手动添加
        </button>
      </div>
    </div>

    <!-- 统计卡片 -->
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div class="bg-gray-50 p-4 rounded-xl border-l-4 border-blue-500">
        <div class="text-xs text-gray-500 mb-1">账户总余额</div>
        <div class="text-3xl font-bold text-gray-800">{{ fmtMoney(stats.totalAccountBalance) }}</div>
        <div class="text-xs text-gray-400 mt-1">
          <template v-for="([key, acc], idx) in accountEntries" :key="key">
            <span v-if="idx > 0"> | </span>{{ acc?.name || key }}: {{ fmtMoney(acc?.balance) }}
          </template>
        </div>
      </div>
      <div class="bg-gray-50 p-4 rounded-xl border-l-4 border-green-500">
        <div class="text-xs text-gray-500 mb-1">库存总价值</div>
        <div class="text-3xl font-bold text-gray-800">{{ fmtMoney(stats.inventoryValue) }}</div>
        <div class="text-xs text-gray-400 mt-1">共 {{ stats.totalModels }} 个车型，共 {{ stats.totalCars }} 辆车</div>
      </div>
    </div>

    <!-- 功能切换 -->
    <div class="apple-card p-2">
      <div class="flex gap-2">
        <button
          class="flex-1 py-2 px-4 rounded-lg font-medium transition"
          :class="paytonViewMode === 'record' ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'"
          @click="paytonViewMode = 'record'"
        >资金流水</button>
        <button
          class="flex-1 py-2 px-4 rounded-lg font-medium transition"
          :class="paytonViewMode === 'inventory' ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'"
          @click="paytonViewMode = 'inventory'"
        >投资和转卖小车库存</button>
      </div>
    </div>

    <!-- 资金流水 -->
    <div v-if="paytonViewMode === 'record'" class="space-y-4">
      <div v-for="group in groupedRecordsByMonth" :key="group.month" class="apple-card overflow-hidden p-0">
        <div class="p-3 bg-gray-100 flex justify-between items-center">
          <span class="font-bold">{{ group.month }}</span>
          <span class="text-sm">
            <span class="text-green-600">收: {{ fmtMoney(group.income) }}</span>
            <span class="mx-2">|</span>
            <span class="text-red-600">支: {{ fmtMoney(group.expense) }}</span>
          </span>
        </div>
        <table class="w-full text-sm">
          <tbody>
            <tr v-for="r in group.records" :key="r.id" class="border-t">
              <td class="p-3">{{ String(r.date || '').substring(8) }}</td>
              <td class="p-3">
                <span :class="r.type === 'income' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'" class="px-2 py-1 rounded">
                  {{ r.type === 'income' ? '收入' : '支出' }}
                </span>
              </td>
              <td class="p-3 text-gray-600">{{ r.note || '-' }}</td>
              <td class="p-3">{{ store.paytonAccounts[r.account]?.name }}</td>
              <td class="p-3 text-right font-bold" :class="r.type === 'income' ? 'text-green-600' : 'text-red-600'">
                {{ r.type === 'income' ? '+' : '-' }}{{ fmtMoney(r.amount) }}
              </td>
              <td class="p-3 text-center space-x-2">
                <button class="text-blue-500 hover:text-blue-700" @click="openEditRecord(r)">编辑</button>
                <button class="text-red-500 hover:text-red-700" @click="deletePaytonRecord(r.id)">删除</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-if="groupedRecordsByMonth.length === 0" class="apple-card text-center text-gray-400 py-8">暂无记录</div>
    </div>

    <!-- 投资和转卖小车库存 -->
    <div v-if="paytonViewMode === 'inventory'" class="apple-card overflow-hidden p-0">
      <div class="p-4 border-b bg-gray-50">共 {{ stats.totalModels }} 个车型，共 {{ stats.totalCars }} 辆车</div>

      <div class="border-b border-gray-100">
        <div class="group-header-row flex items-center px-4 py-3 cursor-pointer" @click="toggleInventoryGroup('sell')">
          <span class="cursor-pointer mr-2"><i :class="collapsedInventoryGroups.sell ? 'fa-solid fa-chevron-right' : 'fa-solid fa-chevron-down'" /></span>
          <span class="font-semibold">出售库</span>
          <span class="ml-2 text-gray-500 font-normal">共 {{ stats.sellStats.models }} 个车型，{{ stats.sellStats.cars }} 辆</span>
          <span class="ml-4 text-primary font-normal">总成本: {{ fmtMoney(stats.sellStats.value) }}</span>
        </div>
        <div v-show="collapsedInventoryGroups.sell !== true">
          <table class="w-full text-sm">
            <thead>
              <tr>
                <th class="p-3 text-left">品牌</th>
                <th class="p-3 text-left">车型</th>
                <th class="p-3 text-right">数量</th>
                <th class="p-3 text-right">均价</th>
                <th class="p-3 text-right">总成本</th>
                <th class="p-3 text-center">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="c in sellInventoryList" :key="c.id" class="border-t">
                <td class="p-3">{{ c.brand || '-' }}</td>
                <td class="p-3 font-medium">{{ c.name }}</td>
                <td class="p-3 text-right">{{ c.qty }}</td>
                <td class="p-3 text-right">{{ fmtMoney(c.avgPrice) }}</td>
                <td class="p-3 text-right font-bold text-blue-600">{{ fmtMoney(c.totalCost) }}</td>
                <td class="p-3 text-center space-x-2">
                  <button class="text-green-600 hover:text-green-800" @click="openSellCar(c)">售出</button>
                  <button class="text-yellow-500 hover:text-yellow-700" @click="openEditCar(c)">编辑</button>
                  <button class="text-red-500 hover:text-red-700" @click="removeCar(c.id)">删除</button>
                </td>
              </tr>
              <tr v-if="sellInventoryList.length === 0">
                <td colspan="6" class="p-8 text-center text-gray-400">出售库暂无库存</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <div class="group-header-row flex items-center px-4 py-3 cursor-pointer" @click="toggleInventoryGroup('keep')">
          <span class="cursor-pointer mr-2"><i :class="collapsedInventoryGroups.keep ? 'fa-solid fa-chevron-right' : 'fa-solid fa-chevron-down'" /></span>
          <span class="font-semibold">自留库</span>
          <span class="ml-2 text-gray-500 font-normal">共 {{ stats.keepStats.models }} 个车型，{{ stats.keepStats.cars }} 辆</span>
          <span class="ml-4 text-primary font-normal">总成本: {{ fmtMoney(stats.keepStats.value) }}</span>
        </div>
        <div v-show="collapsedInventoryGroups.keep !== true">
          <table class="w-full text-sm">
            <thead>
              <tr>
                <th class="p-3 text-left">品牌</th>
                <th class="p-3 text-left">车型</th>
                <th class="p-3 text-right">数量</th>
                <th class="p-3 text-right">均价</th>
                <th class="p-3 text-right">总成本</th>
                <th class="p-3 text-center">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="c in keepInventoryList" :key="c.id" class="border-t">
                <td class="p-3">{{ c.brand || '-' }}</td>
                <td class="p-3 font-medium">{{ c.name }}</td>
                <td class="p-3 text-right">{{ c.qty }}</td>
                <td class="p-3 text-right">{{ fmtMoney(c.avgPrice) }}</td>
                <td class="p-3 text-right font-bold text-blue-600">{{ fmtMoney(c.totalCost) }}</td>
                <td class="p-3 text-center space-x-2">
                  <button class="text-blue-600 hover:text-blue-800" @click="promptMoveToSell(c)">移出库</button>
                </td>
              </tr>
              <tr v-if="keepInventoryList.length === 0">
                <td colspan="6" class="p-8 text-center text-gray-400">自留库暂无库存</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- 记一笔弹窗 -->
    <div v-if="showAddRecordModal" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 glass-modal">
      <div class="apple-card w-full max-w-md relative">
        <button class="absolute top-4 right-4 text-gray-400 hover:text-gray-800" @click="showAddRecordModal = false">
          <i class="fa-solid fa-xmark text-xl" />
        </button>
        <h3 class="text-xl font-bold mb-6">记一笔</h3>
        <div class="space-y-4">
          <div>
            <label class="block text-sm mb-1 text-gray-600">类型</label>
            <div class="flex gap-2">
              <button @click="addRecordForm.type = 'expense'" :class="['flex-1 py-2 rounded-lg border', addRecordForm.type === 'expense' ? 'bg-red-500 text-white border-red-500' : 'border-gray-300']">支出</button>
              <button @click="addRecordForm.type = 'income'" :class="['flex-1 py-2 rounded-lg border', addRecordForm.type === 'income' ? 'bg-green-500 text-white border-green-500' : 'border-gray-300']">收入</button>
            </div>
          </div>
          <div>
            <label class="block text-sm mb-1 text-gray-600">类别</label>
            <select v-model="addRecordForm.category" class="apple-select">
              <template v-if="addRecordForm.type === 'expense'">
                <option value="买小车">买小车</option>
                <option value="生活日常">生活日常</option>
                <option value="其它">其它</option>
              </template>
              <template v-else>
                <option value="零花钱">零花钱</option>
                <option value="卖小车">卖小车</option>
                <option value="其它">其它</option>
              </template>
            </select>
          </div>
          <div>
            <label class="block text-sm mb-1 text-gray-600">账户</label>
            <select v-model="addRecordForm.account" class="apple-select">
              <option v-for="a in accountOptions" :key="a.key" :value="a.key">{{ a.name }}</option>
            </select>
          </div>
          <div>
            <label class="block text-sm mb-1 text-gray-600">日期</label>
            <input type="date" v-model="addRecordForm.date" class="apple-input" />
          </div>
          <div>
            <label class="block text-sm mb-1 text-gray-600">金额</label>
            <input type="number" v-model.number="addRecordForm.amount" placeholder="0.00" class="apple-input" />
          </div>
          <div v-if="addRecordForm.category === '买小车'" class="bg-blue-50 p-3 rounded-lg">
            <div class="text-sm font-medium text-blue-700 mb-2">车辆信息</div>
            <div>
              <label class="text-xs">小车名称</label>
              <div class="relative mt-1">
                <input
                  type="text"
                  v-model="addRecordForm.carName"
                  ref="carNameInputRef"
                  class="apple-input"
                  placeholder="如：GTR R34"
                  @focus="handleCarNameFocus"
                  @blur="handleCarNameBlur"
                />
                <div
                  v-if="showCarNameDropdown && carNameSuggestions.length"
                  class="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-auto"
                >
                  <button
                    v-for="car in carNameSuggestions"
                    :key="car.id"
                    class="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 focus:bg-blue-100"
                    @mousedown.prevent
                    @click.prevent="selectCarSuggestion(car)"
                  >
                    <div class="font-medium whitespace-nowrap overflow-hidden text-ellipsis">{{ car.name }}</div>
                    <div class="text-xs text-gray-500">品牌: {{ car.brand || '未设置' }} | 库存: {{ car.qty }}</div>
                  </button>
                </div>
              </div>
            </div>
            <div class="grid grid-cols-2 gap-2 mt-2">
              <div>
                <label class="text-xs">数量</label>
                <input type="number" v-model.number="addRecordForm.carQty" class="apple-input mt-1" />
              </div>
              <div>
                <label class="text-xs">品牌</label>
                <select v-model="addRecordForm.carBrand" class="apple-input mt-1">
                  <option v-for="b in brandOptions" :key="b">{{ b }}</option>
                </select>
              </div>
            </div>
          </div>
          <div v-if="addRecordForm.category !== '买小车'">
            <label class="block text-sm mb-1 text-gray-600">备注</label>
            <input type="text" v-model="addRecordForm.note" class="apple-input" />
          </div>
        </div>
        <div class="mt-6 flex justify-end gap-3">
          <button class="btn btn-outline" @click="showAddRecordModal = false">取消</button>
          <button class="btn btn-primary" @click="submitAddRecord">确认</button>
        </div>
      </div>
    </div>

    <!-- 手动添加小车弹窗 -->
    <div v-if="showAddCarModal" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 glass-modal">
      <div class="apple-card w-full max-w-md relative">
        <button class="absolute top-4 right-4 text-gray-400 hover:text-gray-800" @click="showAddCarModal = false">
          <i class="fa-solid fa-xmark text-xl" />
        </button>
        <h3 class="text-xl font-bold mb-6">手动添加小车（不扣余额）</h3>
        <div class="space-y-4">
          <div>
            <label class="block text-sm mb-1 text-gray-600">品牌</label>
            <select v-model="addCarForm.brand" class="apple-select">
              <option v-for="b in brandOptions" :key="b">{{ b }}</option>
            </select>
          </div>
          <div>
            <label class="block text-sm mb-1 text-gray-600">车辆名称</label>
            <div class="relative">
              <input
                type="text"
                v-model="addCarForm.name"
                class="apple-input"
                @focus="handleAddCarNameFocus"
                @blur="handleAddCarNameBlur"
              />
              <div
                v-if="showAddCarNameDropdown && addCarNameSuggestions.length"
                class="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-auto"
              >
                <button
                  v-for="car in addCarNameSuggestions"
                  :key="`${car.id}-add`"
                  class="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 focus:bg-blue-100"
                  @mousedown.prevent
                  @click.prevent="selectAddCarSuggestion(car)"
                >
                  <div class="font-medium whitespace-nowrap overflow-hidden text-ellipsis">{{ car.name }}</div>
                  <div class="text-xs text-gray-500">品牌: {{ car.brand || '未设置' }} | 库存: {{ car.qty }}</div>
                </button>
              </div>
            </div>
          </div>
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm mb-1 text-gray-600">数量</label>
              <input type="number" v-model.number="addCarForm.qty" class="apple-input" />
            </div>
            <div>
              <label class="block text-sm mb-1 text-gray-600">均价</label>
              <input type="number" v-model.number="addCarForm.avgPrice" class="apple-input" />
            </div>
          </div>
        </div>
        <div class="mt-6 flex justify-end gap-3">
          <button class="btn btn-outline" @click="showAddCarModal = false">取消</button>
          <button class="btn btn-teal" @click="submitAddCar">确认</button>
        </div>
      </div>
    </div>

    <!-- 编辑库存弹窗 -->
    <div v-if="showEditCarModal" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 glass-modal">
      <div class="apple-card w-full max-w-md relative">
        <button class="absolute top-4 right-4 text-gray-400 hover:text-gray-800" @click="showEditCarModal = false">
          <i class="fa-solid fa-xmark text-xl" />
        </button>
        <h3 class="text-xl font-bold mb-6">编辑库存</h3>
        <div class="space-y-4">
          <div>
            <label class="block text-sm mb-1 text-gray-600">品牌</label>
            <select v-model="editCarForm.brand" class="apple-select">
              <option v-for="b in brandOptions" :key="b">{{ b }}</option>
            </select>
          </div>
          <div>
            <label class="block text-sm mb-1 text-gray-600">车辆名称</label>
            <div class="relative">
              <input
                type="text"
                v-model="editCarForm.name"
                class="apple-input"
                @focus="handleEditCarNameFocus"
                @blur="handleEditCarNameBlur"
              />
              <div
                v-if="showEditCarNameDropdown && editCarNameSuggestions.length"
                class="absolute z-20 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-auto"
              >
                <button
                  v-for="car in editCarNameSuggestions"
                  :key="`${car.id}-edit`"
                  class="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 focus:bg-blue-100"
                  @mousedown.prevent
                  @click.prevent="selectEditCarSuggestion(car)"
                >
                  <div class="font-medium whitespace-nowrap overflow-hidden text-ellipsis">{{ car.name }}</div>
                  <div class="text-xs text-gray-500">品牌: {{ car.brand || '未设置' }} | 库存: {{ car.qty }}</div>
                </button>
              </div>
            </div>
          </div>
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm mb-1 text-gray-600">数量</label>
              <input type="number" v-model.number="editCarForm.qty" class="apple-input" />
            </div>
            <div>
              <label class="block text-sm mb-1 text-gray-600">均价</label>
              <input type="number" v-model.number="editCarForm.avgPrice" class="apple-input" />
            </div>
          </div>
          <div class="border-t pt-3" v-if="(store.paytonInventory.find(x => x.id === editCarForm.id)?.pool || 'sell') === 'sell'">
            <div class="text-sm text-gray-600 mb-2">转入自留库</div>
            <div class="grid grid-cols-2 gap-2 mb-2">
              <input type="number" min="1" :max="editCarForm.qty" v-model.number="editCarForm.keepQty" class="apple-input w-40" placeholder="自留数量" />
              <input type="number" min="0" v-model.number="editCarForm.keepUnitPrice" class="apple-input" placeholder="自留单价" />
            </div>
            <div class="flex items-center gap-2">
              <button class="btn btn-outline btn-sm" @click="submitMoveToKeepFromEdit">确认自留</button>
            </div>
          </div>
        </div>
        <div class="mt-6 flex justify-end gap-3">
          <button class="btn btn-outline" @click="showEditCarModal = false">取消</button>
          <button class="btn btn-warning" @click="submitEditCar">保存</button>
        </div>
      </div>
    </div>

    <!-- 卖出小车弹窗 -->
    <div v-if="showSellCarModal" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 glass-modal">
      <div class="apple-card w-full max-w-md relative">
        <button class="absolute top-4 right-4 text-gray-400 hover:text-gray-800" @click="showSellCarModal = false">
          <i class="fa-solid fa-xmark text-xl" />
        </button>
        <h3 class="text-xl font-bold mb-6">卖出小车</h3>
        <div class="space-y-4">
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm mb-1 text-gray-600">卖出数量</label>
              <input type="number" v-model.number="sellCarForm.qty" class="apple-input" />
            </div>
            <div>
              <label class="block text-sm mb-1 text-gray-600">卖出单价</label>
              <input type="number" v-model.number="sellCarForm.sellPrice" class="apple-input" />
            </div>
          </div>
          <div>
            <label class="block text-sm mb-1 text-gray-600">日期</label>
            <input type="date" v-model="sellCarForm.date" class="apple-input" />
          </div>
          <div>
            <label class="block text-sm mb-1 text-gray-600">账户</label>
            <select v-model="sellCarForm.account" class="apple-select">
              <option v-for="a in accountOptions" :key="a.key" :value="a.key">{{ a.name }}</option>
            </select>
          </div>
        </div>
        <div class="mt-6 flex justify-end gap-3">
          <button class="btn btn-outline" @click="showSellCarModal = false">取消</button>
          <button class="btn btn-success" @click="submitSellCar">确认卖出</button>
        </div>
      </div>
    </div>

    <!-- 编辑记录弹窗 -->
    <div v-if="showEditRecordModal" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 glass-modal">
      <div class="apple-card w-full max-w-md relative">
        <button class="absolute top-4 right-4 text-gray-400 hover:text-gray-800" @click="showEditRecordModal = false">
          <i class="fa-solid fa-xmark text-xl" />
        </button>
        <h3 class="text-xl font-bold mb-6">编辑记录</h3>
        <div class="space-y-4">
          <div>
            <label class="block text-sm mb-1 text-gray-600">类型</label>
            <div class="flex gap-2">
              <button @click="editRecordForm.type = 'expense'" :class="['flex-1 py-2 rounded-lg border', editRecordForm.type === 'expense' ? 'bg-red-500 text-white border-red-500' : 'border-gray-300']">支出</button>
              <button @click="editRecordForm.type = 'income'" :class="['flex-1 py-2 rounded-lg border', editRecordForm.type === 'income' ? 'bg-green-500 text-white border-green-500' : 'border-gray-300']">收入</button>
            </div>
          </div>
          <div>
            <label class="block text-sm mb-1 text-gray-600">类别</label>
            <select v-model="editRecordForm.category" class="apple-select">
              <template v-if="editRecordForm.type === 'expense'">
                <option value="买小车">买小车</option>
                <option value="生活日常">生活日常</option>
                <option value="其它">其它</option>
              </template>
              <template v-else>
                <option value="零花钱">零花钱</option>
                <option value="卖小车">卖小车</option>
                <option value="其它">其它</option>
              </template>
            </select>
          </div>
          <div>
            <label class="block text-sm mb-1 text-gray-600">账户</label>
            <select v-model="editRecordForm.account" class="apple-select">
              <option v-for="a in accountOptions" :key="a.key" :value="a.key">{{ a.name }}</option>
            </select>
          </div>
          <div>
            <label class="block text-sm mb-1 text-gray-600">日期</label>
            <input type="date" v-model="editRecordForm.date" class="apple-input" />
          </div>
          <div>
            <label class="block text-sm mb-1 text-gray-600">金额</label>
            <input type="number" v-model.number="editRecordForm.amount" placeholder="0.00" class="apple-input" />
          </div>
          <div>
            <label class="block text-sm mb-1 text-gray-600">备注</label>
            <input type="text" v-model="editRecordForm.note" class="apple-input" />
          </div>
        </div>
        <div class="mt-6 flex justify-end gap-3">
          <button class="btn btn-outline" @click="showEditRecordModal = false">取消</button>
          <button class="btn btn-primary" @click="submitEditRecord">保存</button>
        </div>
      </div>
    </div>
  </div>
</template>
