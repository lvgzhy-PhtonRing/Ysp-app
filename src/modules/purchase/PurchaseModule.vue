<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import {
  addPurchaseItem,
  batchMoveToInventory,
  deletePurchaseItem,
  moveToInventory,
  submitTransfer,
  generatePurchaseGroupMetadata,
} from './usePurchase'
import { calcItemCost, calcPreTransferCost, calcTransferCost } from '../../utils/calc'
import { addOperationLog, saveToLocalStorage, state as store } from '../../data/store'

const BRANDS = ['Hotwheels', 'MINIGT', 'Tomica', 'TLV', 'Kyosho', '其它']
const PURCHASE_TABS = ['日淘', '美淘', '国内']
const CATEGORY_BATCHES = {
  美淘: ['26下半年', '26上半年', 'B组下半年', 'B组上半年', 'A组下半年', 'A组上半年', '美淘现货'],
  日淘: ['26h批', '26g批', '26f批', '26e批', '预订', 'd批', 'c批', 'b批', 'a批'],
  国内: ['MINIGT预定', 'Hotwheels预定', '国内现货', '代理预定', '苏州GTSHOW'],
  '2025JAPAN': ['2025JAPAN'],
}

const collapsedGroups = reactive({})
const expandedTransfers = reactive({})
const selectedItemIds = ref([])
const purchaseViewCategory = ref('日淘')
const transferCategoryBatch = ref('')
const purchaseCollapseStorageKey = 'ysp_ui_purchase_collapse'
const purchaseTransferExpandStorageKey = 'ysp_ui_purchase_transfer_expand'

const showAddModal = ref(false)
const showTransferModal = ref(false)
const showEditModal = ref(false)
const showEditGroupModal = ref(false)
const showTransferListModal = ref(false)
const showEditTransferModal = ref(false)
const isSubmittingAdd = ref(false)
const isSubmittingTransfer = ref(false)
const isSubmittingEditTransfer = ref(false)
const isSubmittingEditGroup = ref(false)
const transferListCategory = ref('日淘')
const transferGroupExpanded = reactive({ 日淘: false, 美淘: false })

const editTransferForm = reactive({
  transferId: '',
  date: '',
  totalRMB: 0,
  paymentAccount: '支付宝',
  itemIds: [],
})

const editForm = reactive({
  id: null,
  name: '',
  brand: '其它',
  cost: 0,
})

const editGroupForm = reactive({
  groupKey: '',
  groupScope: '',
  purchaseGroupId: '',
  paymentBatch: '',
  category: '日淘',
  batch: '',
  date: '',
  paymentAccount: '支付宝',
  discount: '',
  website: '',
  websiteAccount: '',
  totalRMB: 0,
  items: [],
})

const editGroupItemsBySid = reactive([])
let editGroupTempLineSeed = 0

function getNextEditGroupTempKey() {
  editGroupTempLineSeed += 1
  return `temp-${Date.now()}-${editGroupTempLineSeed}`
}

const isDomesticEditGroup = computed(() => editGroupForm.category === '国内')
const editGroupPriceUnit = computed(() => {
  if (editGroupForm.category === '日淘') return 'JPY'
  if (editGroupForm.category === '美淘') return 'USD'
  return 'RMB'
})
const editGroupCalculatedTotalRMB = computed(() => {
  if (isDomesticEditGroup.value) {
    return (editGroupForm.items || []).reduce((sum, line) => sum + Number(line.originalPrice || 0), 0)
  }
  return Number(editGroupForm.totalRMB || 0)
})

function createGroupedLine(items) {
  const representative = items[0]
  const { brand, name, originalPrice, domesticShipping, fee, transferCoefficient, transferStatus } = representative
  return {
    sid: representative.sid,
    brand,
    name,
    originalPrice,
    domesticShipping,
    fee,
    transferCoefficient,
    transferStatus,
    qty: items.length,
    items,
    id: representative.id || representative.sid || getNextEditGroupTempKey(),
  }
}

function getPurchaseGroupKey(item) {
  const purchaseGroupId = String(item?.purchaseDetails?.purchaseGroupId || '').trim()
  const paymentBatch = String(item?.purchaseDetails?.paymentBatch || '').trim()
  if (purchaseGroupId && paymentBatch) return `${purchaseGroupId}__${paymentBatch}`
  if (purchaseGroupId) return purchaseGroupId
  return `${item?.purchaseDetails?.date || ''}__${item?.purchaseDetails?.website || ''}__${paymentBatch}`
}

function isInEditingPurchaseGroup(item) {
  const groupScope = String(editGroupForm.groupScope || '').trim()
  if (groupScope) return getPurchaseGroupKey(item) === groupScope

  const groupId = String(editGroupForm.purchaseGroupId || '').trim()
  const key = getPurchaseGroupKey(item)
  if (groupId) return key === groupId
  return key === String(editGroupForm.groupKey || '')
}

const addForm = reactive({
  category: '日淘',
  batch: '预订',
  date: new Date().toISOString().slice(0, 10),
  paymentAccount: '支付宝',
  discount: '',
  website: '',
  websiteAccount: '',
  totalRMB: 0,
  items: [],
})

const transferForm = reactive({
  transferBatch: '',
  date: new Date().toISOString().slice(0, 10),
  paymentAccount: '支付宝',
  totalRMB: 0,
})

const purchaseItems = computed(() => store.items.filter((i) => i?.status === 'purchase'))

const hasPurchaseItems = computed(() => purchaseItems.value.length > 0)

const purchaseCategoryStats = computed(() => {
  const categories = PURCHASE_TABS
  const map = {}
  categories.forEach((c) => {
    const categoryItems = purchaseItems.value.filter((i) => i?.category === c)
    map[c] = {
      count: categoryItems.length,
      amount: categoryItems.reduce((s, i) => s + Number(i?.cost || 0), 0),
      purchase: categoryItems.reduce((s, i) => s + (Number(i?.purchaseDetails?.preTransferCost) || 0), 0),
      transfer: categoryItems.reduce((s, i) => s + (Number(i?.purchaseDetails?.transferCost) || 0), 0),
      pendingCount: categoryItems.filter(
        (i) => (i?.purchaseDetails?.transferStatus || 'pending') === 'pending',
      ).length,
    }
  })
  return map
})

const purchaseItemsInView = computed(() =>
  purchaseItems.value.filter((i) => i?.category === purchaseViewCategory.value),
)

const stats = computed(() => {
  // 旧版口径：顶部汇总按各tab(默认日淘/美淘/国内)整体汇总，而非当前tab
  const topItems = purchaseItems.value.filter((i) => PURCHASE_TABS.includes(i?.category))
  const totalCount = topItems.length
  const totalAmount = topItems.reduce((sum, i) => sum + Number(i?.cost || 0), 0)
  const pendingCount = topItems.filter(
    (i) => (i?.purchaseDetails?.transferStatus || 'pending') === 'pending',
  ).length
  const completedCount = topItems.filter(
    (i) => i?.purchaseDetails?.transferStatus === 'completed',
  ).length

  return { totalCount, totalAmount, pendingCount, completedCount }
})

function mergeItemsBySid(items = []) {
  const getSortTs = (item) => {
    const d = item?.purchaseDetails?.date
    const dateTs = d ? new Date(d).getTime() : 0
    const idTs = Number(item?.id || 0)
    const safeDateTs = Number.isFinite(dateTs) ? dateTs : 0
    const safeIdTs = Number.isFinite(idTs) ? idTs : 0
    return safeDateTs * 1_000_000 + safeIdTs
  }

  const map = new Map()
  items.forEach((item) => {
    const key = `${item?.sid || ''}`
    if (!map.has(key)) {
      map.set(key, { ...item, qty: 1, _latestTs: getSortTs(item) })
      return
    }
    const g = map.get(key)
    g.qty += 1
    g._latestTs = Math.max(Number(g._latestTs || 0), getSortTs(item))
  })
  return Array.from(map.values())
    .sort((a, b) => Number(b._latestTs || 0) - Number(a._latestTs || 0))
    .map((item) => {
      const next = { ...item }
      delete next._latestTs
      return next
    })
}

const groupedByBatch = computed(() => {
  const map = new Map()

  purchaseItemsInView.value.forEach((item) => {
    const key = `${item.category || '未分类'}__${item.batch || '未分批'}`
    if (!map.has(key)) {
      map.set(key, {
        key,
        category: item.category || '未分类',
        batch: item.batch || '未分批',
        count: 0,
        totalAmount: 0,
        purchase: 0,
        transfer: 0,
        _purchaseGroupMap: new Map(),
      })
    }
    const batchGroup = map.get(key)
    batchGroup.count += 1
    batchGroup.totalAmount += Number(item.cost || 0)
    batchGroup.purchase += Number(item.purchaseDetails?.preTransferCost || 0)
    batchGroup.transfer += Number(item.purchaseDetails?.transferCost || 0)

    const pgKey =
      item.purchaseDetails?.purchaseGroupId ||
      `${item.purchaseDetails?.date || ''}__${item.purchaseDetails?.website || ''}__${item.purchaseDetails?.paymentBatch || ''}`

    if (!batchGroup._purchaseGroupMap.has(pgKey)) {
      batchGroup._purchaseGroupMap.set(pgKey, {
        key: pgKey,
        category: item.category || '未分类',
        batch: item.batch || '未分批',
        date: item.purchaseDetails?.date || '-',
        website: item.purchaseDetails?.website || '-',
        websiteAccount: item.purchaseDetails?.websiteAccount || '-',
        discount: item.purchaseDetails?.discount || '',
        exchangeRate: Number(item.purchaseDetails?.exchangeRate || 0),
        paymentBatch: item.purchaseDetails?.paymentBatch || '-',
        totalRMB: Number(item.purchaseDetails?.totalRMB || 0),
        items: [],
      })
    }

    const pg = batchGroup._purchaseGroupMap.get(pgKey)
    pg.items.push(item)
  })

  const batchOrder = CATEGORY_BATCHES[purchaseViewCategory.value] || []
  return Array.from(map.values())
    .map((batch) => {
      const purchaseGroups = Array.from(batch._purchaseGroupMap.values())
        .map((g) => ({
          ...g,
          itemsBySid: mergeItemsBySid(g.items),
        }))
        .sort((a, b) => {
          const dateCmp = String(b.date || '').localeCompare(String(a.date || ''))
          if (dateCmp !== 0) return dateCmp

          const aLatestId = Math.max(...(a.items || []).map((it) => Number(it?.id || 0)), 0)
          const bLatestId = Math.max(...(b.items || []).map((it) => Number(it?.id || 0)), 0)
          if (bLatestId !== aLatestId) return bLatestId - aLatestId

          return String(b.key || '').localeCompare(String(a.key || ''))
        })

      return {
        ...batch,
        purchaseGroups,
      }
    })
    .sort((a, b) => {
      const oa = batchOrder.indexOf(a.batch)
      const ob = batchOrder.indexOf(b.batch)
      const x = oa >= 0 ? oa : 99
      const y = ob >= 0 ? ob : 99
      if (x !== y) return x - y
      return String(a.batch).localeCompare(String(b.batch), 'zh-CN')
    })
})

const pendingTransferItems = computed(() =>
  purchaseItems.value.filter(
    (i) =>
      i?.category === purchaseViewCategory.value &&
      (i?.purchaseDetails?.transferStatus || 'pending') === 'pending',
  ),
)

const transferBatchOptions = computed(() =>
  Array.from(
    new Set(
      pendingTransferItems.value
        .map((i) => i?.batch)
        .filter(Boolean),
    ),
  ).sort((a, b) => {
    const order = CATEGORY_BATCHES[purchaseViewCategory.value] || []
    const ia = order.indexOf(a)
    const ib = order.indexOf(b)
    if (ia !== ib) return (ia >= 0 ? ia : 99) - (ib >= 0 ? ib : 99)
    return String(a).localeCompare(String(b), 'zh-CN')
  }),
)

const filteredTransferItems = computed(() => {
  if (!transferCategoryBatch.value) return pendingTransferItems.value
  return pendingTransferItems.value.filter((i) => i?.batch === transferCategoryBatch.value)
})

const groupedTransferItemsBySid = computed(() => {
  const map = new Map()
  filteredTransferItems.value.forEach((item) => {
    const key = item.sid || String(item.id)
    if (!map.has(key)) {
      map.set(key, {
        sid: item.sid,
        name: item.name,
        category: item.category,
        batch: item.batch,
        itemIds: [],
        qty: 0,
        preTransferCost: 0,
        transferCoefficient: 0,
        selected: false,
      })
    }
    const g = map.get(key)
    g.itemIds.push(item.id)
    g.qty += 1
    g.preTransferCost += Number(item.purchaseDetails?.preTransferCost || 0)
    g.transferCoefficient += Number(item.purchaseDetails?.transferCoefficient || 1)
    if (selectedItemIds.value.includes(item.id)) g.selected = true
  })
  return Array.from(map.values())
})

const selectedTransferItemCount = computed(() => selectedItemIds.value.length)

const totalSelectedCoefficient = computed(() => {
  const selected = new Set(selectedItemIds.value)
  return filteredTransferItems.value.reduce((sum, item) => {
    if (!selected.has(item.id)) return sum
    return sum + Number(item.purchaseDetails?.transferCoefficient || 1)
  }, 0)
})

function normalizeBrand(brand) {
  return String(brand || '').trim().toLowerCase()
}

function createPurchaseLine(category = addForm.category) {
  return {
    name: '',
    brand: 'Hotwheels',
    qty: 1,
    transferCoefficient: 1,
    originalPrice: 0,
    domesticShipping: 0,
    fee: 0,
    price: 0,
  }
}

const calculatedTotalRMB = computed(() => {
  if (addForm.category !== '国内') return Number(addForm.totalRMB || 0)
  return (addForm.items || []).reduce(
    (s, it) => s + Number(it.price || 0) * Number(it.qty || 1),
    0,
  )
})

const totalItemsCount = computed(() =>
  (addForm.items || []).reduce((s, it) => s + Number(it.qty || 1), 0),
)

const calculatedRate = computed(() => {
  if (addForm.category !== '日淘' && addForm.category !== '美淘') return 0
  const foreign = (addForm.items || []).reduce(
    (s, it) =>
      s +
      (Number(it.originalPrice || 0) + Number(it.domesticShipping || 0) + Number(it.fee || 0)) *
        Number(it.qty || 1),
    0,
  )
  const total = Number(addForm.totalRMB || 0)
  return foreign > 0 ? total / foreign : 0
})

const discountsUsed = computed(() =>
  Array.from(
    new Set(
      store.items
        .map((i) => i?.purchaseDetails?.discount)
        .filter((v) => typeof v === 'string' && v.trim()),
    ),
  ),
)

const websitesUsed = computed(() =>
  Array.from(
    new Set(
      store.items
        .map((i) => i?.purchaseDetails?.website)
        .filter((v) => typeof v === 'string' && v.trim()),
    ),
  ),
)

const websiteAccountsUsed = computed(() =>
  Array.from(
    new Set(
      store.items
        .map((i) => i?.purchaseDetails?.websiteAccount)
        .filter((v) => typeof v === 'string' && v.trim()),
    ),
  ),
)

const itemNamesByBrand = computed(() => {
  const map = new Map()
  store.items.forEach((item) => {
    const name = String(item?.name || '').trim()
    const brandKey = normalizeBrand(item?.brand)
    if (!name || !brandKey) return
    if (!map.has(brandKey)) map.set(brandKey, new Set())
    map.get(brandKey).add(name)
  })
  return map
})

function getItemNamesByBrand(brand) {
  const key = normalizeBrand(brand)
  if (!key) return []
  return Array.from(itemNamesByBrand.value.get(key) || [])
}

const availableBatches = computed(() => {
  const fallback = CATEGORY_BATCHES[addForm.category] || []
  const fromData = Array.from(
    new Set(
      store.items
        .filter((i) => i?.category === addForm.category)
        .map((i) => i?.batch)
        .filter(Boolean),
    ),
  )
  return Array.from(new Set([...fallback, ...fromData]))
})

const editAvailableBatches = computed(() => {
  const fallback = CATEGORY_BATCHES[editGroupForm.category] || []
  const fromData = Array.from(
    new Set(
      store.items
        .filter((i) => i?.category === editGroupForm.category)
        .map((i) => i?.batch)
        .filter(Boolean),
    ),
  )

  // 始终保留当前值，避免历史批次在下拉中“消失”
  const current = String(editGroupForm.batch || '').trim()
  return Array.from(new Set([...fallback, ...fromData, ...(current ? [current] : [])]))
})

watch(
  () => addForm.category,
  () => {
    addForm.batch = availableBatches.value[0] || ''
    addForm.items = [createPurchaseLine(addForm.category)]
  },
)

watch(
  () => editGroupForm.category,
  () => {
    const options = editAvailableBatches.value
    const current = String(editGroupForm.batch || '')
    if (!current || !options.includes(current)) {
      editGroupForm.batch = options[0] || ''
    }
  },
)

function fmtMoney(v) {
  return Number(v || 0).toFixed(2)
}

function fmtNum(v) {
  return Number(v || 0).toFixed(2)
}

function toggleGroup(key) {
  collapsedGroups[key] = !collapsedGroups[key]
}

function expandAllPurchaseGroups() {
  groupedByBatch.value.forEach((g) => {
    collapsedGroups[g.key] = false
  })
}

function collapseAllPurchaseGroups() {
  groupedByBatch.value.forEach((g) => {
    collapsedGroups[g.key] = true
  })
}

function resetPurchaseViewState() {
  purchaseViewCategory.value = '日淘'
  transferCategoryBatch.value = ''
  Object.keys(collapsedGroups).forEach((k) => {
    delete collapsedGroups[k]
  })
  Object.keys(expandedTransfers).forEach((k) => {
    delete expandedTransfers[k]
  })
  localStorage.removeItem(purchaseCollapseStorageKey)
  localStorage.removeItem(purchaseTransferExpandStorageKey)
}

function toggleTransfer(transferId) {
  expandedTransfers[transferId] = !expandedTransfers[transferId]
}

function isSelected(id) {
  return selectedItemIds.value.includes(id)
}

function toggleSelect(id) {
  if (isSelected(id)) {
    selectedItemIds.value = selectedItemIds.value.filter((x) => x !== id)
  } else {
    selectedItemIds.value.push(id)
  }
}

function selectAllForTransfer() {
  const idSet = new Set(selectedItemIds.value)
  filteredTransferItems.value.forEach((i) => idSet.add(i.id))
  selectedItemIds.value = Array.from(idSet)
}

function deselectAllForTransfer() {
  const removeSet = new Set(filteredTransferItems.value.map((i) => i.id))
  selectedItemIds.value = selectedItemIds.value.filter((id) => !removeSet.has(id))
}

function toggleTransferSelectionBySid(group) {
  const shouldSelect = !group.selected
  if (shouldSelect) {
    const set = new Set(selectedItemIds.value)
    group.itemIds.forEach((id) => set.add(id))
    selectedItemIds.value = Array.from(set)
  } else {
    const removeSet = new Set(group.itemIds)
    selectedItemIds.value = selectedItemIds.value.filter((id) => !removeSet.has(id))
  }
}

function openAddModal() {
  addForm.category = purchaseViewCategory.value || '日淘'
  addForm.batch = availableBatches.value[0] || '预订'
  addForm.date = new Date().toISOString().slice(0, 10)
  addForm.paymentAccount = '支付宝'
  addForm.discount = ''
  addForm.website = ''
  addForm.websiteAccount = ''
  addForm.totalRMB = 0
  addForm.items = [createPurchaseLine('日淘')]
  showAddModal.value = true
}

function addPurchaseLine() {
  addForm.items.push(createPurchaseLine(addForm.category))
}

function createEditGroupLine(item) {
  return {
    id: item.id,
    sid: item?.sid || '',
    name: item.name || '',
    brand: item.brand || 'Hotwheels',
    originalPrice: Number(item?.purchaseDetails?.originalPrice || 0),
    domesticShipping: Number(item?.purchaseDetails?.domesticShipping || 0),
    fee: Number(item?.purchaseDetails?.fee || 0),
    transferCoefficient: Number(item?.purchaseDetails?.transferCoefficient || 1),
    _originalTransferCoefficient: Number(item?.purchaseDetails?.transferCoefficient || 1),
    preTransferCost: Number(item?.purchaseDetails?.preTransferCost || 0),
    transferStatus: item?.purchaseDetails?.transferStatus || 'pending',
    transferId: item?.purchaseDetails?.transferId || '',
  }
}

function addEditGroupLine() {
  editGroupForm.items.push({
    id: null,
    sid: getNextEditGroupTempKey(),
    name: '',
    brand: 'Hotwheels',
    originalPrice: 0,
    domesticShipping: 0,
    fee: 0,
    transferCoefficient: 1,
    _originalTransferCoefficient: 1,
    preTransferCost: 0,
    transferStatus: 'pending',
    transferId: '',
  })
  buildEditGroupItemsBySid()
}

function syncLineField(sourceLine, field) {
  const sid = String(sourceLine?.sid || '').trim()
  if (!sid) return
  if (!['name', 'brand', 'originalPrice', 'domesticShipping', 'fee', 'transferCoefficient'].includes(field)) return
  synchronizeSameSidLines(sourceLine, field)
  buildEditGroupItemsBySid()
}

function synchronizeSameSidLines(sourceLine, field = null, originalById = null) {
  const sid = String(sourceLine?.sid || '').trim()
  if (!sid) return
  editGroupForm.items.forEach((line) => {
    if (line === sourceLine) return
    if (String(line.sid || '').trim() !== sid) return

    if (field) {
      line[field] = sourceLine[field]
      if (['originalPrice', 'domesticShipping', 'fee'].includes(field)) {
        line.preTransferCost = sourceLine.preTransferCost
      }
      if (field === 'transferCoefficient') {
        line._originalTransferCoefficient = Number(sourceLine.transferCoefficient || 1)
      }
      return
    }

    if (!originalById || !line.id) return
    const target = originalById.get(line.id)
    if (!target) return
    applyLineToItem(sourceLine, target)
  })
}

function applyLineToItem(line, target) {
  if (!target) return
  const isDomestic = editGroupForm.category === '国内'
  const originalPrice = Number(line.originalPrice || 0)
  const domesticShipping = isDomestic ? 0 : Number(line.domesticShipping || 0)
  const fee = isDomestic ? 0 : Number(line.fee || 0)
  const transferCoefficient = isDomestic ? 1 : Number(line.transferCoefficient || 1)
  const exchangeRate = isDomestic ? 0 : Number(editGroupRate.value || 0)
  const preTransferCost =
    isDomestic
      ? originalPrice
      : calcPreTransferCost(originalPrice, exchangeRate, domesticShipping, fee)

  target.name = line.name
  target.brand = line.brand
  target.category = editGroupForm.category
  target.batch = editGroupForm.batch
  target.purchaseDetails = {
    ...(target.purchaseDetails || {}),
    date: editGroupForm.date,
    paymentAccount: editGroupForm.paymentAccount,
    discount: editGroupForm.discount,
    website: editGroupForm.website,
    websiteAccount: editGroupForm.websiteAccount,
    totalRMB: Number(editGroupCalculatedTotalRMB.value || 0),
    originalPrice,
    exchangeRate,
    domesticShipping,
    fee,
    preTransferCost,
    transferCoefficient,
  }
  target.cost = target.purchaseDetails?.transferStatus === 'completed'
    ? calcItemCost(preTransferCost, Number(target.purchaseDetails?.transferCost || 0))
    : preTransferCost
}

function buildEditGroupItemsBySid() {
  editGroupItemsBySid.length = 0
  const map = new Map()
  ;(editGroupForm.items || []).forEach((line) => {
    const sid = String(line.sid || '').trim()
    const key = sid || getNextEditGroupTempKey()
    if (!sid) line.sid = key
    if (!map.has(key)) map.set(key, [])
    map.get(key).push(line)
  })
  Array.from(map.values()).forEach((items) => {
    editGroupItemsBySid.push(createGroupedLine(items))
  })
}

function removeEditGroupSid(sid) {
  const key = String(sid || '').trim()
  if (!key) return
  editGroupForm.items = (editGroupForm.items || []).filter((line) => String(line.sid || '').trim() !== key)
  buildEditGroupItemsBySid()
}

const editGroupRate = computed(() => {
  if (editGroupForm.category !== '日淘' && editGroupForm.category !== '美淘') return 0
  const foreignTotal = (editGroupForm.items || []).reduce(
    (sum, line) => sum + Number(line.originalPrice || 0) + Number(line.domesticShipping || 0) + Number(line.fee || 0),
    0,
  )
  return foreignTotal > 0 ? Number(editGroupForm.totalRMB || 0) / foreignTotal : 0
})

watch(
  () => [editGroupForm.totalRMB, editGroupForm.category, editGroupForm.items.map((x) => `${x.originalPrice}|${x.domesticShipping}|${x.fee}`).join(',')],
  () => {
    if (editGroupForm.category !== '日淘' && editGroupForm.category !== '美淘') return
    editGroupForm.items.forEach((line) => {
      line.preTransferCost = calcPreTransferCost(
        Number(line.originalPrice || 0),
        Number(editGroupRate.value || 0),
        Number(line.domesticShipping || 0),
        Number(line.fee || 0),
      )
    })
  },
)

function submitAdd() {
  if (isSubmittingAdd.value) return
  const validItems = (addForm.items || []).filter((it) => String(it.name || '').trim())
  if (validItems.length === 0) return

  const invalidCoefficient = validItems.find(
    (line) => Number(line.transferCoefficient || 1) <= 0 || Number(line.transferCoefficient || 1) > 10,
  )
  if (invalidCoefficient) return alert('转运系数需在 0~10 之间（含10）')

  isSubmittingAdd.value = true
  try {
    const { purchaseGroupId, paymentBatch } = generatePurchaseGroupMetadata({
      category: addForm.category,
      batch: addForm.batch,
      paymentAccount: addForm.paymentAccount,
    })

    if (!purchaseGroupId || !paymentBatch) {
      return alert('购买组号或付款批次生成失败，请重试')
    }

    const conflictCount = store.items.filter((item) => {
      const gid = String(item?.purchaseDetails?.purchaseGroupId || '').trim()
      const pb = String(item?.purchaseDetails?.paymentBatch || '').trim()
      return gid === String(purchaseGroupId).trim() && pb && pb !== String(paymentBatch).trim()
    }).length
    if (conflictCount > 0) {
      return alert('检测到购买组号与付款批次冲突，请重试提交（系统将重新分配组号）')
    }

    const totalRMB = Number(
      addForm.category === '国内' ? calculatedTotalRMB.value : addForm.totalRMB || 0,
    )

    const sharedSidByProductKey = new Map()
    const createdItems = []

    validItems.forEach((line) => {
      const productKey = `${normalizeBrand(line.brand)}__${String(line.name || '').trim()}`
      let sharedSid = sharedSidByProductKey.get(productKey) || ''
      const qty = Math.max(1, Number(line.qty || 1))
      for (let i = 0; i < qty; i += 1) {
        const preTransferCost =
          addForm.category === '国内'
            ? Number(line.price || 0)
            : calcPreTransferCost(
                Number(line.originalPrice || 0),
                Number(calculatedRate.value || 0),
                Number(line.domesticShipping || 0),
                Number(line.fee || 0),
              )

        const createdItem = addPurchaseItem({
          name: line.name,
          brand: line.brand || 'Hotwheels',
          sid: sharedSid || undefined,
          category: addForm.category,
          batch: addForm.batch,
          stock: 1,
          isManual: false,
          isDefect: false,
          isLongTerm: false,
          purchaseDetails: {
            date: addForm.date,
            paymentAccount: addForm.paymentAccount,
            discount: addForm.discount,
            website: addForm.website,
            websiteAccount: addForm.websiteAccount,
            paymentBatch,
            purchaseGroupId,
            totalRMB,
            originalPrice:
              addForm.category === '国内' ? Number(line.price || 0) : Number(line.originalPrice || 0),
            exchangeRate: Number(calculatedRate.value || 0),
            domesticShipping: Number(line.domesticShipping || 0),
            fee: Number(line.fee || 0),
            preTransferCost,
            transferStatus: addForm.category === '国内' ? 'completed' : 'pending',
            transferCoefficient: Number(line.transferCoefficient || 1),
            transferCost: 0,
            transferSelected: false,
          },
        }, { skipLog: true })

        if (createdItem) createdItems.push(createdItem)

        if (!sharedSid && createdItem?.sid) {
          sharedSid = createdItem.sid
          sharedSidByProductKey.set(productKey, sharedSid)
        }
      }
    })

    const sidSummary = Array.from(
      createdItems.reduce((m, item) => {
        const sid = String(item?.sid || '').trim()
        if (!sid) return m
        if (!m.has(sid)) {
          m.set(sid, {
            sid,
            name: item?.name || '未命名商品',
            qty: 0,
          })
        }
        m.get(sid).qty += 1
        return m
      }, new Map()).values(),
    )

    addOperationLog('purchase_add', `新增购买组: ${purchaseGroupId}（${createdItems.length}件/${sidSummary.length}个SID）`, {
      purchaseGroupId,
      paymentBatch,
      category: addForm.category,
      batch: addForm.batch,
      date: addForm.date,
      totalItems: createdItems.length,
      totalSids: sidSummary.length,
      sidSummary,
    })

    saveToLocalStorage()
    showAddModal.value = false
  } finally {
    isSubmittingAdd.value = false
  }
}

function submitTransferBatch() {
  if (isSubmittingTransfer.value) return
  if (selectedItemIds.value.length === 0) return

  isSubmittingTransfer.value = true
  try {
    submitTransfer(
      {
        transferBatch: transferForm.transferBatch,
        date: transferForm.date,
        paymentAccount: transferForm.paymentAccount,
        totalRMB: Number(transferForm.totalRMB || 0),
      },
      selectedItemIds.value,
    )

    selectedItemIds.value = []
    showTransferModal.value = false
  } finally {
    isSubmittingTransfer.value = false
  }
}

function handleNewTransfer() {
  if (purchaseViewCategory.value === '国内') {
    alert('国内商品不需要转运，直接入库即可')
    return
  }
  transferForm.transferBatch = ''
  transferForm.date = new Date().toISOString().slice(0, 10)
  transferForm.paymentAccount = '支付宝'
  transferForm.totalRMB = 0
  transferCategoryBatch.value = transferBatchOptions.value[0] || ''
  selectedItemIds.value = filteredTransferItems.value.map((i) => i.id)
  showTransferModal.value = true
}

function moveSingle(itemId) {
  const item = store.items.find((x) => x.id === itemId)
  if (!item) return
  if (item.category === '国内' || item.category === '2025JAPAN') {
    const ok = confirmMoveBySid([item])
    if (!ok) return
  }
  moveToInventory(itemId)
  selectedItemIds.value = selectedItemIds.value.filter((x) => x !== itemId)
}

function moveBatch() {
  if (selectedItemIds.value.length === 0) return
  const selectedItems = store.items.filter((item) => selectedItemIds.value.includes(item.id))
  const hasDomestic = selectedItems.some((item) => item?.category === '国内' || item?.category === '2025JAPAN')
  if (hasDomestic) {
    const ok = confirmMoveBySid(selectedItems)
    if (!ok) return
  }
  batchMoveToInventory(selectedItemIds.value)
  selectedItemIds.value = []
}

function removeItem(itemId) {
  deletePurchaseItem(itemId)
  selectedItemIds.value = selectedItemIds.value.filter((x) => x !== itemId)
}

function batchMovePurchaseGroup(group) {
  const items = (group?.items || []).filter((i) => i?.status === 'purchase')
  const ids = items.map((i) => i.id)
  if (ids.length === 0) return

  if (group?.category === '国内' || group?.category === '2025JAPAN') {
    const ok = confirmMoveBySid(items)
    if (!ok) return
  }

  batchMoveToInventory(ids)
}

function confirmMoveBySid(items = []) {
  const ids = (items || []).map((i) => i.id).filter(Boolean)
  if (ids.length === 0) return false

  const sidMap = new Map()
  items.forEach((item) => {
    const key = String(item?.sid || '').trim() || `NO_SID_${item?.id}`
    if (!sidMap.has(key)) {
      sidMap.set(key, {
        sid: item?.sid || '-',
        name: item?.name || '-',
        qty: 0,
        unitCost: Number(item?.cost || 0),
      })
    }
    sidMap.get(key).qty += 1
  })

  const lines = Array.from(sidMap.values())
    .slice(0, 12)
    .map((x) => `- ${x.sid} | ${x.name} | x${x.qty} | 单品成本 ¥${fmtNum(x.unitCost)}`)
    .join('\n')
  const more = sidMap.size > 12 ? `\n... 另有 ${sidMap.size - 12} 个SID` : ''
  return confirm(`确认入库以下商品？\n${lines}${more}`)
}

function deletePurchaseGroup(group) {
  const ids = (group?.items || []).map((i) => i.id)
  if (ids.length === 0) return
  if (!confirm(`确认删除该购买组（${ids.length}件）？`)) return
  ids.forEach((id) => deletePurchaseItem(id))
}

function buildSoldItemsDetailText(items = []) {
  return items
    .slice(0, 12)
    .map((item) => {
      const d = item?.saleDetails?.date || '-'
      const p = Number(item?.saleDetails?.price || 0).toFixed(2)
      return `- ${item?.sid || '-'} | ${item?.name || '-'} | ${d} | ¥${p}`
    })
    .join('\n')
}

function openEditPurchaseGroup(group) {
  const sourceRows = (group?.items || []).filter((i) => i?.status === 'purchase')
  if (sourceRows.length === 0) return
  const first = sourceRows[0]
  const purchaseGroupId = first?.purchaseDetails?.purchaseGroupId || ''
  const paymentBatch = first?.purchaseDetails?.paymentBatch || ''
  const groupScope = getPurchaseGroupKey(first)

  const allGroupRows = store.items.filter((item) => getPurchaseGroupKey(item) === (groupScope || String(group?.key || '')))
  const soldItems = allGroupRows.filter((item) => item?.status === 'sold')
  if (soldItems.length > 0) {
    const details = buildSoldItemsDetailText(soldItems)
    const more = soldItems.length > 12 ? `\n... 另有 ${soldItems.length - 12} 件` : ''
    alert(
      `该购买组含 ${soldItems.length} 件已售出商品，当前不可编辑。\n\n请先在“销售记账”中回滚这些商品到库存，再在“库存管理”中执行同转运批次下架后再编辑：\n${details}${more}`,
    )
    return
  }

  const rows = allGroupRows.filter((item) => item?.status === 'purchase' || item?.status === 'inventory')
  if (rows.length === 0) return
  editGroupForm.groupKey = group?.key || ''
  editGroupForm.groupScope = groupScope
  editGroupForm.purchaseGroupId = purchaseGroupId
  editGroupForm.paymentBatch = paymentBatch
  editGroupForm.category = first?.category || purchaseViewCategory.value
  editGroupForm.batch = first?.batch || ''
  editGroupForm.date = first?.purchaseDetails?.date || new Date().toISOString().slice(0, 10)
  editGroupForm.paymentAccount = first?.purchaseDetails?.paymentAccount || '支付宝'
  editGroupForm.discount = first?.purchaseDetails?.discount || ''
  editGroupForm.website = first?.purchaseDetails?.website || ''
  editGroupForm.websiteAccount = first?.purchaseDetails?.websiteAccount || ''
  editGroupForm.totalRMB = Number(first?.purchaseDetails?.totalRMB || 0)
  editGroupForm.items = rows.map((item) => createEditGroupLine(item))
  buildEditGroupItemsBySid()
  showEditGroupModal.value = true
}

function submitEditPurchaseGroup() {
  if (isSubmittingEditGroup.value) return
  const lines = (editGroupForm.items || []).filter((x) => String(x.name || '').trim())
  if (lines.length === 0) return alert('请至少保留一个商品')

  if (!isDomesticEditGroup.value) {
    const invalidCoefficient = lines.find(
      (line) => Number(line.transferCoefficient || 1) <= 0 || Number(line.transferCoefficient || 1) > 10,
    )
    if (invalidCoefficient) return alert('转运系数需在 0~10 之间（含10）')
  }

  isSubmittingEditGroup.value = true
  try {
    const allGroupRows = store.items.filter((item) => isInEditingPurchaseGroup(item))
    const soldItems = allGroupRows.filter((item) => item?.status === 'sold')
    if (soldItems.length > 0) {
      const details = buildSoldItemsDetailText(soldItems)
      const more = soldItems.length > 12 ? `\n... 另有 ${soldItems.length - 12} 件` : ''
      alert(
        `该购买组含 ${soldItems.length} 件已售出商品，当前不可编辑。\n\n请先在“销售记账”中回滚这些商品到库存，再在“库存管理”中执行同转运批次下架后再编辑：\n${details}${more}`,
      )
      return
    }

    const editableRows = allGroupRows.filter(
      (item) => item?.status === 'purchase' || item?.status === 'inventory',
    )
    const paymentBatchSet = new Set(
      editableRows
        .map((item) => String(item?.purchaseDetails?.paymentBatch || '').trim())
        .filter(Boolean),
    )
    if (paymentBatchSet.size > 1) {
      return alert('该购买组存在多个付款批次，已自动阻止保存。请按付款批次拆分后再编辑。')
    }

    const purchaseRows = editableRows.filter((item) => item?.status === 'purchase')
    const originalById = new Map(editableRows.map((r) => [r.id, r]))

    let coefficientChanged = false
    lines.forEach((line) => {
      if (line.id && line._originalTransferCoefficient !== Number(line.transferCoefficient || 1)) {
        coefficientChanged = true
      }
    })
    if (coefficientChanged) {
      const hasTransferred = lines.some((line) => line.transferStatus === 'completed')
      if (hasTransferred && !confirm('你修改了转运系数，会影响已转运商品的转运费分摊，是否继续？')) {
        return
      }
    }

    const nextTransferIdSet = new Set()
    lines.forEach((line) => {
      const src = line.id ? originalById.get(line.id) : null
      if (line.transferStatus === 'completed' && (line.transferId || src?.purchaseDetails?.transferId)) {
        nextTransferIdSet.add(line.transferId || src?.purchaseDetails?.transferId)
      }
    })

    purchaseRows.forEach((row) => {
      if (!lines.some((l) => l.id === row.id)) {
        const idx = store.items.findIndex((x) => x.id === row.id)
        if (idx >= 0) store.items.splice(idx, 1)
      }
    })

    lines.forEach((line) => {
      const src = line.id ? originalById.get(line.id) : null
      if (src) {
        applyLineToItem(line, src)
        synchronizeSameSidLines(line, null, originalById)
      } else {
        addPurchaseItem({
          name: line.name,
          brand: line.brand,
          category: editGroupForm.category,
          batch: editGroupForm.batch,
          stock: 1,
          isManual: false,
          isDefect: false,
          isLongTerm: false,
          purchaseDetails: {
            date: editGroupForm.date,
            paymentAccount: editGroupForm.paymentAccount,
            discount: editGroupForm.discount,
            website: editGroupForm.website,
            websiteAccount: editGroupForm.websiteAccount,
            paymentBatch: purchaseRows[0]?.purchaseDetails?.paymentBatch || editableRows[0]?.purchaseDetails?.paymentBatch || '-',
            purchaseGroupId: editGroupForm.purchaseGroupId,
            totalRMB: Number(editGroupCalculatedTotalRMB.value || 0),
            originalPrice: Number(line.originalPrice || 0),
            exchangeRate: Number(editGroupRate.value || 0),
            domesticShipping: Number(line.domesticShipping || 0),
            fee: Number(line.fee || 0),
            preTransferCost: editGroupForm.category === '国内'
              ? Number(line.originalPrice || 0)
              : calcPreTransferCost(
                  Number(line.originalPrice || 0),
                  Number(editGroupRate.value || 0),
                  Number(line.domesticShipping || 0),
                  Number(line.fee || 0),
                ),
            transferStatus: 'pending',
            transferCoefficient: Number(line.transferCoefficient || 1),
            transferCost: 0,
            transferSelected: false,
          },
        })
      }
    })

    nextTransferIdSet.forEach((transferId) => {
      const relatedItems = store.items.filter(
        (item) =>
          item?.status !== 'sold' &&
          item?.purchaseDetails?.transferId === transferId &&
          item?.purchaseDetails?.transferStatus === 'completed',
      )
      if (relatedItems.length === 0) return
      const transferRecord = store.transfers.find((t) => t?.transferId === transferId)
      if (!transferRecord) return
      const totalCoefficients = relatedItems.reduce(
        (sum, item) => sum + Number(item?.purchaseDetails?.transferCoefficient || 1),
        0,
      )
      relatedItems.forEach((item) => {
        const pre = Number(item?.purchaseDetails?.preTransferCost || 0)
        const c = Number(item?.purchaseDetails?.transferCoefficient || 1)
        const tc = calcTransferCost(Number(transferRecord.totalRMB || 0), c, totalCoefficients || 1)
        item.purchaseDetails.transferCost = tc
        item.cost = calcItemCost(pre, tc)
      })
    })

    if (isDomesticEditGroup.value) {
      editGroupForm.totalRMB = editGroupCalculatedTotalRMB.value
    }

    saveToLocalStorage()
    addOperationLog('purchase_group_edit', `编辑购买组`, {
      category: editGroupForm.category,
      batch: editGroupForm.batch,
      count: lines.length,
    })
    showEditGroupModal.value = false
  } finally {
    isSubmittingEditGroup.value = false
  }
}

const pendingTransferCount = computed(() =>
  purchaseItems.value.filter(
    (i) =>
      PURCHASE_TABS.includes(i?.category) &&
      (i?.purchaseDetails?.transferStatus || 'pending') === 'pending',
  ).length,
)

const groupedTransferRecords = computed(() => {
  const records = [...(store.transfers || [])].sort(
    (a, b) => new Date(b?.date || 0).getTime() - new Date(a?.date || 0).getTime(),
  )

  const groups = { 日淘: [], 美淘: [] }
  records.forEach((record) => {
    const related = getTransferItems(record)
    const category = related[0]?.category || record?.category || '日淘'
    if (!groups[category]) return
    const batch = related[0]?.batch || record?.batch || '-'
    groups[category].push({
      ...record,
      category,
      batch,
      isInventory: related.length > 0 && related.every((i) => i?.status !== 'purchase'),
    })
  })
  return groups
})

const transferMonthGroups = computed(() => {
  const result = { 日淘: {}, 美淘: {} }
  ;['日淘', '美淘'].forEach((cat) => {
    const list = groupedTransferRecords.value[cat] || []
    const history = list.slice(10)
    history.forEach((record) => {
      const month = (record?.date || '').slice(0, 7) || '未记录月份'
      if (!result[cat][month]) result[cat][month] = []
      result[cat][month].push(record)
    })
  })
  return result
})

const transferItemDetails = computed(() => {
  const idSet = new Set(editTransferForm.itemIds || [])
  const related = store.items.filter((i) => idSet.has(i.id))
  const map = new Map()
  related.forEach((item) => {
    const sid = item?.sid || String(item?.id)
    if (!map.has(sid)) {
      map.set(sid, { sid, name: item?.name || '', qty: 0 })
    }
    map.get(sid).qty += 1
  })
  return Array.from(map.values())
})

function editTransferRecord(record) {
  const soldItems = getTransferItems(record).filter((item) => item?.status === 'sold')
  if (soldItems.length > 0) {
    const details = buildSoldItemsDetailText(soldItems)
    const more = soldItems.length > 12 ? `\n... 另有 ${soldItems.length - 12} 件` : ''
    alert(
      `该转运记录含 ${soldItems.length} 件已售出商品，当前不可编辑。\n\n请先在“销售记账”中回滚这些商品到库存，再在“库存管理”中执行同转运批次下架后再编辑：\n${details}${more}`,
    )
    return
  }
  editTransferForm.transferId = record?.transferId || ''
  editTransferForm.date = record?.date || ''
  editTransferForm.totalRMB = Number(record?.totalRMB || 0)
  editTransferForm.paymentAccount = record?.paymentAccount || '支付宝'
  editTransferForm.itemIds = [...(record?.itemIds || [])]
  showEditTransferModal.value = true
}

function submitEditTransfer() {
  if (isSubmittingEditTransfer.value) return
  const record = store.transfers.find((r) => r?.transferId === editTransferForm.transferId)
  if (!record) return

  const relatedItems = store.items.filter((i) => (editTransferForm.itemIds || []).includes(i.id))
  const invalidCoefficient = relatedItems.find(
    (item) => Number(item?.purchaseDetails?.transferCoefficient || 1) <= 0 || Number(item?.purchaseDetails?.transferCoefficient || 1) > 10,
  )
  if (invalidCoefficient) return alert('存在非法转运系数（需在 0~10 之间），请先编辑购买组修正')

  isSubmittingEditTransfer.value = true
  try {
    record.date = editTransferForm.date
    record.totalRMB = Number(editTransferForm.totalRMB || 0)
    record.paymentAccount = editTransferForm.paymentAccount

    const totalCoefficients = relatedItems.reduce(
      (sum, item) => sum + Number(item?.purchaseDetails?.transferCoefficient || 1),
      0,
    )
    relatedItems.forEach((item) => {
      const coefficient = Number(item?.purchaseDetails?.transferCoefficient || 1)
      const preTransferCost = Number(item?.purchaseDetails?.preTransferCost || 0)
      const transferCost = calcTransferCost(record.totalRMB, coefficient, totalCoefficients || 1)
      item.purchaseDetails.transferCost = transferCost
      item.cost = calcItemCost(preTransferCost, transferCost)
    })

    saveToLocalStorage()
    addOperationLog('purchase_transfer_edit', `编辑转运记录: ${record.transferBatch || record.transferId}`, {
      transferId: record.transferId,
      totalRMB: record.totalRMB,
    })
    showEditTransferModal.value = false
  } finally {
    isSubmittingEditTransfer.value = false
  }
}

function deleteTransferRecord(record) {
  if (!record) return
  if (!confirm('确定删除此转运记录？商品将回归待转运状态。')) return

  const idSet = new Set(record.itemIds || [])
  store.items.forEach((item) => {
    if (!idSet.has(item.id)) return
    if (!item.purchaseDetails) item.purchaseDetails = {}
    item.purchaseDetails.transferStatus = 'pending'
    item.purchaseDetails.transferId = undefined
    item.purchaseDetails.transferBatch = undefined
    item.purchaseDetails.transferCost = 0
    item.cost = Number(item.purchaseDetails.preTransferCost || 0)
  })

  const idx = store.transfers.findIndex((r) => r?.transferId === record.transferId)
  if (idx >= 0) store.transfers.splice(idx, 1)

  saveToLocalStorage()
  addOperationLog('purchase_transfer_delete', `删除转运记录: ${record.transferBatch || record.transferId}`, {
    transferId: record.transferId,
  })
}

function batchMoveToInventoryByRecord(record) {
  const ids = record?.itemIds || []
  if (ids.length === 0) return

  const items = getTransferItems(record).filter((i) => i?.status === 'purchase')
  const preview = items
    .slice(0, 12)
    .map((i) => `- ${i?.sid || '-'} | ${i?.name || '-'} | ¥${fmtMoney(i?.cost || 0)}`)
    .join('\n')
  const more = items.length > 12 ? `\n... 另有 ${items.length - 12} 件` : ''
  const ok = confirm(
    `将同转运记录商品一起入库（共 ${items.length} 件）：\n${preview}${more}\n\n确认继续？`,
  )
  if (!ok) return

  batchMoveToInventory(ids)
  record.isInventory = true
}

function openEdit(item) {
  editForm.id = item.id
  editForm.name = item.name
  editForm.brand = item.brand
  editForm.cost = Number(item.cost || 0)
  showEditModal.value = true
}

function submitEdit() {
  const item = store.items.find((x) => x.id === editForm.id)
  if (!item) return

  const before = {
    name: item.name,
    brand: item.brand,
    cost: Number(item.cost || 0),
  }

  item.name = editForm.name
  item.brand = editForm.brand
  item.cost = Number(editForm.cost || 0)

  const changes = {}
  ;['name', 'brand', 'cost'].forEach((field) => {
    if (before[field] !== item[field]) {
      changes[field] = {
        before: before[field],
        after: item[field],
      }
    }
  })

  saveToLocalStorage()
  addOperationLog('purchase_edit', `编辑采购商品: ${item.name}`, {
    sid: item.sid,
    changedFields: Object.keys(changes),
    changes,
  })
  showEditModal.value = false
}

function getTransferItems(transfer) {
  const byIds = Array.isArray(transfer.itemIds)
    ? store.items.filter((i) => transfer.itemIds.includes(i.id))
    : []
  if (byIds.length > 0) return byIds
  return store.items.filter((i) => i?.purchaseDetails?.transferId === transfer.transferId)
}

onMounted(() => {
  try {
    const collapsedRaw = localStorage.getItem(purchaseCollapseStorageKey)
    if (collapsedRaw) Object.assign(collapsedGroups, JSON.parse(collapsedRaw))

    const expandedRaw = localStorage.getItem(purchaseTransferExpandStorageKey)
    if (expandedRaw) Object.assign(expandedTransfers, JSON.parse(expandedRaw))
  } catch (_) {
    // ignore invalid cache
  }
})

watch(
  collapsedGroups,
  (val) => {
    localStorage.setItem(purchaseCollapseStorageKey, JSON.stringify(val))
  },
  { deep: true },
)

watch(
  expandedTransfers,
  (val) => {
    localStorage.setItem(purchaseTransferExpandStorageKey, JSON.stringify(val))
  },
  { deep: true },
)

watch(purchaseViewCategory, () => {
  transferCategoryBatch.value = ''
})

</script>

<template>
  <div class="space-y-5 max-w-7xl mx-auto">
    <div class="flex justify-between items-end mb-6">
      <div class="flex items-baseline gap-3">
        <h2 class="text-3xl font-extrabold">采购管理</h2>
        <span class="text-base text-gray-400 font-light">Procurement Management</span>
      </div>
      <div class="flex gap-2">
        <button class="btn btn-primary btn-sm" @click="openAddModal"><i class="fa-solid fa-plus" /> 新建购买</button>
        <button class="btn btn-warning btn-sm" :disabled="!hasPurchaseItems" @click="handleNewTransfer"><i class="fa-solid fa-truck" /> 新建转运</button>
        <button class="btn btn-outline btn-sm" @click="showTransferListModal = true"><i class="fa-solid fa-list" /> 转运记录</button>
      </div>
    </div>

    <div class="grid grid-cols-3 gap-4">
      <div class="bg-gray-50 p-4 rounded-xl border-l-4 border-yellow-500">
        <div class="text-xs text-gray-500 mb-1">采购中件数</div>
        <div class="text-2xl font-bold text-warning">{{ stats.totalCount }}</div>
      </div>
      <div class="bg-gray-50 p-4 rounded-xl border-l-4 border-blue-500">
        <div class="text-xs text-gray-500 mb-1">采购中金额（含转运费）</div>
        <div class="text-2xl font-bold text-primary">{{ fmtMoney(stats.totalAmount) }}</div>
      </div>
      <div class="bg-gray-50 p-4 rounded-xl border-l-4 border-gray-400">
        <div class="text-xs text-gray-500 mb-1">待转运</div>
        <div class="text-2xl font-bold text-gray-600">{{ pendingTransferCount }}</div>
      </div>
    </div>

    <div class="apple-card p-2 mb-4">
      <div class="flex gap-2">
        <button
          v-for="c in PURCHASE_TABS"
          :key="c"
          class="flex-1 py-3 px-4 rounded-lg font-medium transition flex flex-col"
          :class="
            purchaseViewCategory === c
              ? c === '日淘'
                ? 'bg-yellow-500 text-white'
                : c === '美淘'
                  ? 'bg-blue-500 text-white'
                  : c === '国内'
                    ? 'bg-green-500 text-white'
                    : 'bg-purple-500 text-white'
              : c === '日淘'
                ? 'bg-yellow-100 text-yellow-800 hover:bg-yellow-200'
                : c === '美淘'
                  ? 'bg-blue-100 text-blue-800 hover:bg-blue-200'
                  : c === '国内'
                    ? 'bg-green-100 text-green-800 hover:bg-green-200'
                    : 'bg-purple-100 text-purple-800 hover:bg-purple-200'
          "
          @click="purchaseViewCategory = c"
        >
          <span>{{ c }}<span class="ml-1 text-xs">({{ purchaseCategoryStats[c].count }}件/采购中{{ fmtNum(purchaseCategoryStats[c].purchase) }}/转运中{{ fmtNum(purchaseCategoryStats[c].transfer) }})</span></span>
          <span class="text-xs opacity-80">待转运 {{ c === '国内' ? '- -' : (purchaseCategoryStats[c].pendingCount || 0) }}{{ c === '国内' ? '' : ' 件' }}</span>
        </button>
      </div>
    </div>

    <div v-for="batch in groupedByBatch" :key="batch.key" class="mb-4">
      <div class="bg-gray-50 border border-gray-200 rounded-lg overflow-hidden">
        <div
          class="bg-gray-200 px-4 py-2 border-b border-gray-200 font-semibold text-gray-800 cursor-pointer flex items-center gap-2"
          @click="toggleGroup(batch.key)"
        >
          <i :class="collapsedGroups[batch.key] ? 'fa-solid fa-chevron-right' : 'fa-solid fa-chevron-down'" />
          <span class="font-semibold text-gray-800">{{ batch.category }} / {{ batch.batch }}</span>
          <span class="text-xs text-gray-500 font-normal">- {{ batch.count }}件/采购中{{ fmtNum(batch.purchase) }}/转运中{{ fmtNum(batch.transfer) }}</span>
        </div>
        <div v-show="collapsedGroups[batch.key] !== true" class="divide-y divide-gray-100">
          <div v-for="group in batch.purchaseGroups" :key="group.key">
            <div class="p-3 border-b border-gray-100 bg-gray-100">
              <div class="grid grid-cols-12 gap-2 text-sm items-center">
                <div class="col-span-2 font-medium truncate">{{ group.date }}</div>
                <div class="col-span-3 text-gray-400 truncate">{{ group.website || '-' }}</div>
                <div class="col-span-2 text-gray-400 text-xs text-right">100{{ group.category === '日淘' ? 'JPY' : group.category === '美淘' ? 'USD' : '' }}={{ group.category === '日淘' || group.category === '美淘' ? fmtNum(group.exchangeRate * 100) + 'RMB' : '' }}</div>
                <div class="col-span-2 text-gray-300 text-xs truncate text-right">{{ group.paymentBatch || '-' }}</div>
                <div class="col-span-2 font-semibold text-gray-700 text-right"><span class="text-xs font-normal">初始购买金额(不含转运)</span> ¥{{ fmtNum(group.totalRMB) }}</div>
                <div class="col-span-1 flex gap-1 justify-end">
                  <button v-if="group.category === '国内' || group.category === '2025JAPAN'" @click="batchMovePurchaseGroup(group)" class="btn btn-success btn-xs" title="入库"><i class="fa-solid fa-box"></i></button>
                  <button @click="openEditPurchaseGroup(group)" class="btn btn-outline btn-xs"><i class="fa-solid fa-pen"></i></button>
                  <button @click="deletePurchaseGroup(group)" class="btn btn-danger btn-xs"><i class="fa-solid fa-trash"></i></button>
                </div>
              </div>
            </div>
            <table class="w-full table-fixed text-sm">
              <thead>
                <tr class="bg-gray-50 text-xs text-gray-500 border-b border-gray-100">
                  <th class="w-auto text-left font-medium px-3 py-2">名称</th>
                  <th class="w-16 text-center font-medium px-2 py-2">数量</th>
                  <th class="w-24 text-right font-medium px-2 py-2">官网原价</th>
                  <th class="w-20 text-right font-medium px-2 py-2">运费</th>
                  <th class="w-20 text-right font-medium px-2 py-2">手续费</th>
                  <th class="w-16 text-center font-medium px-2 py-2">系数</th>
                  <th class="w-24 text-right font-medium px-2 py-2">在途成本</th>
                  <th class="w-20 text-right font-medium px-2 py-2">转运费</th>
                  <th class="w-20 text-right font-medium px-2 py-2">单品成本</th>
                  <th class="w-16 text-center font-medium px-2 py-2">转运</th>
                  <th class="w-14"></th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="item in group.itemsBySid" :key="item.sid" class="bg-white border-b border-gray-50 last:border-b-0">
                  <td class="font-medium truncate max-w-xs px-3 py-2">{{ item.name }} <span v-if="item.qty > 1" class="text-xs text-gray-400">x{{ item.qty }}</span></td>
                  <td class="text-center px-2 py-2">{{ item.qty }}</td>
                  <td class="text-gray-500 text-right px-2 py-2">{{ item.purchaseDetails?.originalPrice || '-' }}</td>
                  <td class="text-gray-500 text-right px-2 py-2">{{ item.purchaseDetails?.domesticShipping || 0 }}</td>
                  <td class="text-gray-500 text-right px-2 py-2">{{ item.purchaseDetails?.fee || 0 }}</td>
                  <td class="text-center px-2 py-2">{{ item.purchaseDetails?.transferCoefficient || 1 }}</td>
                  <td class="text-warning text-right px-2 py-2">{{ fmtMoney(item.purchaseDetails?.preTransferCost || 0) }}</td>
                  <td class="text-teal text-right px-2 py-2">{{ fmtMoney(item.purchaseDetails?.transferCost || 0) }}</td>
                  <td class="text-primary font-bold text-right px-2 py-2">{{ fmtMoney(item.cost) }}</td>
                  <td class="text-center px-2 py-2">
                    <span v-if="item.purchaseDetails?.transferStatus === 'completed'" class="text-gray-400 text-xs" title="转运批次">{{ item.purchaseDetails?.transferBatch }}</span>
                    <span v-else class="text-gray-300 text-sm" title="待转运">○</span>
                  </td>
                  <td></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
    <div v-if="groupedByBatch.length === 0" class="apple-card text-center text-gray-400 py-8">暂无采购记录</div>

    <!-- 新建购买弹窗（对齐旧版） -->
    <div v-if="showAddModal" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 glass-modal">
      <div class="apple-card w-full max-w-6xl relative max-h-[90vh] overflow-y-auto">
        <button class="absolute top-4 right-4 text-gray-400 hover:text-gray-800" @click="showAddModal = false"><i class="fa-solid fa-xmark text-xl" /></button>
        <h3 class="text-xl font-bold mb-6">新建购买 - {{ addForm.category }} {{ addForm.batch }}</h3>

        <div class="grid grid-cols-3 gap-4 mb-4">
          <div>
            <label class="block text-sm mb-1 text-gray-600">批次</label>
            <select v-model="addForm.batch" class="apple-select">
              <option v-for="b in availableBatches" :key="b" :value="b">{{ b }}</option>
            </select>
          </div>
          <div>
            <label class="block text-sm mb-1 text-gray-600">日期</label>
            <input v-model="addForm.date" type="date" class="apple-input" />
          </div>
          <div>
            <label class="block text-sm mb-1 text-gray-600">付款账户</label>
            <select v-model="addForm.paymentAccount" class="apple-select">
              <option>支付宝</option><option>信用卡</option><option>微信</option><option>现金</option>
            </select>
          </div>
        </div>

        <div class="grid grid-cols-3 gap-4 mb-4">
          <div><label class="block text-sm mb-1 text-gray-600">购买优惠</label><input v-model="addForm.discount" class="apple-input" list="discountsList" placeholder="优惠金额或描述" /></div>
          <div><label class="block text-sm mb-1 text-gray-600">采购网站</label><input v-model="addForm.website" class="apple-input" list="websitesList" placeholder="采购网站名称" /></div>
          <div><label class="block text-sm mb-1 text-gray-600">网站账户</label><input v-model="addForm.websiteAccount" class="apple-input" list="websiteAccountsList" placeholder="网站登录账户" /></div>
        </div>

        <div class="border-t border-gray-200 pt-4 mb-4">
          <div class="flex justify-between items-center mb-2">
            <span class="font-medium">商品明细 <span class="text-xs text-gray-400 font-normal">(日淘/美淘填官网价、运费、手续费；国内填价格)</span></span>
            <button @click="addPurchaseLine" class="text-primary text-sm"><i class="fa-solid fa-plus"></i> 添加商品</button>
          </div>

          <div v-if="addForm.category === '日淘' || addForm.category === '美淘'">
            <div class="grid grid-cols-12 gap-2 mb-1 text-xs text-gray-500 font-medium">
              <div class="col-span-2">品牌</div>
              <div class="col-span-3">颜色/车型</div>
              <div class="col-span-2 text-right">官网原价</div>
              <div class="col-span-1 text-right">运费</div>
              <div class="col-span-1 text-right">手续费</div>
              <div class="col-span-1 text-right">系数</div>
              <div class="col-span-1 text-right">数量</div>
              <div class="col-span-1 text-right">操作</div>
            </div>
            <div v-for="(item, idx) in addForm.items" :key="idx" class="mb-2">
              <div class="grid grid-cols-12 gap-2 items-center mb-1">
                <select v-model="item.brand" class="apple-input text-sm col-span-2"><option v-for="b in BRANDS" :key="b">{{ b }}</option></select>
                <input
                  v-model="item.name"
                  type="text"
                  class="apple-input text-sm col-span-3"
                  placeholder="选择品牌后联想输入车辆名称颜色"
                  :list="`itemNamesList-${idx}`"
                />
                <input v-model.number="item.originalPrice" type="number" class="apple-input text-sm text-right col-span-2" :placeholder="addForm.category==='日淘' ? 'JPY' : 'USD'" />
                <input v-model.number="item.domesticShipping" type="number" class="apple-input text-sm text-right col-span-1" placeholder="运费" />
                <input v-model.number="item.fee" type="number" class="apple-input text-sm text-right col-span-1" placeholder="手续费" />
                <datalist :id="`itemNamesList-${idx}`"><option v-for="n in getItemNamesByBrand(item.brand)" :key="n" :value="n" /></datalist>
                <input v-model.number="item.transferCoefficient" type="number" class="apple-input text-sm text-right col-span-1" placeholder="系数" />
                <div class="col-span-1 flex items-center justify-end">
                  <input v-model.number="item.qty" type="number" min="1" max="10" class="apple-input text-sm w-full max-w-[88px] text-right" />
                </div>
                <div class="col-span-1 flex items-center justify-end">
                  <button @click="addForm.items.splice(idx, 1)" class="text-danger text-sm"><i class="fa-solid fa-trash"></i></button>
                </div>
              </div>
            </div>
          </div>

          <div v-else>
            <div class="grid grid-cols-12 gap-2 mb-1 text-xs text-gray-500 font-medium">
              <div class="col-span-2">品牌</div>
              <div class="col-span-6">颜色/车型</div>
              <div class="col-span-2 text-right">价格(¥)</div>
              <div class="col-span-2 text-right">数量</div>
            </div>
            <div v-for="(item, idx) in addForm.items" :key="idx" class="mb-2">
              <div class="grid grid-cols-12 gap-2 items-center mb-1">
                <select v-model="item.brand" class="apple-input text-sm col-span-2"><option v-for="b in BRANDS" :key="b">{{ b }}</option></select>
                <input
                  v-model="item.name"
                  type="text"
                  class="apple-input text-sm col-span-6"
                  placeholder="选择品牌后联想输入车辆名称颜色"
                  :list="`itemNamesDomesticList-${idx}`"
                />
                <input v-model.number="item.price" type="number" class="apple-input text-sm text-right col-span-2" placeholder="人民币" />
                <datalist :id="`itemNamesDomesticList-${idx}`"><option v-for="n in getItemNamesByBrand(item.brand)" :key="n" :value="n" /></datalist>
                <div class="col-span-2 flex items-center justify-end gap-2">
                  <input v-model.number="item.qty" type="number" min="1" class="apple-input text-sm w-20 text-right" />
                  <button @click="addForm.items.splice(idx, 1)" class="text-danger text-sm"><i class="fa-solid fa-trash"></i></button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="border-t border-gray-200 pt-4">
          <div class="flex items-end gap-4">
            <div v-if="addForm.category === '国内'" class="flex-1">
              <label class="block text-sm mb-1 text-gray-600">总RMB付款</label>
              <div class="apple-input bg-gray-100 text-gray-700 py-2 px-3">¥ {{ fmtNum(calculatedTotalRMB) }}</div>
            </div>
            <div v-else class="flex-1">
              <label class="block text-sm mb-1 text-gray-600">总RMB付款</label>
              <input v-model.number="addForm.totalRMB" type="number" class="apple-input" />
            </div>
            <div class="text-sm text-gray-500 bg-gray-50 px-3 py-2 rounded">共 <span class="font-bold text-gray-700">{{ totalItemsCount }}</span> 件</div>
            <div v-if="addForm.category === '日淘' || addForm.category === '美淘'" class="text-sm text-gray-500">
              Rate: 100 {{ addForm.category === '日淘' ? 'JPY' : 'USD' }} = {{ fmtNum(calculatedRate * 100) }} RMB
            </div>
          </div>
        </div>

        <div class="flex justify-end gap-3 mt-6">
          <button @click="showAddModal = false" class="btn btn-outline">取消</button>
          <button @click="submitAdd" class="btn btn-primary" :disabled="isSubmittingAdd">确认采购</button>
        </div>
        <datalist id="discountsList"><option v-for="d in discountsUsed" :key="d" :value="d" /></datalist>
        <datalist id="websitesList"><option v-for="w in websitesUsed" :key="w" :value="w" /></datalist>
        <datalist id="websiteAccountsList"><option v-for="a in websiteAccountsUsed" :key="a" :value="a" /></datalist>
      </div>
    </div>

    <!-- 新建转运弹窗（对齐旧版） -->
    <div v-if="showTransferModal" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 glass-modal">
      <div class="apple-card w-full max-w-2xl relative max-h-[90vh] overflow-y-auto px-5 py-5">
        <button @click="showTransferModal = false" class="absolute top-4 right-4 text-gray-400 hover:text-gray-800"><i class="fa-solid fa-xmark text-xl"></i></button>
        <h3 class="text-[22px] leading-7 font-bold mb-4">转运确认</h3>

        <div class="mb-3.5">
          <label class="block text-[12px] leading-4 mb-1.5 text-gray-500">批次筛选</label>
          <select v-model="transferCategoryBatch" class="apple-select h-10 text-[13px] leading-6 rounded-md border-gray-300">
            <option value="">全部批次</option>
            <option v-for="v in transferBatchOptions" :key="v" :value="v">{{ v }}</option>
          </select>
        </div>

        <div class="mb-3.5">
          <div class="flex items-center justify-between mb-2.5">
            <span class="font-medium text-[13px] text-gray-700">待转运商品 <span class="text-gray-400 font-normal">(勾选后参与分摊)</span></span>
            <div class="flex gap-3">
              <button @click="selectAllForTransfer" class="text-[12px] text-primary hover:underline">全选</button>
              <button @click="deselectAllForTransfer" class="text-[12px] text-gray-500 hover:underline">取消</button>
            </div>
          </div>
          <div class="max-h-64 overflow-y-auto border border-gray-200 rounded-md">
            <table class="w-full text-[13px] leading-5">
              <thead class="bg-gray-50 sticky top-0 text-[12px] text-gray-500">
                <tr>
                  <th class="py-2 px-3 w-10 font-medium"></th>
                  <th class="py-2 px-3 text-left font-medium">商品信息</th>
                  <th class="py-2 px-3 text-center font-medium">数量</th>
                  <th class="py-2 px-3 text-right font-medium">在途成本</th>
                  <th class="py-2 px-3 text-right font-medium">转运系数</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="item in groupedTransferItemsBySid" :key="item.sid" class="border-t border-gray-100">
                  <td class="py-2 px-3 text-center">
                    <input type="checkbox" :checked="item.selected" @change="toggleTransferSelectionBySid(item)" class="w-4 h-4 text-primary rounded">
                  </td>
                  <td class="py-2 px-3">
                    <div class="font-medium text-[13px] text-gray-800">{{ item.name }}</div>
                    <div class="text-[12px] text-gray-400 mt-0.5">{{ item.category }} | {{ item.batch }}</div>
                  </td>
                  <td class="py-2 px-3 text-center text-gray-700">{{ item.qty }}</td>
                  <td class="py-2 px-3 text-right text-warning font-medium">{{ fmtMoney(item.preTransferCost || 0) }}</td>
                  <td class="py-2 px-3 text-right text-gray-700">{{ item.transferCoefficient || 1 }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div class="mt-2 text-[13px] text-gray-500">
            已选 <span class="font-bold text-primary">{{ selectedTransferItemCount }}</span> 件，
            转运系数合计: <span class="font-bold">{{ totalSelectedCoefficient }}</span>
          </div>
        </div>

        <div class="border-t border-gray-200 pt-3.5 mb-4">
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-[12px] mb-1.5 text-gray-600">转运总费用 (¥)</label>
              <input type="number" v-model.number="transferForm.totalRMB" class="apple-input h-9 text-[13px]" placeholder="转运总费用">
            </div>
            <div>
              <label class="block text-[12px] mb-1.5 text-gray-600">付款账户</label>
              <select v-model="transferForm.paymentAccount" class="apple-select h-10 text-[13px] leading-6"><option>支付宝</option><option>信用卡</option><option>微信</option><option>现金</option></select>
            </div>
          </div>
          <div class="mt-2 text-[12px] text-gray-500" v-if="totalSelectedCoefficient > 0">
            每系数分摊: {{ fmtMoney(transferForm.totalRMB / totalSelectedCoefficient) }} ¥
          </div>
        </div>

        <div class="flex justify-end gap-3">
          <button @click="showTransferModal = false" class="btn btn-outline btn-sm">取消</button>
          <button @click="submitTransferBatch" class="btn btn-primary btn-sm" :disabled="selectedItemIds.length === 0 || isSubmittingTransfer">确认转运</button>
        </div>
      </div>
    </div>

    <!-- 转运记录列表弹窗（对齐旧版） -->
    <div v-if="showTransferListModal" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 glass-modal">
      <div class="apple-card w-full max-w-3xl relative max-h-[90vh] overflow-y-auto">
        <button @click="showTransferListModal = false" class="absolute top-4 right-4 text-gray-400 hover:text-gray-800"><i class="fa-solid fa-xmark text-xl"></i></button>
        <h3 class="text-xl font-bold mb-4">转运记录</h3>

        <div class="flex gap-2 mb-4">
          <button @click="transferListCategory = '日淘'" :class="['flex-1 py-2 px-4 rounded-lg font-medium transition', transferListCategory === '日淘' ? 'bg-yellow-500 text-white' : 'bg-yellow-100 text-yellow-800 hover:bg-yellow-200']">日淘</button>
          <button @click="transferListCategory = '美淘'" :class="['flex-1 py-2 px-4 rounded-lg font-medium transition', transferListCategory === '美淘' ? 'bg-blue-500 text-white' : 'bg-blue-100 text-blue-800 hover:bg-blue-200']">美淘</button>
        </div>

        <div v-if="(groupedTransferRecords[transferListCategory] || []).length === 0" class="text-center text-gray-400 py-8">暂无{{ transferListCategory }}转运记录</div>
        <div v-else class="space-y-3 max-h-[60vh] overflow-y-auto">
          <div v-for="record in (groupedTransferRecords[transferListCategory] || []).slice(0, 10)" :key="record.transferId" :class="['border rounded-lg p-4', record.isInventory ? 'bg-gray-50' : '']">
            <div class="flex justify-between items-start mb-2">
              <div>
                <div class="font-bold">{{ record.transferBatch }}</div>
                <div class="text-sm text-gray-500">{{ record.date }} | {{ record.category }} | {{ record.batch }}</div>
              </div>
              <div class="text-right">
                <div class="font-bold text-primary">转运费: ¥{{ fmtNum(record.totalRMB) }}</div>
                <div class="text-xs text-gray-400">{{ record.itemIds?.length || 0 }} 件</div>
              </div>
            </div>
            <div class="flex gap-2 mt-2">
              <button v-if="!record.isInventory" @click="batchMoveToInventoryByRecord(record)
                " class="btn btn-success btn-xs">入库</button>
              <span v-else class="text-xs text-gray-400 py-1">已入库</span>
              <button @click="editTransferRecord(record)" class="btn btn-outline btn-xs">编辑</button>
              <button @click="deleteTransferRecord(record)" class="btn btn-danger btn-xs">删除</button>
            </div>
          </div>

          <div v-if="(groupedTransferRecords[transferListCategory] || []).length > 10">
            <div v-if="!transferGroupExpanded[transferListCategory]" @click="transferGroupExpanded[transferListCategory] = true" class="text-center text-primary cursor-pointer py-2 hover:underline">
              展开历史记录 ({{ (groupedTransferRecords[transferListCategory] || []).length - 10 }} 条)
            </div>
            <div v-else>
              <div @click="transferGroupExpanded[transferListCategory] = false" class="text-center text-gray-500 cursor-pointer py-2 hover:underline mb-2">收起历史记录</div>
              <div v-for="(monthRecords, month) in transferMonthGroups[transferListCategory]" :key="month" class="mb-3">
                <div class="font-medium text-sm text-gray-600 bg-gray-50 px-3 py-2 rounded">{{ month }} ({{ monthRecords.length }} 条)</div>
                <div v-for="record in monthRecords" :key="record.transferId" :class="['border rounded-lg p-4 mt-2', record.isInventory ? 'bg-gray-50' : '']">
                  <div class="flex justify-between items-start mb-2">
                    <div>
                      <div class="font-bold">{{ record.transferBatch }}</div>
                      <div class="text-sm text-gray-500">{{ record.date }} | {{ record.category }} | {{ record.batch }}</div>
                    </div>
                    <div class="text-right">
                      <div class="font-bold text-primary">转运费: ¥{{ fmtNum(record.totalRMB) }}</div>
                      <div class="text-xs text-gray-400">{{ record.itemIds?.length || 0 }} 件</div>
                    </div>
                  </div>
                  <div class="flex gap-2 mt-2">
                    <button v-if="!record.isInventory" @click="batchMoveToInventoryByRecord(record)" class="btn btn-success btn-xs">入库</button>
                    <span v-else class="text-xs text-gray-400 py-1">已入库</span>
                    <button @click="editTransferRecord(record)" class="btn btn-outline btn-xs">编辑</button>
                    <button @click="deleteTransferRecord(record)" class="btn btn-danger btn-xs">删除</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 编辑转运记录弹窗 -->
    <div v-if="showEditTransferModal" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 glass-modal">
      <div class="apple-card w-full max-w-md relative">
        <button @click="showEditTransferModal = false" class="absolute top-4 right-4 text-gray-400 hover:text-gray-800"><i class="fa-solid fa-xmark text-xl"></i></button>
        <h3 class="text-xl font-bold mb-6">编辑转运记录</h3>
        <div class="space-y-4">
          <div><label class="block text-sm mb-1 text-gray-600">转运日期</label><input type="date" v-model="editTransferForm.date" class="apple-input"></div>
          <div><label class="block text-sm mb-1 text-gray-600">转运总费用 (¥)</label><input type="number" v-model.number="editTransferForm.totalRMB" class="apple-input"></div>
          <div><label class="block text-sm mb-1 text-gray-600">付款账户</label><select v-model="editTransferForm.paymentAccount" class="apple-select"><option>支付宝</option><option>信用卡</option><option>微信</option><option>现金</option></select></div>
          <div class="bg-gray-50 p-3 rounded-lg">
            <div class="text-sm text-gray-600 mb-2">关联商品 ({{ editTransferForm.itemIds?.length || 0 }} 件):</div>
            <div class="text-xs text-gray-500 space-y-1">
              <div v-for="detail in transferItemDetails" :key="detail.sid" class="flex justify-between">
                <span>{{ detail.name }}</span>
                <span class="font-medium">x{{ detail.qty }}</span>
              </div>
            </div>
          </div>
        </div>
        <div class="mt-6 flex justify-end gap-3">
          <button @click="showEditTransferModal = false" class="btn btn-outline">取消</button>
          <button @click="submitEditTransfer" class="btn btn-primary" :disabled="isSubmittingEditTransfer">保存</button>
        </div>
      </div>
    </div>

    <!-- 编辑弹窗 -->
    <div v-if="showEditGroupModal" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 glass-modal">
      <div class="apple-card w-full max-w-5xl relative max-h-[90vh] overflow-y-auto">
        <button class="absolute top-4 right-4 text-gray-400 hover:text-gray-800" @click="showEditGroupModal = false"><i class="fa-solid fa-xmark text-xl" /></button>
        <h3 class="text-xl font-bold mb-5">编辑购买组</h3>

        <div class="grid grid-cols-4 gap-3 mb-4">
          <div><label class="block text-sm mb-1 text-gray-600">大类</label><select v-model="editGroupForm.category" class="apple-select"><option v-for="c in PURCHASE_TABS" :key="c">{{ c }}</option></select></div>
          <div>
            <label class="block text-sm mb-1 text-gray-600">批次</label>
            <select v-model="editGroupForm.batch" class="apple-select">
              <option v-for="b in editAvailableBatches" :key="b" :value="b">{{ b }}</option>
            </select>
          </div>
          <div><label class="block text-sm mb-1 text-gray-600">日期</label><input v-model="editGroupForm.date" type="date" class="apple-input" /></div>
          <div><label class="block text-sm mb-1 text-gray-600">付款账户</label><select v-model="editGroupForm.paymentAccount" class="apple-select"><option>支付宝</option><option>信用卡</option><option>微信</option><option>现金</option></select></div>
        </div>

        <div class="grid grid-cols-3 gap-3 mb-4">
          <div><label class="block text-sm mb-1 text-gray-600">购买优惠</label><input v-model="editGroupForm.discount" class="apple-input" /></div>
          <div><label class="block text-sm mb-1 text-gray-600">采购网站</label><input v-model="editGroupForm.website" class="apple-input" /></div>
          <div><label class="block text-sm mb-1 text-gray-600">网站账户</label><input v-model="editGroupForm.websiteAccount" class="apple-input" /></div>
        </div>

          <div class="grid grid-cols-2 gap-3 mb-4">
            <div>
              <label class="block text-sm mb-1 text-gray-600">购买组总RMB</label>
              <div v-if="isDomesticEditGroup" class="text-warning font-semibold py-2">¥ {{ fmtNum(editGroupCalculatedTotalRMB) }}</div>
              <input v-else v-model.number="editGroupForm.totalRMB" type="number" class="apple-input" />
            </div>
            <div class="text-sm text-gray-500 flex items-end pb-2" v-if="editGroupForm.category === '日淘' || editGroupForm.category === '美淘'">
              实时汇率：100 {{ editGroupForm.category === '日淘' ? 'JPY' : 'USD' }} = {{ fmtNum(editGroupRate * 100) }} RMB
            </div>
          </div>

          <div class="border-t border-gray-200 pt-4 mb-4">
            <div class="flex justify-between items-center mb-2">
              <span class="font-medium">商品明细</span>
              <button class="text-primary text-sm" @click="addEditGroupLine"><i class="fa-solid fa-plus" /> 添加商品</button>
            </div>

            <div class="space-y-3">
              <div v-for="group in editGroupItemsBySid" :key="group.id" class="border rounded-lg p-3 bg-gray-50">
                <div class="grid grid-cols-12 gap-3 items-center mb-3">
                  <div class="col-span-3">
                    <label class="block text-xs text-gray-500 mb-1">品牌</label>
                    <select
                      v-model="group.items[0].brand"
                      class="apple-input text-sm"
                      @change="syncLineField(group.items[0], 'brand')"
                    ><option v-for="b in BRANDS" :key="b">{{ b }}</option></select>
                  </div>
                  <div class="col-span-8">
                    <label class="block text-xs text-gray-500 mb-1">颜色/车型 <span v-if="group.qty > 1" class="text-gray-400">(x{{ group.qty }})</span></label>
                    <input
                      v-model="group.items[0].name"
                      class="apple-input text-sm"
                      @input="syncLineField(group.items[0], 'name')"
                    />
                  </div>
                  <div class="col-span-1 flex justify-end pt-5">
                    <button class="text-danger text-sm" @click="removeEditGroupSid(group.sid)"><i class="fa-solid fa-trash" /></button>
                  </div>
                </div>

                <div :class="isDomesticEditGroup ? 'grid grid-cols-4 gap-3' : 'grid grid-cols-7 gap-3'">
                  <div :class="isDomesticEditGroup ? 'col-span-2' : ''">
                    <label class="block text-xs text-gray-500 mb-1">官网价 ({{ editGroupPriceUnit }})</label>
                    <input
                      v-model.number="group.items[0].originalPrice"
                      type="number"
                      class="apple-input text-sm"
                      @input="syncLineField(group.items[0], 'originalPrice')"
                    />
                  </div>

                  <template v-if="!isDomesticEditGroup">
                    <div>
                      <label class="block text-xs text-gray-500 mb-1">运费</label>
                      <input v-model.number="group.items[0].domesticShipping" type="number" class="apple-input text-sm" @input="syncLineField(group.items[0], 'domesticShipping')" />
                    </div>
                    <div>
                      <label class="block text-xs text-gray-500 mb-1">手续费</label>
                      <input v-model.number="group.items[0].fee" type="number" class="apple-input text-sm" @input="syncLineField(group.items[0], 'fee')" />
                    </div>
                    <div>
                      <label class="block text-xs text-gray-500 mb-1">系数</label>
                      <input v-model.number="group.items[0].transferCoefficient" type="number" class="apple-input text-sm" @input="syncLineField(group.items[0], 'transferCoefficient')" />
                    </div>
                    <div>
                      <label class="block text-xs text-gray-500 mb-1">在途成本</label>
                      <div class="h-9 flex items-center text-sm text-warning">{{ fmtMoney(group.items[0].preTransferCost) }}</div>
                    </div>
                  </template>

                  <div>
                    <label class="block text-xs text-gray-500 mb-1">库存数</label>
                    <div class="h-9 flex items-center text-sm text-gray-600">x{{ group.qty }}</div>
                  </div>
                  <div>
                    <label class="block text-xs text-gray-500 mb-1">状态</label>
                    <div class="h-9 flex items-center text-sm" :class="group.items[0].transferStatus === 'completed' ? 'text-blue-600' : 'text-gray-400'">{{ group.items[0].transferStatus === 'completed' ? '已转运' : '待转运' }}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

        <div class="flex justify-end gap-3">
          <button class="btn btn-outline" @click="showEditGroupModal = false">取消</button>
          <button class="btn btn-primary" @click="submitEditPurchaseGroup" :disabled="isSubmittingEditGroup">保存购买组</button>
        </div>
      </div>
    </div>

    <!-- 编辑弹窗 -->
    <div v-if="showEditModal" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 glass-modal">
      <div class="apple-card w-full max-w-md relative">
        <button class="absolute top-4 right-4 text-gray-400 hover:text-gray-800" @click="showEditModal = false"><i class="fa-solid fa-xmark text-xl" /></button>
        <h3 class="text-xl font-bold mb-6">编辑采购商品</h3>
        <div class="space-y-4">
          <div><label class="block text-sm mb-1 text-gray-600">名称</label><input v-model="editForm.name" class="apple-input" /></div>
          <div><label class="block text-sm mb-1 text-gray-600">品牌</label><select v-model="editForm.brand" class="apple-select"><option v-for="b in BRANDS" :key="b" :value="b">{{ b }}</option></select></div>
          <div><label class="block text-sm mb-1 text-gray-600">成本</label><input v-model.number="editForm.cost" type="number" class="apple-input" /></div>
        </div>
        <div class="mt-6 flex justify-end gap-3">
          <button class="btn btn-outline" @click="showEditModal = false">取消</button>
          <button class="btn btn-primary" @click="submitEdit">保存</button>
        </div>
      </div>
    </div>
  </div>
</template>
