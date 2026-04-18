<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { deleteItem, editItem, filterInventory, getInventoryStats, submitManualAdd } from './useInventory'
import { submitSell } from '../sales/useSales'
import { calcProfit } from '../../utils/calc'
import { addOperationLog, saveToLocalStorage, state as store } from '../../data/store'

const emit = defineEmits(['open-aging'])

const CATEGORY_OPTIONS = ['全部', '日淘', '美淘', '国内', '2025JAPAN']
const DEFAULT_BATCHES = {
  美淘: ['26下半年', '26上半年', 'B组下半年', 'B组上半年', 'A组下半年', 'A组上半年'],
  日淘: ['26h批', '26g批', '26f批', '26e批', '预订', 'd批', 'c批', 'b批', 'a批'],
  国内: ['MINIGT预定', 'Hotwheels预定', '国内现货', '代理预定', '苏州GTSHOW'],
  '2025JAPAN': ['2025JAPAN'],
}
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

const collapsedGroups = reactive({})
const inventoryViewMode = ref('batch')
const longTermFilter = ref('all')
const inventoryCollapseStorageKey = 'ysp_ui_inventory_collapse'
const inventoryViewModeStorageKey = 'ysp_ui_inventory_view_mode'
const inventoryLongTermFilterStorageKey = 'ysp_ui_inventory_long_term_filter'
const inventoryFilterModeStorageKey = 'ysp_ui_inventory_filter_mode'

const showAddModal = ref(false)
const showEditModal = ref(false)
const showLongTermModal = ref(false)
const showUnlistModal = ref(false)
const currentUnlistItem = ref(null)
const showSellModal = ref(false)
const currentSellItem = ref(null)
const sellForm = reactive({
  qty: 1,
  price: 0,
  express: 0,
  feeRate: 0,
  deduction: 0,
  date: new Date().toISOString().slice(0, 10),
})

const filters = reactive({
  category: '全部',
  batch: '全部',
  brand: '全部',
  keyword: '',
})

const addForm = reactive({
  name: '',
  brand: 'Hotwheels',
  category: '日淘',
  batch: '预订',
  cost: 0,
  qty: 1,
  isDefect: false,
})

const editForm = reactive({
  id: null,
  name: '',
  brand: '其它',
  category: '日淘',
  batch: '预订',
  isDefect: false,
  isLongTerm: false,
  cost: 0,
  isManual: false,
})

const invFilterMode = ref('all')

const longTermForm = reactive({
  category: '',
  batch: '',
  selectedSids: [],
})

const allBrands = computed(() => {
  const set = new Set(['Hotwheels', 'MINIGT', 'Tomica', 'TLV', 'Kyosho', '其它'])
  store.items.forEach((item) => {
    if (item?.brand) set.add(item.brand)
  })
  return ['全部', ...Array.from(set)]
})

const addNameSuggestions = computed(() => {
  const brand = normalizeBrand(addForm.brand)
  if (!brand) return []
  return Array.from(
    new Set(
      store.items
        .filter((item) => normalizeBrand(item?.brand) === brand)
        .map((item) => String(item?.name || '').trim())
        .filter(Boolean),
    ),
  )
})

const editNameSuggestions = computed(() => {
  const brand = normalizeBrand(editForm.brand)
  if (!brand) return []
  return Array.from(
    new Set(
      store.items
        .filter((item) => normalizeBrand(item?.brand) === brand)
        .map((item) => String(item?.name || '').trim())
        .filter(Boolean),
    ),
  )
})

const batchOptions = computed(() => {
  if (filters.category === '全部') return ['全部']
  return Array.from(
    new Set(
      store.items
        .filter((item) => item?.status === 'inventory' && item?.category === filters.category)
        .map((item) => item?.batch)
        .filter(Boolean),
    ),
  ).sort((a, b) => {
    const order = DEFAULT_BATCHES[filters.category] || []
    const ia = order.indexOf(a)
    const ib = order.indexOf(b)
    if (ia !== ib) return (ia >= 0 ? ia : 99) - (ib >= 0 ? ib : 99)
    return String(a).localeCompare(String(b), 'zh-CN')
  })
})

const addBatchOptions = computed(() => {
  const fallback = DEFAULT_BATCHES[addForm.category] || []
  const fromData = Array.from(
    new Set(
      store.items
        .filter((item) => item?.category === addForm.category)
        .map((item) => item?.batch)
        .filter(Boolean),
    ),
  )
  return Array.from(new Set([...fallback, ...fromData]))
})

const editBatchOptions = computed(() => {
  const fallback = DEFAULT_BATCHES[editForm.category] || []
  const fromData = Array.from(
    new Set(
      store.items
        .filter((item) => item?.category === editForm.category)
        .map((item) => item?.batch)
        .filter(Boolean),
    ),
  )
  return Array.from(new Set([...fallback, ...fromData]))
})

const longTermBatchOptions = computed(() => {
  if (!longTermForm.category) return []
  return Array.from(
    new Set(
      store.items
        .filter((i) => i.status === 'inventory' && i.category === longTermForm.category)
        .map((i) => i.batch)
        .filter(Boolean),
    ),
  )
})

const longTermSidItems = computed(() => {
  if (!longTermForm.category || !longTermForm.batch) return []
  const grouped = new Map()
  store.items
    .filter(
      (i) =>
        i.status === 'inventory' &&
        i.category === longTermForm.category &&
        i.batch === longTermForm.batch,
    )
    .forEach((i) => {
      const key = i.sid || String(i.id)
      if (!grouped.has(key)) {
        grouped.set(key, { sid: i.sid, name: i.name, qty: 0, cost: i.cost, ids: [], hasLongTerm: false })
      }
      const g = grouped.get(key)
      g.ids.push(i.id)
      g.qty++
      if (i.isLongTerm) g.hasLongTerm = true
    })
  return Array.from(grouped.values())
})

watch(
  () => filters.category,
  () => {
    filters.batch = '全部'
  },
)

watch(
  () => addForm.category,
  () => {
    addForm.batch = addBatchOptions.value[0] || ''
  },
)

watch(
  () => longTermForm.category,
  () => {
    longTermForm.batch = ''
    longTermForm.selectedSids = []
  },
)

watch(
  () => longTermForm.batch,
  () => {
    longTermForm.selectedSids = longTermSidItems.value.filter((g) => g.hasLongTerm).map((g) => g.sid)
  },
)

const inventoryItems = computed(() => {
  const result = filterInventory(store.items, {
    status: 'inventory',
    category: filters.category !== '全部' ? filters.category : undefined,
    batch: filters.batch !== '全部' ? filters.batch : undefined,
    brand: filters.brand !== '全部' ? filters.brand : undefined,
    keyword: filters.keyword || undefined,
  })
  const ltMode = longTermFilter.value !== 'all' ? longTermFilter.value : invFilterMode.value
  if (ltMode === 'long' || ltMode === 'longterm') return result.filter((i) => i?.isLongTerm === true)
  if (ltMode === 'short' || ltMode === 'shortterm') return result.filter((i) => i?.isLongTerm !== true)
  return result
})

const groupedInventory = computed(() => {
  const map = new Map()
  const categoryOrder = CATEGORY_ORDER

  const mergeItemsBySidName = (list = []) => {
    const merged = new Map()
    list.forEach((item) => {
      const key = `${item?.sid || ''}|${item?.name || ''}`
      if (!merged.has(key)) {
        merged.set(key, {
          ...item,
          qty: 1,
          itemIds: [item.id],
          totalCost: Number(item?.cost || 0),
          longTermCount: item?.isLongTerm ? 1 : 0,
          longTermValue: item?.isLongTerm ? Number(item?.cost || 0) : 0,
          defectCount: item?.isDefect ? 1 : 0,
          defectValue: item?.isDefect ? Number(item?.cost || 0) : 0,
        })
        return
      }

      const g = merged.get(key)
      g.qty += 1
      g.itemIds.push(item.id)
      g.totalCost += Number(item?.cost || 0)
      if (item?.isLongTerm) {
        g.longTermCount += 1
        g.longTermValue += Number(item?.cost || 0)
      }
      if (item?.isDefect) {
        g.defectCount += 1
        g.defectValue += Number(item?.cost || 0)
      }
      if (item?.isLongTerm) g.isLongTerm = true
      if (item?.isDefect) g.isDefect = true
    })
    return Array.from(merged.values())
  }

  inventoryItems.value.forEach((item) => {
    const key =
      inventoryViewMode.value === 'all'
        ? 'all__all'
        : inventoryViewMode.value === 'category'
          ? `${item.category || '未分类'}__cat`
          : inventoryViewMode.value === 'brand'
            ? `${item.brand || '未分类品牌'}__brand`
            : `${item.category || '未分类'}__${item.batch || '未分批'}`
    if (!map.has(key)) {
      map.set(key, {
        key,
        category:
          inventoryViewMode.value === 'all'
            ? '全列表'
            : inventoryViewMode.value === 'category'
            ? item.category || '未分类'
            : inventoryViewMode.value === 'brand'
              ? item.brand || '未分类品牌'
              : item.category || '未分类',
        batch:
          inventoryViewMode.value === 'all'
            ? '全部'
            : inventoryViewMode.value === 'category'
              ? '按大类'
              : inventoryViewMode.value === 'brand'
                ? '按品牌'
                : item.batch || '未分批',
        items: [],
      })
    }
    map.get(key).items.push(item)
  })

  const list = Array.from(map.values()).map((group) => ({
    ...group,
    items: mergeItemsBySidName(group.items),
  }))
  if (inventoryViewMode.value === 'batch') {
    return list.sort((a, b) => {
      const c1 = categoryRank(a.category)
      const c2 = categoryRank(b.category)
      if (c1 !== c2) return c1 - c2
      const br1 = batchRank(a.category, a.batch)
      const br2 = batchRank(b.category, b.batch)
      if (br1 !== br2) return br1 - br2
      return String(a.batch).localeCompare(String(b.batch), 'zh-CN')
    })
  }
  if (inventoryViewMode.value === 'category') {
    return list.sort((a, b) => {
      const c1 = categoryRank(a.category)
      const c2 = categoryRank(b.category)
      if (c1 !== c2) return c1 - c2
      return String(a.category).localeCompare(String(b.category), 'zh-CN')
    })
  }
  if (inventoryViewMode.value === 'brand') {
    return list.sort((a, b) => {
      const r1 = brandRank(a.category)
      const r2 = brandRank(b.category)
      if (r1 !== r2) return r1 - r2
      return String(a.category).localeCompare(String(b.category), 'zh-CN')
    })
  }
  return list.sort((a, b) => String(a.batch).localeCompare(String(b.batch), 'zh-CN'))
})


const stats = computed(() => getInventoryStats(store.items))

function getSellableItemIds(item) {
  if (!item) return []
  if (Array.isArray(item.itemIds) && item.itemIds.length) return item.itemIds
  return item.id ? [item.id] : []
}

const maxSellQty = computed(() => {
  if (!currentSellItem.value) return 1
  return getSellableItemIds(currentSellItem.value).length || Number(currentSellItem.value.qty || 1)
})

const selectedSellItemIds = computed(() => {
  if (!currentSellItem.value) return []
  const allIds = getSellableItemIds(currentSellItem.value)
  const n = Math.max(1, Math.min(Number(sellForm.qty || 1), allIds.length || 1))
  return allIds.slice(0, n)
})

const selectedSellCost = computed(() =>
  selectedSellItemIds.value.reduce((sum, id) => {
    const item = store.items.find((x) => x.id === id)
    return sum + Number(item?.cost || 0)
  }, 0),
)

const calculatedProfit = computed(() => {
  if (!currentSellItem.value) return 0
  return calcProfit(
    Number(sellForm.price || 0),
    Number(sellForm.express || 0),
    Number(sellForm.feeRate || 0),
    Number(sellForm.deduction || 0),
    Number(selectedSellCost.value || 0),
  )
})

function fmtMoney(v) {
  return Number(v || 0).toFixed(2)
}

function fmtNum(v) {
  return Number(v || 0).toFixed(2)
}

function toggleGroup(key) {
  collapsedGroups[key] = !collapsedGroups[key]
}

function expandAllGroups() {
  groupedInventory.value.forEach((g) => {
    collapsedGroups[g.key] = false
  })
}

function collapseAllGroups() {
  groupedInventory.value.forEach((g) => {
    collapsedGroups[g.key] = true
  })
}

function openLongTermModal() {
  longTermForm.category = ''
  longTermForm.batch = ''
  longTermForm.selectedSids = []
  showLongTermModal.value = true
}

function canUnlist(item) {
  if (!item) return false
  // 手工新增库存始终只能删除，不能下架回采购
  if (item.isManual === true) return false

  // 国内采购商品无转运链路，也应允许“下架回采购”
  if (item?.category === '国内') return true

  // 其他分类沿用转运链路判断
  return Boolean(
    item?.purchaseDetails?.transferBatch ||
      item?.purchaseDetails?.transferId ||
      Number(item?.purchaseDetails?.transferCost || 0) > 0,
  )
}

function submitLongTermMark() {
  if (!longTermForm.category || !longTermForm.batch) {
    alert('请先选择大类和批次')
    return
  }
  const sidSet = new Set(longTermForm.selectedSids)
  const target = store.items.filter(
    (i) => i.status === 'inventory' && i.category === longTermForm.category && i.batch === longTermForm.batch,
  )
  target.forEach((item) => {
    item.isLongTerm = sidSet.has(item.sid)
  })
  saveToLocalStorage()
  addOperationLog('inventory_long_term', `长线库存`, {
    category: longTermForm.category,
    batch: longTermForm.batch,
    count: longTermForm.selectedSids.length,
  })
  showLongTermModal.value = false
}

function openAdd() {
  addForm.name = ''
  addForm.brand = 'Hotwheels'
  addForm.category = '日淘'
  addForm.batch = '预订'
  addForm.cost = 0
  addForm.qty = 1
  addForm.isDefect = false
  showAddModal.value = true
}

function submitAdd() {
  submitManualAdd({
    name: addForm.name,
    brand: addForm.brand,
    category: addForm.category,
    batch: addForm.batch,
    cost: Number(addForm.cost || 0),
    stock: 1,
    isDefect: addForm.isDefect,
    isLongTerm: false,
    qty: Number(addForm.qty || 1),
  })
  showAddModal.value = false
}

function openEdit(item) {
  editForm.id = item.id
  editForm.name = item.name
  editForm.brand = item.brand
  editForm.category = item.category
  editForm.batch = item.batch
  editForm.isDefect = !!item.isDefect
  editForm.isLongTerm = !!item.isLongTerm
  editForm.cost = Number(item.cost || 0)
  editForm.isManual = !!item.isManual
  showEditModal.value = true
}

function submitEdit() {
  editItem(editForm.id, {
    name: editForm.name,
    brand: editForm.brand,
    category: editForm.category,
    batch: editForm.batch,
    isDefect: editForm.isDefect,
    isLongTerm: editForm.isLongTerm,
    ...(editForm.isManual ? { cost: editForm.cost } : {}),
  })
  showEditModal.value = false
}

function openUnlist(item) {
  currentUnlistItem.value = item
  showUnlistModal.value = true
}

function getUnlistScope(item) {
  if (!item) return 'current'
  return item?.purchaseDetails?.transferId || item?.purchaseDetails?.transferBatch ? 'transfer' : 'current'
}

function getCurrentRowItems(item) {
  if (!item) return []
  const itemIds = Array.isArray(item?.itemIds) ? item.itemIds : []
  if (itemIds.length > 0) {
    const idSet = new Set(itemIds)
    const rows = store.items.filter((x) => idSet.has(x?.id))
    if (rows.length > 0) return rows
  }
  if (item?.id != null) {
    const row = store.items.find((x) => x?.id === item.id)
    if (row) return [row]
  }
  return []
}

function getUnlistLinkedItems(item) {
  if (!item) return []
  const transferId = item?.purchaseDetails?.transferId
  const transferBatch = item?.purchaseDetails?.transferBatch

  if (transferId) {
    return store.items.filter((x) => x?.purchaseDetails?.transferId === transferId)
  }

  if (transferBatch) {
    return store.items.filter(
      (x) =>
        x?.category === item?.category &&
        x?.batch === item?.batch &&
        x?.purchaseDetails?.transferBatch === transferBatch,
    )
  }

  return getCurrentRowItems(item)
}

const isTransferUnlist = computed(() => getUnlistScope(currentUnlistItem.value) === 'transfer')

const unlistPreviewItems = computed(() => {
  const item = currentUnlistItem.value
  if (!item) return []
  const linkedItems = getUnlistLinkedItems(item)
  const inventoryItems = linkedItems.filter((x) => x?.status === 'inventory')
  return inventoryItems.length > 0 ? inventoryItems : [item]
})

function buildSoldDetailsText(items = []) {
  return items
    .slice(0, 12)
    .map((x) => {
      const d = x?.saleDetails?.date || '-'
      const p = Number(x?.saleDetails?.price || 0).toFixed(2)
      return `- ${x?.sid || '-'} | ${x?.name || '-'} | ${d} | ¥${p}`
    })
    .join('\n')
}

function buildUnlistTargetDetailsText(items = []) {
  return items
    .slice(0, 12)
    .map((x) => `- ${x?.sid || '-'} | ${x?.name || '-'} | ¥${Number(x?.cost || 0).toFixed(2)}`)
    .join('\n')
}

function submitUnlist() {
  const item = currentUnlistItem.value
  if (!item) return

  const linkedItems = getUnlistLinkedItems(item)
  const scope = getUnlistScope(item)
  const soldItems = linkedItems.filter((x) => x?.status === 'sold')
  if (soldItems.length > 0) {
    const details = buildSoldDetailsText(soldItems)
    const more = soldItems.length > 12 ? `\n... 另有 ${soldItems.length - 12} 件` : ''
    const scopeLabel = scope === 'transfer' ? '当前转运批次中' : '当前条目中'
    alert(
      `${scopeLabel}有 ${soldItems.length} 件已售出，无法批量下架。\n\n请先在“销售记账”中将这些商品手动回滚到库存后再下架：\n${details}${more}`,
    )
    return
  }

  const inventoryItems = linkedItems.filter((x) => x?.status === 'inventory')
  const targetItems = inventoryItems
  if (targetItems.length === 0) {
    alert('未找到可下架的库存记录，请刷新后重试')
    return
  }

  const preview = buildUnlistTargetDetailsText(targetItems)
  const more = targetItems.length > 12 ? `\n... 另有 ${targetItems.length - 12} 件` : ''
  const actionText =
    scope === 'transfer' ? '将同转运批次商品一起下架回采购' : '将当前条目商品下架回采购'
  const ok = confirm(
    `${actionText}（共 ${targetItems.length} 件）：\n${preview}${more}\n\n确认继续？`,
  )
  if (!ok) return

  targetItems.forEach((x) => {
    x.status = 'purchase'
    x.isLongTerm = false
    if (!x.purchaseDetails) x.purchaseDetails = {}
    x.purchaseDetails.transferStatus = 'completed'
    x.unlistDetails = {
      reason: scope === 'transfer' ? '同转运批次下架' : '当前条目下架',
      date: new Date().toISOString().slice(0, 10),
    }
  })

  saveToLocalStorage()
  addOperationLog('inventory_unlist', `${scope === 'transfer' ? '批量' : '当前条目'}下架回采购: ${item.name}`, {
    sid: item.sid,
    transferId: item?.purchaseDetails?.transferId,
    transferBatch: item?.purchaseDetails?.transferBatch,
    count: targetItems.length,
  })
  showUnlistModal.value = false
  currentUnlistItem.value = null
}

function remove(item) {
  deleteItem(item.id)
}

function openSellModal(item) {
  currentSellItem.value = item
  sellForm.qty = 1
  sellForm.price = 0
  sellForm.express = 0
  sellForm.feeRate = 0
  sellForm.deduction = 0
  sellForm.date = new Date().toISOString().slice(0, 10)
  showSellModal.value = true
}

function submitSellItem() {
  if (!currentSellItem.value) return
  const itemIds = selectedSellItemIds.value
  if (itemIds.length === 0) return

  const soldItems = []
  itemIds.forEach((id, idx) => {
    const qty = Number(itemIds.length || 1)
    const avgPrice = Number(sellForm.price || 0) / qty
    const soldItem = submitSell(id, {
      price: idx === itemIds.length - 1
        ? Number(sellForm.price || 0) - avgPrice * (itemIds.length - 1)
        : avgPrice,
      express: idx === 0 ? Number(sellForm.express || 0) : 0,
      feeRate: Number(sellForm.feeRate || 0),
      deduction: idx === 0 ? Number(sellForm.deduction || 0) : 0,
      date: sellForm.date,
    }, { skipLog: true })
    if (soldItem) soldItems.push(soldItem)
  })

  const logMap = new Map()
  soldItems.forEach((item) => {
    const sid = String(item?.sid || '').trim()
    if (!sid) return
    if (!logMap.has(sid)) {
      logMap.set(sid, {
        sid,
        name: item?.name || '未命名商品',
        qty: 0,
        price: 0,
      })
    }
    const g = logMap.get(sid)
    g.qty += 1
    g.price += Number(item?.saleDetails?.price || 0)
  })

  logMap.forEach((g) => {
    addOperationLog('inventory_sales_sync', `同步销售记录: ${g.name} x${g.qty}`, {
      sid: g.sid,
      qty: g.qty,
      price: g.price,
    })
  })

  saveToLocalStorage()

  showSellModal.value = false
  currentSellItem.value = null
}

function getBatchesByCategory(cat) {
  return DEFAULT_BATCHES[cat] || []
}

onMounted(() => {
  try {
    const collapsedRaw = localStorage.getItem(inventoryCollapseStorageKey)
    if (collapsedRaw) Object.assign(collapsedGroups, JSON.parse(collapsedRaw))

    const viewModeRaw = localStorage.getItem(inventoryViewModeStorageKey)
    if (viewModeRaw && ['all', 'category', 'batch', 'brand'].includes(viewModeRaw)) {
      inventoryViewMode.value = viewModeRaw
    }

    const ltFilterRaw = localStorage.getItem(inventoryLongTermFilterStorageKey)
    if (ltFilterRaw && ['all', 'short', 'long'].includes(ltFilterRaw)) {
      longTermFilter.value = ltFilterRaw
    }

    const filterModeRaw = localStorage.getItem(inventoryFilterModeStorageKey)
    if (filterModeRaw && ['all', 'shortterm', 'longterm'].includes(filterModeRaw)) {
      invFilterMode.value = filterModeRaw
    }
  } catch (_) {
    // ignore invalid cache
  }
})

watch(
  collapsedGroups,
  (val) => {
    localStorage.setItem(inventoryCollapseStorageKey, JSON.stringify(val))
  },
  { deep: true },
)

watch(inventoryViewMode, (val) => {
  localStorage.setItem(inventoryViewModeStorageKey, val)
})

watch(longTermFilter, (val) => {
  localStorage.setItem(inventoryLongTermFilterStorageKey, val)
})

watch(invFilterMode, (val) => {
  localStorage.setItem(inventoryFilterModeStorageKey, val)
})
</script>

<template>
  <div class="space-y-6">
    <!-- 页面标题 -->
    <div class="flex items-center justify-between">
      <div class="flex items-baseline gap-3">
        <h2 class="text-3xl font-extrabold">库存管理</h2>
        <span class="text-base text-gray-400 font-light">Inventory Management</span>
      </div>
      <div class="flex gap-2">
        <button class="btn btn-outline btn-sm" @click="openAdd">
          <i class="fa-solid fa-bolt" /> 手动快速入库
        </button>
        <button class="btn btn-purple btn-sm" @click="openLongTermModal">
          <i class="fa-solid fa-inbox" /> 标记长线库存
        </button>
      </div>
    </div>

    <!-- 统计卡片 -->
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <div class="bg-gray-50 p-4 rounded-xl border-l-4 border-gray-400">
        <div class="text-xs text-gray-500 mb-1">总件数</div>
        <div class="text-2xl font-bold text-gray-800">{{ stats.totalInventoryCount }}</div>
      </div>
      <div class="bg-gray-50 p-4 rounded-xl border-l-4 border-blue-500">
        <div class="text-xs text-gray-500 mb-1">总货値</div>
        <div class="text-2xl font-bold text-gray-800">{{ stats.totalInventoryValue.toFixed(2) }}</div>
      </div>
      <div class="bg-gray-50 p-4 rounded-xl border-l-4 border-purple-500">
        <div class="text-xs text-gray-500 mb-1">长线库存</div>
        <div class="text-2xl font-bold text-purple-700">{{ stats.longTermCount }} <span class="text-sm font-normal text-gray-500">件</span></div>
        <div class="text-xs text-gray-500 mt-1">总货值 {{ fmtMoney(stats.longTermValue) }}</div>
      </div>
      <div class="bg-gray-50 p-4 rounded-xl border-l-4 border-red-500">
        <div class="text-xs text-gray-500 mb-1">残次品</div>
        <div class="text-2xl font-bold text-red-600">{{ stats.defectCount }} <span class="text-sm font-normal text-gray-500">件</span></div>
      </div>
    </div>

    <!-- 筛选/视图控制 -->
    <div class="apple-card overflow-visible p-4 flex flex-col gap-4">
      <div class="flex gap-4 items-center">
        <select v-model="filters.category" class="apple-select py-1.5 w-32">
          <option value="全部">所有大类</option>
          <option v-for="c in CATEGORY_OPTIONS.filter(x => x !== '全部')" :key="c" :value="c">{{ c }}</option>
        </select>
        <select v-model="filters.batch" class="apple-select py-1.5 w-32">
          <option value="全部">所有批次</option>
          <option v-for="b in batchOptions.filter(x => x !== '全部')" :key="b" :value="b">{{ b }}</option>
        </select>
        <input v-model="filters.keyword" placeholder="搜索名称、SID..." class="apple-input py-1.5 w-64 text-sm" />
      </div>
      <div class="flex items-center justify-between gap-3 border-t border-gray-100 pt-4">
        <div class="flex flex-wrap gap-2">
          <button
            class="px-3 py-1 text-xs rounded-full transition"
            :class="invFilterMode==='all' ? '' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'"
            :style="invFilterMode==='all' ? { backgroundColor: '#f3e8ff', color: '#7e22ce' } : {}"
            @click="invFilterMode='all'; longTermFilter='all'"
          >长短线</button>
          <button
            class="px-3 py-1 text-xs rounded-full transition"
            :class="invFilterMode==='longterm' ? '' : 'bg-purple-100 text-purple-600 hover:bg-purple-200'"
            :style="invFilterMode==='longterm' ? { backgroundColor: '#f3e8ff', color: '#7e22ce' } : {}"
            @click="invFilterMode='longterm'; longTermFilter='long'"
          >仅长线</button>
          <button
            class="px-3 py-1 text-xs rounded-full transition"
            :class="invFilterMode==='shortterm' ? '' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'"
            :style="invFilterMode==='shortterm' ? { backgroundColor: '#f3e8ff', color: '#7e22ce' } : {}"
            @click="invFilterMode='shortterm'; longTermFilter='short'"
          >仅短线</button>
          <span class="border-l border-gray-300 mx-1"></span>
          <button class="px-3 py-1 text-xs rounded-full transition" :class="inventoryViewMode==='all' ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'" @click="inventoryViewMode='all'">全列表</button>
          <button class="px-3 py-1 text-xs rounded-full transition" :class="inventoryViewMode==='category' ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'" @click="inventoryViewMode='category'">按大类</button>
          <button class="px-3 py-1 text-xs rounded-full transition" :class="inventoryViewMode==='batch' ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'" @click="inventoryViewMode='batch'">按批次</button>
          <button class="px-3 py-1 text-xs rounded-full transition" :class="inventoryViewMode==='brand' ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'" @click="inventoryViewMode='brand'">按品牌</button>
        </div>
        <div class="flex gap-2 shrink-0">
          <button class="btn btn-outline btn-xs" @click="emit('open-aging')"><i class="fa-solid fa-hourglass-half mr-1"></i>库存账龄</button>
          <button class="btn btn-outline btn-xs" @click="expandAllGroups">展开全部</button>
          <button class="btn btn-outline btn-xs" @click="collapseAllGroups">折叠全部</button>
        </div>
      </div>
    </div>

    <!-- 库存列表 -->
    <div class="apple-card p-0 overflow-hidden">
      <div v-if="groupedInventory.length === 0" class="p-6 text-sm text-gray-400 text-center">
        <i class="fa-solid fa-inbox text-3xl mb-2 block"></i>暂无库存商品
      </div>

      <div v-else class="px-4 py-2 bg-gray-50 border-b border-gray-100 text-xs text-gray-500 font-medium">
        <div class="grid grid-cols-[90px_140px_1fr_120px_170px_120px_80px_160px] gap-3 items-center">
          <div>状态</div>
          <div>SID</div>
          <div>名称/品相</div>
          <div>品牌</div>
          <div>大类/批次</div>
          <div>单品成本</div>
          <div>数量</div>
          <div>操作</div>
        </div>
      </div>

      <div v-for="group in groupedInventory" :key="group.key" class="border-b border-gray-100 last:border-b-0">
        <div class="group-header-row flex items-center px-4 py-3 cursor-pointer" @click="toggleGroup(group.key)">
          <span class="cursor-pointer mr-2">
            <i :class="collapsedGroups[group.key] ? 'fa-solid fa-chevron-right' : 'fa-solid fa-chevron-down'" />
          </span>
          <span>{{ inventoryViewMode === 'all' ? '全列表' : (inventoryViewMode === 'batch' ? `${group.category} / ${group.batch}` : group.category) }}</span>
          <span class="ml-2 text-gray-500 font-normal">共 {{ group.items.reduce((s,i)=>s+Number(i.qty||1),0) }} 件</span>
          <span class="ml-4 text-primary font-normal">总货值: {{ fmtMoney(group.items.reduce((s,i)=>s+Number(i.totalCost || i.cost || 0),0)) }}</span>
          <span v-if="group.items.reduce((s,i)=>s+Number(i.longTermCount || (i.isLongTerm ? (i.qty||1) : 0)),0) > 0" class="ml-4 text-purple-500 font-normal">其中长线库存 {{ group.items.reduce((s,i)=>s+Number(i.longTermCount || (i.isLongTerm ? (i.qty||1) : 0)),0) }} 件 {{ fmtMoney(group.items.reduce((s,i)=>s+Number(i.longTermValue || (i.isLongTerm ? (i.totalCost || i.cost || 0) : 0)),0)) }}</span>
          <span v-if="group.items.reduce((s,i)=>s+Number(i.defectCount || (i.isDefect ? (i.qty||1) : 0)),0) > 0" class="ml-4 text-red-500 font-normal">残次品 {{ group.items.reduce((s,i)=>s+Number(i.defectCount || (i.isDefect ? (i.qty||1) : 0)),0) }} 件 {{ fmtMoney(group.items.reduce((s,i)=>s+Number(i.defectValue || (i.isDefect ? (i.totalCost || i.cost || 0) : 0)),0)) }}</span>
        </div>

        <div v-show="collapsedGroups[group.key] !== true" class="overflow-x-auto">
          <table class="apple-table min-w-full text-sm">
            <thead>
              <tr>
                <th>状态</th>
                <th>SID</th>
                <th>名称/品相</th>
                <th>品牌</th>
                <th>大类/批次</th>
                <th class="w-28">单品成本</th>
                <th>数量</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in group.items" :key="item.id" :style="item.isLongTerm ? {backgroundColor: '#f3e8ff'} : {}">
                <td><span v-if="item.isDefect" class="text-xs bg-danger text-white px-2 py-0.5 rounded">残次品</span><span v-else class="text-xs bg-success text-white px-2 py-0.5 rounded">正常</span></td>
                <td class="text-xs text-gray-400 font-mono">{{ item.sid }}</td>
                <td class="font-medium">{{ item.name }}<span v-if="item.isLongTerm" class="ml-1 text-xs bg-purple-500 text-white px-1 rounded">长线</span></td>
                <td>{{ item.brand }}</td>
                <td><span class="bg-gray-100 px-2 py-1 rounded text-xs">{{ item.category }}</span> {{ item.batch }}</td>
                <td class="font-semibold text-primary w-24">{{ fmtMoney(item.cost) }}</td>
                <td><span class="bg-primary/10 text-primary px-2 py-1 rounded font-semibold">{{ item.qty || 1 }}</span></td>
                <td class="flex gap-1">
                  <button @click="openSellModal(item)" class="btn btn-primary" style="font-size:10px; padding:2px 7px; line-height:1.25;">售出</button>
                  <button @click="openEdit(item)" class="btn btn-outline" style="font-size:10px; padding:2px 6px; line-height:1.25;"><i class="fa-solid fa-pen"></i></button>
                  <button v-if="canUnlist(item)" @click="openUnlist(item)" class="btn btn-warning text-white" style="font-size:10px; padding:2px 7px; line-height:1.25;">下架</button>
                  <button v-else @click="remove(item)" class="btn btn-danger text-white" style="font-size:10px; padding:2px 7px; line-height:1.25;">删除</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- 手动快速入库弹窗 -->
    <div v-if="showAddModal" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 glass-modal">
      <div class="apple-card w-full max-w-md relative">
        <button class="absolute top-4 right-4 text-gray-400 hover:text-gray-800" @click="showAddModal = false">
          <i class="fa-solid fa-xmark text-xl" />
        </button>
        <h3 class="text-xl font-bold mb-6">手动快速入库</h3>
        <div class="space-y-4">
          <div class="grid grid-cols-3 gap-4">
            <div>
              <label class="block text-sm mb-1 text-gray-600">品牌</label>
              <select v-model="addForm.brand" class="apple-select h-11">
                <option v-for="b in allBrands.filter(x => x !== '全部')" :key="b">{{ b }}</option>
              </select>
            </div>
            <div>
              <label class="block text-sm mb-1 text-gray-600">大类</label>
              <select v-model="addForm.category" class="apple-select h-11">
                <option v-for="c in CATEGORY_OPTIONS.filter(x => x !== '全部')" :key="c">{{ c }}</option>
              </select>
            </div>
            <div>
              <label class="block text-sm mb-1 text-gray-600">批次</label>
              <select v-model="addForm.batch" class="apple-select h-11">
                <option v-for="b in addBatchOptions" :key="b">{{ b }}</option>
              </select>
            </div>
            <div class="col-span-2">
              <label class="block text-sm mb-1 text-gray-600">名称/颜色</label>
              <input
                type="text"
                v-model="addForm.name"
                class="apple-input"
                list="addBrandNamesList"
                placeholder="选择品牌后联想输入车辆名称颜色"
              />
            </div>
            <div>
              <label class="block text-sm mb-1 text-gray-600">数量</label>
              <input type="number" v-model.number="addForm.qty" class="apple-input" min="1" />
            </div>
            <div class="col-span-2">
              <label class="block text-sm mb-1 text-gray-600">入库成本(RMB)</label>
              <input type="number" v-model.number="addForm.cost" class="apple-input" />
            </div>
          </div>
          <div class="flex items-center gap-2">
            <input type="checkbox" v-model="addForm.isDefect" id="addIsDefect" class="w-4 h-4 text-primary" />
            <label for="addIsDefect" class="text-sm text-gray-600">标记为残次品</label>
          </div>
        </div>
        <div class="mt-8 flex justify-end gap-3">
          <button class="btn btn-outline" @click="showAddModal = false">取消</button>
          <button class="btn btn-primary" @click="submitAdd">确认</button>
        </div>
        <datalist id="addBrandNamesList"><option v-for="n in addNameSuggestions" :key="n" :value="n" /></datalist>
      </div>
    </div>

    <!-- 编辑商品弹窗 -->
    <div v-if="showEditModal" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 glass-modal">
      <div class="apple-card w-full max-w-md relative">
        <button class="absolute top-4 right-4 text-gray-400 hover:text-gray-800" @click="showEditModal = false">
          <i class="fa-solid fa-xmark text-xl" />
        </button>
        <h3 class="text-xl font-bold mb-6">编辑商品</h3>
        <div class="space-y-4">
          <div>
            <label class="block text-sm mb-1 text-gray-600">名称/颜色</label>
              <input type="text" v-model="editForm.name" class="apple-input" list="editBrandNamesList" placeholder="选择品牌后联想输入车辆名称颜色" />
          </div>
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm mb-1 text-gray-600">大类</label>
              <select v-model="editForm.category" class="apple-select">
                <option v-for="c in CATEGORY_OPTIONS.filter(x => x !== '全部')" :key="c">{{ c }}</option>
              </select>
            </div>
            <div>
              <label class="block text-sm mb-1 text-gray-600">批次</label>
              <select v-model="editForm.batch" class="apple-select">
                <option v-for="b in editBatchOptions" :key="b">{{ b }}</option>
              </select>
            </div>
            <div>
              <label class="block text-sm mb-1 text-gray-600">品牌</label>
              <select v-model="editForm.brand" class="apple-select">
                <option v-for="b in allBrands.filter(x => x !== '全部')" :key="b">{{ b }}</option>
              </select>
            </div>
            <div v-if="editForm.isManual">
              <label class="block text-sm mb-1 text-gray-600">成本(RMB)</label>
              <input type="number" step="0.01" v-model.number="editForm.cost" class="apple-input" />
            </div>
            <div v-else>
              <label class="block text-sm mb-1 text-gray-600">成本(RMB)</label>
              <div class="apple-input bg-gray-100 text-gray-700 py-2 px-3">¥ {{ fmtNum(editForm.cost) }}</div>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <input type="checkbox" v-model="editForm.isDefect" id="editIsDefect" class="w-4 h-4 text-primary" />
            <label for="editIsDefect" class="text-sm text-gray-600">标记为残次品</label>
          </div>
        </div>
        <div class="mt-8 flex justify-end gap-3">
          <button class="btn btn-outline" @click="showEditModal = false">取消</button>
          <button class="btn btn-primary" @click="submitEdit">保存</button>
        </div>
        <datalist id="editBrandNamesList"><option v-for="n in editNameSuggestions" :key="n" :value="n" /></datalist>
      </div>
    </div>

    <!-- 下架确认弹窗 -->
    <div v-if="showUnlistModal" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 glass-modal">
      <div class="apple-card w-full max-w-sm relative">
        <button class="absolute top-4 right-4 text-gray-400 hover:text-gray-800" @click="showUnlistModal = false">
          <i class="fa-solid fa-xmark text-xl" />
        </button>
        <h3 class="text-xl font-bold mb-6">下架商品</h3>
        <div class="bg-yellow-50 p-4 rounded-xl mb-4">
          <div class="text-sm text-yellow-800 font-medium">{{ currentUnlistItem?.name }}</div>
          <div class="text-xs text-yellow-600 mt-1">数量: {{ currentUnlistItem?.qty || 1 }} 件</div>
          <div class="text-xs text-yellow-600">{{ isTransferUnlist ? '下架后将按同转运批次批量移回采购（已转运状态）' : '下架后将仅移回当前条目对应商品到采购（已转运状态）' }}</div>
        </div>
        <div class="border border-yellow-200 rounded-lg p-3 bg-yellow-50/60 mb-4" v-if="unlistPreviewItems.length">
          <div class="text-xs text-yellow-800 mb-2">将一起下架（共 {{ unlistPreviewItems.length }} 件）</div>
          <div class="max-h-36 overflow-y-auto space-y-1 text-xs text-yellow-700">
            <div v-for="x in unlistPreviewItems" :key="x.id" class="flex justify-between gap-2">
              <span class="truncate">{{ x.sid || '-' }} | {{ x.name || '-' }}</span>
              <span class="shrink-0">¥{{ fmtMoney(x.cost || 0) }}</span>
            </div>
          </div>
        </div>
        <div class="flex justify-end gap-3">
          <button class="btn btn-outline" @click="showUnlistModal = false">取消</button>
          <button class="btn btn-warning" @click="submitUnlist">确认下架</button>
        </div>
      </div>
    </div>

    <!-- 长线库存标记弹窗 -->
    <div v-if="showLongTermModal" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 glass-modal">
      <div class="apple-card w-full max-w-md relative">
        <button class="absolute top-4 right-4 text-gray-400 hover:text-gray-800" @click="showLongTermModal = false">
          <i class="fa-solid fa-xmark text-xl" />
        </button>
        <h3 class="text-xl font-bold mb-6">标记长线库存</h3>
        <div class="space-y-4">
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm mb-1 text-gray-600">大类</label>
              <select v-model="longTermForm.category" class="apple-select">
                <option value="">请选择</option>
                <option v-for="c in CATEGORY_OPTIONS.filter(x => x !== '全部')" :key="c">{{ c }}</option>
              </select>
            </div>
            <div>
              <label class="block text-sm mb-1 text-gray-600">批次</label>
              <select v-model="longTermForm.batch" class="apple-select" :disabled="!longTermForm.category">
                <option value="">请选择</option>
                <option v-for="b in longTermBatchOptions" :key="b">{{ b }}</option>
              </select>
            </div>
          </div>
          <div v-if="longTermForm.category && longTermForm.batch" class="border rounded-lg max-h-60 overflow-y-auto">
            <div class="text-sm text-gray-600 p-2 bg-gray-50 border-b">选择商品（同一SID商品将一起标记）</div>
            <div v-if="longTermSidItems.length === 0" class="text-center text-gray-400 py-4">该批次暂无库存商品</div>
            <div v-else v-for="group in longTermSidItems" :key="group.sid" class="flex items-center gap-2 p-2 hover:bg-gray-50">
              <input type="checkbox" :value="group.sid" v-model="longTermForm.selectedSids" class="w-4 h-4 text-purple-500" />
              <span class="text-sm">{{ group.name }} <span class="text-xs text-purple-500">x{{ group.qty }}</span> <span class="text-xs text-gray-400">¥{{ fmtNum(group.cost) }}/件</span></span>
            </div>
          </div>
        </div>
        <div class="mt-6 flex justify-end gap-3">
          <button class="btn btn-outline" @click="showLongTermModal = false">取消</button>
          <button class="btn btn-purple" @click="submitLongTermMark">确认更新</button>
        </div>
      </div>
    </div>

    <!-- 售出弹窗 -->
    <div v-if="showSellModal" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 glass-modal">
      <div class="apple-card w-full max-w-sm relative">
        <button @click="showSellModal = false" class="absolute top-4 right-4 text-gray-400 hover:text-gray-800"><i class="fa-solid fa-xmark text-xl"></i></button>
        <div class="text-center mb-6">
          <h3 class="text-2xl font-bold text-gray-900">卖出成交</h3>
          <p class="text-sm text-gray-500 mt-1">{{ currentSellItem?.name }}</p>
          <p class="text-xs text-gray-400">可售数量: {{ maxSellQty }} 件</p>
        </div>
        <div class="space-y-4">
          <div class="flex justify-between items-center border-b pb-2">
            <label class="text-sm text-gray-600">售出数量</label>
            <input type="number" min="1" :max="maxSellQty" v-model.number="sellForm.qty" class="text-right w-24 border-none focus:ring-0 bg-transparent text-sm" placeholder="1">
          </div>
          <div class="flex justify-between items-center border-b pb-2">
            <label class="text-sm text-gray-600">成交总价 (¥)</label>
            <input type="number" v-model.number="sellForm.price" class="text-right w-32 border-none focus:ring-0 text-xl font-bold text-success bg-transparent" placeholder="0.00">
          </div>
          <div class="flex justify-between items-center border-b pb-2">
            <label class="text-sm text-gray-600">快递费 (¥)</label>
            <input type="number" v-model.number="sellForm.express" class="text-right w-24 border-none focus:ring-0 bg-transparent text-sm" placeholder="0">
          </div>
          <div class="flex justify-between items-center border-b pb-2">
            <label class="text-sm text-gray-600">特殊扣除 (¥)</label>
            <input type="number" v-model.number="sellForm.deduction" class="text-right w-24 border-none focus:ring-0 bg-transparent text-sm" placeholder="0">
          </div>
          <div class="flex justify-between items-center border-b pb-2">
            <label class="text-sm text-gray-600">手续费</label>
            <select v-model="sellForm.feeRate" class="text-right border-none focus:ring-0 bg-transparent text-sm">
              <option :value="0">0%</option>
              <option :value="0.006">0.6%</option>
              <option :value="0.016">1.6%</option>
            </select>
          </div>
          <div class="flex justify-between items-center border-b pb-2">
            <label class="text-sm text-gray-600">成交日期</label>
            <input type="date" v-model="sellForm.date" class="text-right border-none focus:ring-0 bg-transparent text-sm">
          </div>
          <div class="bg-gray-50 p-4 rounded-xl flex justify-between items-center mt-6">
            <span class="text-sm font-medium text-gray-600">利润:</span>
            <span class="text-2xl font-bold" :class="calculatedProfit >= 0 ? 'text-success' : 'text-danger'">¥ {{ fmtNum(calculatedProfit) }}</span>
          </div>
        </div>
        <button @click="submitSellItem" class="w-full btn btn-primary mt-6 py-3 text-base">确认提交</button>
      </div>
    </div>
  </div>
</template>
