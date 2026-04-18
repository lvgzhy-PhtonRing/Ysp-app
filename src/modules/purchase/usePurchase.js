// 采购模块逻辑层（无 UI）

import { calcItemCost, calcTransferCost } from '../../utils/calc'
import { addOperationLog, saveToLocalStorage, state as store } from '../../data/store'
import {
  generateSid,
  generatePaymentBatch,
  generateTransferNumber,
  generatePurchaseGroupId,
} from '../../utils/codeGenerator'

const DEFAULT_CATEGORY = '日淘'

function inferCategoryPrefix(category = DEFAULT_CATEGORY) {
  const value = String(category || '').trim()
  if (value.includes('美')) return 'US-'
  if (value.includes('国内') || value.includes('国')) return 'CN-'
  return 'JP-'
}

function collectTransferCodes() {
  const codes = []
  ;(store.transfers || []).forEach((record) => {
    if (record?.transferId) codes.push(record.transferId)
    if (record?.transferBatch) codes.push(record.transferBatch)
  })
  return codes
}

function collectPaymentBatches() {
  return store.items
    .map((item) => String(item?.purchaseDetails?.paymentBatch || '').trim())
    .filter(Boolean)
}

function collectPurchaseGroupIds() {
  return store.items
    .map((item) => String(item?.purchaseDetails?.purchaseGroupId || '').trim())
    .filter(Boolean)
}

function toNumber(value, fallback = 0) {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

function generateItemId() {
  return Date.now() + Math.floor(Math.random() * 1000)
}

function generateNextSid(category) {
  const existing = store.items.map((item) => item?.sid).filter(Boolean)
  const prefix = inferCategoryPrefix(category)
  return generateSid(existing, { prefix, width: 4 })
}

function generateUniquePaymentBatch({ category, batch, paymentAccount }) {
  const existing = collectPaymentBatches()
  return generatePaymentBatch(existing, {
    categoryHint: category || DEFAULT_CATEGORY,
    batchHint: batch,
    account: paymentAccount,
    width: 2,
  })
}

function generateUniqueTransferId(transferData = {}, selectedItems = []) {
  const categoryHint = transferData.category || selectedItems[0]?.category || DEFAULT_CATEGORY
  const batchHint = transferData.batch || selectedItems[0]?.batch
  const account = transferData?.paymentAccount || selectedItems[0]?.purchaseDetails?.paymentAccount
  const existing = store.transfers.map((t) => t?.transferId).filter(Boolean)
  return generateTransferNumber(existing, { categoryHint, batchHint, account, width: 2 })
}

function generateUniqueTransferBatch(transferData = {}, selectedItems = []) {
  const categoryHint = transferData.category || selectedItems[0]?.category || DEFAULT_CATEGORY
  const batchHint = transferData.batch || selectedItems[0]?.batch
  const account = transferData?.paymentAccount || selectedItems[0]?.purchaseDetails?.paymentAccount
  const existing = store.transfers.map((t) => t?.transferBatch).filter(Boolean)
  return generateTransferNumber(existing, { categoryHint, batchHint, account, width: 2 })
}

function generateUniquePurchaseGroupId({ category, batch }) {
  const existing = collectPurchaseGroupIds()
  return generatePurchaseGroupId(existing, {
    categoryHint: category || DEFAULT_CATEGORY,
    batchHint: batch,
    width: 4,
  })
}

export function generatePurchaseGroupMetadata({ category, batch, paymentAccount } = {}) {
  return {
    purchaseGroupId: generateUniquePurchaseGroupId({ category, batch }),
    paymentBatch: generateUniquePaymentBatch({ category, batch, paymentAccount }),
  }
}

function recalcTransferItemsByTransferId(transferId) {
  if (!transferId) return

  const transfer = store.transfers.find((t) => t?.transferId === transferId)
  if (!transfer) return

  const sameTransferItems = store.items.filter(
    (item) => item?.purchaseDetails?.transferId === transferId,
  )

  if (sameTransferItems.length === 0) return

  const totalCoefficients = sameTransferItems.reduce(
    (sum, item) => sum + toNumber(item?.purchaseDetails?.transferCoefficient, 1),
    0,
  )

  sameTransferItems.forEach((item) => {
    const coefficient = toNumber(item?.purchaseDetails?.transferCoefficient, 1)
    const preTransferCost = toNumber(item?.purchaseDetails?.preTransferCost, 0)
    const transferCost = calcTransferCost(transfer.totalRMB, coefficient, totalCoefficients || 1)

    item.purchaseDetails.transferCost = transferCost
    item.cost = calcItemCost(preTransferCost, transferCost)
  })
}

function todayDate() {
  return new Date().toISOString().slice(0, 10)
}

function markInStockDate(item, date = todayDate()) {
  if (!item) return
  const existing = String(item?.inventoryDetails?.inStockDate || '').trim()
  if (existing) return
  item.inventoryDetails = {
    ...(item.inventoryDetails || {}),
    inStockDate: date,
  }
}

export function addPurchaseItem(itemData = {}, options = {}) {
  const purchaseDetails = {
    ...(itemData.purchaseDetails || {}),
  }

  const preTransferCost = toNumber(purchaseDetails.preTransferCost, 0)

  const item = {
    ...itemData,
    id: generateItemId(),
    sid:
      typeof itemData.sid === 'string' && itemData.sid.trim()
        ? itemData.sid.trim()
        : generateNextSid(itemData.category || purchaseDetails.categoryHint || DEFAULT_CATEGORY),
    status: 'purchase',
    cost: preTransferCost,
    purchaseDetails: {
      transferStatus: 'pending',
      transferCoefficient: 1,
      transferCost: 0,
      ...purchaseDetails,
      preTransferCost,
    },
  }

  store.items.push(item)
  if (!options?.skipLog) {
    addOperationLog('purchase_add', `新增采购: ${item.name}`, {
      sid: item.sid,
      qty: 1,
      category: item.category,
      batch: item.batch,
    })
  }
  return item
}

export function submitTransfer(transferData = {}, selectedItemIds = []) {
  const selectedSet = new Set(selectedItemIds)
  const selectedItems = store.items.filter((item) => selectedSet.has(item.id))
  if (selectedItems.length === 0) return null

  const transferId =
    transferData.transferId || generateUniqueTransferId(transferData, selectedItems) || transferData.transferBatch
  const transferBatch =
    String(transferData.transferBatch || '').trim() ||
    generateUniqueTransferBatch(transferData, selectedItems)

  const transferRecord = {
    ...transferData,
    transferId,
    transferBatch,
    itemIds: selectedItems.map((item) => item.id),
  }
  store.transfers.push(transferRecord)

  const totalCoefficients = selectedItems.reduce(
    (sum, item) => sum + toNumber(item?.purchaseDetails?.transferCoefficient, 1),
    0,
  )

  selectedItems.forEach((item) => {
    const coefficient = toNumber(item?.purchaseDetails?.transferCoefficient, 1)
    const preTransferCost = toNumber(item?.purchaseDetails?.preTransferCost, 0)
    const transferCost = calcTransferCost(transferRecord.totalRMB, coefficient, totalCoefficients || 1)

    item.purchaseDetails = {
      ...(item.purchaseDetails || {}),
      transferId,
      transferBatch: transferRecord.transferBatch,
      transferStatus: 'completed',
      transferCost,
    }

    item.cost = calcItemCost(preTransferCost, transferCost)
  })

  saveToLocalStorage()
  addOperationLog('purchase_transfer', `提交转运: ${transferRecord.transferBatch || transferId}`, {
    transferId,
    count: selectedItems.length,
    totalRMB: transferRecord.totalRMB,
  })
  return transferRecord
}

export function moveToInventory(itemId) {
  const item = store.items.find((x) => x.id === itemId)
  if (!item) return false
  const inStockDate = todayDate()

  const transferId = item?.purchaseDetails?.transferId
  if (transferId) {
    store.items.forEach((x) => {
      if (x?.purchaseDetails?.transferId === transferId && x.status === 'purchase') {
        x.status = 'inventory'
        markInStockDate(x, inStockDate)
      }
    })
    saveToLocalStorage()
    addOperationLog('purchase_to_inventory', `同转运批次整组入库: ${item.name}`, { sid: item.sid, transferId, inStockDate })
    return true
  }

  markInStockDate(item, inStockDate)
  item.status = 'inventory'
  saveToLocalStorage()
  addOperationLog('purchase_to_inventory', `移入库存: ${item.name}`, { sid: item.sid, inStockDate })
  return true
}

export function batchMoveToInventory(itemIds = []) {
  const idSet = new Set(itemIds)
  const inStockDate = todayDate()
  let movedCount = 0

  store.items.forEach((item) => {
    if (idSet.has(item.id) && item?.status === 'purchase') {
      item.status = 'inventory'
      markInStockDate(item, inStockDate)
      movedCount += 1
    }
  })

  saveToLocalStorage()
  addOperationLog('purchase_batch_to_inventory', `批量移入库存`, { count: movedCount, inStockDate })
}

export function deletePurchaseItem(itemId) {
  const idx = store.items.findIndex((x) => x.id === itemId)
  if (idx < 0) return false

  const target = store.items[idx]
  const transferId = target?.purchaseDetails?.transferId

  store.items.splice(idx, 1)

  if (transferId) {
    recalcTransferItemsByTransferId(transferId)
  }

  saveToLocalStorage()
  addOperationLog('purchase_delete', `删除采购商品: ${target?.name || itemId}`, { sid: target?.sid, transferId })
  return true
}

export function usePurchase() {
  return {
    addPurchaseItem,
    submitTransfer,
    moveToInventory,
    batchMoveToInventory,
    deletePurchaseItem,
    generatePurchaseGroupMetadata,
  }
}
