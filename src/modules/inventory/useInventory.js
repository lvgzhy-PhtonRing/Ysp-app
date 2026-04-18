// 库存模块逻辑层（无 UI）

import { addOperationLog, saveToLocalStorage, state as store } from '../../data/store'

function toNumber(value, fallback = 0) {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

function generateItemId() {
  return Date.now() + Math.floor(Math.random() * 1000)
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

export function editItem(itemId, updateData = {}) {
  const item = store.items.find((x) => x.id === itemId)
  if (!item) return false

  const beforeValues = {}
  Object.keys(updateData).forEach((key) => {
    beforeValues[key] = item[key]
  })

  const relatedItems =
    item.status === 'inventory'
      ? store.items.filter((x) => x.id !== item.id && x.status === 'inventory' && x.sid && x.sid === item.sid)
      : []

  const targets = [item, ...relatedItems]

  targets.forEach((target) => {
    Object.keys(updateData).forEach((key) => {
      target[key] = updateData[key]
    })
  })

  const changes = {}
  Object.keys(updateData).forEach((key) => {
    const before = beforeValues[key]
    const after = item[key]
    if (valueForCompare(before) !== valueForCompare(after)) {
      changes[key] = { before, after }
    }
  })

  saveToLocalStorage()
  addOperationLog('inventory_edit', `编辑库存`, {
    name: item.name,
    sid: item.sid,
    affected: targets.length,
    changedFields: Object.keys(changes),
    changes,
  })
  return item
}

export function deleteItem(itemId) {
  const idx = store.items.findIndex((x) => x.id === itemId)
  if (idx < 0) return false

  const target = store.items[idx]
  store.items.splice(idx, 1)
  saveToLocalStorage()
  addOperationLog('inventory_delete', `删除商品: ${target?.name || itemId}`, { sid: target?.sid, itemId })
  return true
}

export function submitManualAdd(itemData = {}) {
  const item = {
    ...itemData,
    id: generateItemId(),
    sid: generateManualSid(),
    status: 'inventory',
    isManual: true,
  }

  store.items.push(item)
  saveToLocalStorage()
  addOperationLog('inventory_manual_add', `手动添加商品: ${item.name}`, { sid: item.sid, cost: item.cost })
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
