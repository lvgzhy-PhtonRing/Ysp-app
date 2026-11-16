// 库存模块逻辑层（无 UI）

import { addOperationLog, clone, formatChangesSummary, saveToLocalStorage, state as store } from '../../data/store'
import { createItemIdentity } from '../../utils/itemIdentity'
import { getBusinessDate } from '../../utils/businessDate'
import { adjustPaytonBalance, getPaytonAccountForItem } from '../payton-finance/usePaytonFinance'

function toNumber(value, fallback = 0) {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

function generateManualSid() {
  const maxNo = store.items.reduce((max, item) => {
    const sid = item?.sid
    if (typeof sid !== 'string') return max
    const match = sid.match(/^MAN-(\d{4})$/)
    if (!match) return max
    const no = Number(match[1])
    return Number.isFinite(no) ? Math.max(max, no) : max
  }, 0)

  return `MAN-${String(maxNo + 1).padStart(4, '0')}`
}

function valueForCompare(value) {
  if (value === undefined) return '__ysp_undefined__'
  try {
    return JSON.stringify(value)
  } catch (_) {
    return String(value)
  }
}

export function getInventoryStats(items = []) {
  const inventoryItems = items.filter((item) => item?.status === 'inventory')
  const purchaseItems = items.filter((item) => item?.status === 'purchase')
  const longTermItems = inventoryItems.filter((item) => item?.isLongTerm === true)

  return {
    totalInventoryCount: inventoryItems.length,
    totalInventoryValue: inventoryItems.reduce((sum, item) => sum + toNumber(item?.cost), 0),
    totalPurchaseCount: purchaseItems.length,
    totalPurchaseValue: purchaseItems.reduce((sum, item) => sum + toNumber(item?.cost), 0),
    // 旧版口径：残次品仅统计库存中(status=inventory)
    defectCount: inventoryItems.filter((item) => item?.isDefect === true).length,
    // 旧版逻辑：长期库存仅统计 status=inventory 且 isLongTerm=true
    longTermCount: longTermItems.length,
    longTermValue: longTermItems.reduce((sum, item) => sum + toNumber(item?.cost), 0),
  }
}

export function filterInventory(items = [], filters = {}) {
  const {
    status,
    category,
    batch,
    brand,
    keyword,
    isDefect,
    isLongTerm,
  } = filters

  const keywordNorm = typeof keyword === 'string' ? keyword.trim().toLowerCase() : ''

  return items.filter((item) => {
    if (status && item?.status !== status) return false
    if (filters.owner && filters.owner !== 'all' && (item?.owner || 'papa') !== filters.owner) return false
    if (category && item?.category !== category) return false
    if (batch && item?.batch !== batch) return false
    if (brand && item?.brand !== brand) return false
    if (typeof isDefect === 'boolean' && item?.isDefect !== isDefect) return false
    if (typeof isLongTerm === 'boolean' && item?.isLongTerm !== isLongTerm) return false

    if (keywordNorm) {
      const name = String(item?.name || '').toLowerCase()
      const sid = String(item?.sid || '').toLowerCase()
      if (!name.includes(keywordNorm) && !sid.includes(keywordNorm)) {
        return false
      }
    }

    return true
  })
}

export function sortInventoryItems(items = [], key, direction = 'asc') {
  if (!['name', 'brand'].includes(key)) return [...items]
  const sign = direction === 'desc' ? -1 : 1
  return [...items].sort((a, b) =>
    String(a?.[key] || '').localeCompare(String(b?.[key] || ''), 'zh-CN', { sensitivity: 'base' }) * sign,
  )
}

export function getInventoryEditPatch(before, after) {
  return Object.fromEntries(Object.entries(after).filter(([key, value]) =>
    valueForCompare(before[key]) !== valueForCompare(value),
  ))
}

function applyInventoryPatch(item, patch, paytonDeltas) {
  const changes = Object.fromEntries(Object.entries(getInventoryEditPatch(item, patch)).map(([field, after]) =>
    [field, { before: item[field], after }],
  ))
  if (!Object.keys(changes).length) return null

  const oldAccount = getPaytonAccountForItem(item)
  const newItem = { ...item, ...patch }
  const newAccount = getPaytonAccountForItem(newItem)
  if (oldAccount) paytonDeltas[oldAccount] += toNumber(item.cost)
  if (newAccount) paytonDeltas[newAccount] -= toNumber(newItem.cost)
  Object.assign(item, patch)
  return { itemId: item.id, changes }
}

function saveInventoryChanges(paytonDeltas) {
  for (const [account, delta] of Object.entries(paytonDeltas)) {
    if (delta) adjustPaytonBalance(account, delta)
  }
  saveToLocalStorage()
}

export function getInventoryEditTargets(item) {
  const related = item.status === 'inventory'
    ? store.items.filter((x) => x.id !== item.id && x.status === 'inventory' && x.owner === item.owner && x.sid && x.sid === item.sid)
    : []
  return [item, ...related]
}

export function editItem(itemId, updateData = {}) {
  const item = store.items.find((x) => x.id === itemId)
  if (!item) return false

  const paytonDeltas = { pocket: 0, invest: 0 }
  const itemChanges = getInventoryEditTargets(item)
    .map((target) => applyInventoryPatch(target, updateData, paytonDeltas)).filter(Boolean)
  if (!itemChanges.length) return item

  saveInventoryChanges(paytonDeltas)
  const changes = itemChanges[0].changes
  const changesText = formatChangesSummary(changes)
  addOperationLog('inventory_edit', '编辑库存: ' + item.name + (changesText ? ' ← ' + changesText : '') + (itemChanges.length > 1 ? ' (影响' + itemChanges.length + '件)' : ''), {
    name: item.name,
    sid: item.sid,
    affected: itemChanges.length,
    changedFields: Object.keys(changes),
    changes,
    itemChanges,
    paytonDeltas,
  })
  return item
}

export function getLongTermInventoryScope(items, { owner, category, brand, batch }) {
  if (!category) return []
  return filterInventory(items, { status: 'inventory', owner: owner || 'papa', category, brand, batch })
}

export function markLongTermInventory({ owner, category, brand, batch }, selectedSids = []) {
  const sidSet = new Set(selectedSids)
  const scope = getLongTermInventoryScope(store.items, { owner, category, brand, batch })
  const paytonDeltas = { pocket: 0, invest: 0 }
  const changed = scope.filter((item) => Boolean(item.isLongTerm) !== sidSet.has(item.sid))
  if (!changed.length) return

  const itemChanges = changed.map((item) =>
    applyInventoryPatch(item, { isLongTerm: sidSet.has(item.sid) }, paytonDeltas),
  )
  saveInventoryChanges(paytonDeltas)
  addOperationLog('inventory_long_term', '长线库存', {
    owner,
    category,
    brand,
    batch,
    count: selectedSids.length,
    itemNames: changed.map((item) => item.name),
    itemIds: changed.map((item) => item.id),
    itemChanges,
    paytonDeltas,
  })
}

export function deleteItem(itemId, options = {}) {
  const idx = store.items.findIndex((x) => x.id === itemId)
  if (idx < 0) return false

  const target = store.items[idx]
  const reason = typeof options === 'string' ? options : options.reason
  const account = getPaytonAccountForItem(target)
  if (account && ['mistake', 'duplicate'].includes(reason)) adjustPaytonBalance(account, toNumber(target.cost))
  store.items.splice(idx, 1)
  saveToLocalStorage()
  addOperationLog('inventory_delete', '删除商品: ' + (target ? target.name : itemId), {
    name: target ? target.name : '',
    sid: target ? target.sid : '',
    itemId: itemId,
    // 完整商品快照：回溯时用于还原被删除的商品
    deletedItems: target ? [clone(target)] : [],
  })
  return true
}

export function submitManualAdd(itemData = {}) {
  const qty = Math.max(1, Math.floor(toNumber(itemData.qty, 1)))
  const sid = generateManualSid()
  const owner = itemData.owner || store.currentOwner || 'papa'
  const unitCost = toNumber(itemData.cost)
  const items = []
  for (let index = 0; index < qty; index += 1) {
    items.push({
      ...itemData,
      owner,
      ...createItemIdentity([...store.items, ...items]),
      sid,
      qty: 1,
      stock: 1,
      cost: unitCost,
      status: 'inventory',
      isManual: true,
      inventoryDetails: {
        ...(itemData.inventoryDetails || {}),
        inStockDate: itemData.inventoryDetails?.inStockDate || getBusinessDate(),
      },
    })
  }
  const paytonDeltas = { pocket: 0, invest: 0 }
  items.forEach((item) => {
    const account = getPaytonAccountForItem(item)
    if (account) paytonDeltas[account] -= unitCost
  })
  Object.entries(paytonDeltas).forEach(([account, delta]) => {
    if (delta) adjustPaytonBalance(account, delta)
  })
  store.items.push(...items)
  saveToLocalStorage()
  const item = items[0]
  addOperationLog('inventory_manual_add', `手动添加商品: ${item.name}${qty > 1 ? ` ×${qty}` : ''}`, {
    owner,
    name: item.name,
    sid,
    itemId: item.id,
    itemIds: items.map(({ id }) => id),
    qty,
    cost: unitCost,
    totalCost: unitCost * qty,
    paytonDeltas,
  })
  return item
}

export function useInventory() {
  return {
    getInventoryStats,
    filterInventory,
    editItem,
    deleteItem,
    submitManualAdd,
  }
}
