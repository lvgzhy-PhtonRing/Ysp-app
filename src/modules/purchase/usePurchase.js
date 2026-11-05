// 采购模块逻辑层（无 UI）

import { calcItemCost, calcProfit, calcTransferCost } from '../../utils/calc'
import { addOperationLog, clone, saveToLocalStorage, state as store } from '../../data/store'
import { adjustPaytonBalance, getPaytonAccountForItem } from '../payton-finance/usePaytonFinance'
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

export function normalizeTransferFeeBreakdown(data = {}) {
  const logisticsRMB = Math.max(0, toNumber(data.logisticsRMB, data.totalRMB == null ? 0 : toNumber(data.totalRMB)))
  const customsDutyRMB = Math.max(0, toNumber(data.customsDutyRMB, 0))
  return {
    logisticsRMB,
    customsDutyRMB,
    totalRMB: logisticsRMB + customsDutyRMB,
  }
}

export function splitTransferFeeByCoefficient(data = {}, coefficient = 0, totalCoefficients = 1) {
  const { logisticsRMB, customsDutyRMB } = normalizeTransferFeeBreakdown(data)
  const logisticsCost = calcTransferCost(logisticsRMB, coefficient, totalCoefficients)
  const customsDutyCost = calcTransferCost(customsDutyRMB, coefficient, totalCoefficients)
  return {
    logisticsCost,
    customsDutyCost,
    transferCost: logisticsCost + customsDutyCost,
  }
}

export function setPurchaseItemCost(item, cost) {
  const nextCost = toNumber(cost)
  const account = ['inventory', 'sold', 'unlisted'].includes(item.status) ? getPaytonAccountForItem(item) : null
  const balanceDelta = toNumber(item.cost) - nextCost
  if (account && balanceDelta) adjustPaytonBalance(account, balanceDelta)
  item.cost = nextCost
  if (item.status === 'sold' && item.saleDetails) {
    const sale = item.saleDetails
    sale.profit = calcProfit(sale.price || 0, sale.express || 0, sale.feeRate || 0, sale.deduction || 0, nextCost)
  }
  return nextCost
}

export function editPurchaseItemCost(item, cost) {
  const nextCost = setPurchaseItemCost(item, cost)
  item.purchaseDetails = item.purchaseDetails || {}
  item.purchaseDetails.preTransferCost = nextCost - toNumber(item.purchaseDetails.transferCost)
  item.purchaseDetails.manualPreTransferCost = item.purchaseDetails.preTransferCost
  return nextCost
}

export function resolveEditedPreTransferCost(item, calculatedCost, nextDetails, forceReprice = false) {
  const previous = item.purchaseDetails || {}
  const priceFields = ['originalPrice', 'domesticShipping', 'fee']
  return !forceReprice && priceFields.every((field) => toNumber(previous[field]) === toNumber(nextDetails[field]))
    ? toNumber(previous.manualPreTransferCost ?? previous.preTransferCost, calculatedCost)
    : calculatedCost
}

export function getTransferItemsForRecord(record, items = store.items) {
  const ids = new Set(Array.isArray(record?.itemIds) ? record.itemIds : [])
  return items.filter((item) => (record?.transferId && item?.purchaseDetails?.transferId === record.transferId) || (
    ids.has(item.id) && !item?.purchaseDetails?.transferId
  ))
}

export function getPurchaseGroupItems(items, category, view = 'purchase') {
  return items.filter((item) => item?.category === category && (
    view === 'all'
      ? item.purchaseDetails && ['purchase', 'inventory', 'sold', 'unlisted'].includes(item.status)
      : item.status === 'purchase'
  ))
}

export function purchaseGroupNeedsFullReprice(items, lines, category, totalRMB) {
  if (items.some((item) => item.category !== category)) return true
  if (category === '国内') return false
  if (toNumber(totalRMB) !== toNumber(items[0]?.purchaseDetails?.totalRMB)) return true
  const originalById = new Map(items.map((item) => [item.id, item.purchaseDetails || {}]))
  if (items.length !== lines.length || lines.some((line) => !originalById.has(line.id))) return true
  return lines.some((line) => ['originalPrice', 'domesticShipping', 'fee'].some(
    (field) => toNumber(originalById.get(line.id)[field]) !== toNumber(line[field]),
  ))
}

export function getDomesticPurchaseTotal(lines) {
  return lines.reduce((sum, line) => sum + (toNumber(line.originalPrice) || toNumber(line.preTransferCost)), 0)
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
    const { logisticsCost, customsDutyCost, transferCost } = splitTransferFeeByCoefficient(transfer, coefficient, totalCoefficients || 1)

    item.purchaseDetails.transferLogisticsCost = logisticsCost
    item.purchaseDetails.customsDutyCost = customsDutyCost
    item.purchaseDetails.transferCost = transferCost
    setPurchaseItemCost(item, calcItemCost(preTransferCost, transferCost))
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
    owner: itemData.owner || 'papa',
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
      transferLogisticsCost: 0,
      customsDutyCost: 0,
      transferCost: 0,
      ...purchaseDetails,
      preTransferCost,
    },
  }

  store.items.push(item)
  if (!options?.skipLog) {
    addOperationLog('purchase_add', `新增采购: ${item.name}`, {
      itemId: item.id,
      purchaseGroupId: item.purchaseDetails?.purchaseGroupId,
      name: item.name,
      sid: item.sid,
      qty: 1,
      category: item.category,
      batch: item.batch,
      cost: item.cost,
    })
  }
  return item
}

export function submitTransfer(transferData = {}, selectedItemIds = []) {
  const selectedSet = new Set(selectedItemIds)
  const selectedItems = store.items.filter((item) => selectedSet.has(item.id))
  if (selectedItems.length === 0) return null

  // 转运结算前逐件记录（回溯时用于还原转运前的成本）
  const itemCosts = selectedItems.map((item) => ({ itemId: item.id, sid: item.sid, name: item.name, costBefore: item.cost }))

  const transferId =
    transferData.transferId || generateUniqueTransferId(transferData, selectedItems) || transferData.transferBatch
  const transferBatch =
    String(transferData.transferBatch || '').trim() ||
    generateUniqueTransferBatch(transferData, selectedItems)

  const transferFee = normalizeTransferFeeBreakdown(transferData)
  const transferRecord = {
    ...transferData,
    ...transferFee,
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
    const { logisticsCost, customsDutyCost, transferCost } = splitTransferFeeByCoefficient(transferRecord, coefficient, totalCoefficients || 1)

    item.purchaseDetails = {
      ...(item.purchaseDetails || {}),
      transferId,
      transferBatch: transferRecord.transferBatch,
      transferStatus: 'completed',
      transferLogisticsCost: logisticsCost,
      customsDutyCost,
      transferCost,
    }

    setPurchaseItemCost(item, calcItemCost(preTransferCost, transferCost))
  })

  saveToLocalStorage()
  itemCosts.forEach((entry) => {
    const item = store.items.find((x) => x.id === entry.itemId)
    entry.costAfter = item ? item.cost : entry.costBefore
  })
  addOperationLog('purchase_transfer', `提交转运: ${transferRecord.transferBatch || transferId}`, {
    transferId,
    transferBatch: transferRecord.transferBatch,
    count: selectedItems.length,
    totalRMB: transferRecord.totalRMB,
    itemIds: selectedItems.map((i) => i.id),
    itemCosts,
  })
  return transferRecord
}

export function moveToInventory(itemId, assignmentOptions = {}) {
  const item = store.items.find((x) => x.id === itemId)
  if (!item) return false
  const inStockDate = todayDate()

  const transferId = item?.purchaseDetails?.transferId
  if (transferId) {
    let movedCount = 0
    store.items.forEach((x) => {
      if (x?.purchaseDetails?.transferId === transferId && x.status === 'purchase') {
        const assignment = assignmentOptions[x.id] || (x.id === itemId ? assignmentOptions : {})
        x.owner = assignment?.owner || 'papa'
        if (typeof assignment?.isLongTerm === 'boolean') x.isLongTerm = assignment.isLongTerm
        if (x.owner === 'payton') adjustPaytonBalance(getPaytonAccountForItem(x), -toNumber(x.cost))
        x.status = 'inventory'
        markInStockDate(x, inStockDate)
        movedCount += 1
      }
    })
    saveToLocalStorage()
    addOperationLog('purchase_to_inventory', `同转运批次整组入库: ${item.name}`, {
      itemId: item.id,
      name: item.name,
      sid: item.sid,
      transferId,
      inStockDate,
      count: movedCount,
      before: { status: 'purchase' },
      after: { status: 'inventory' },
    })
    return true
  }

  markInStockDate(item, inStockDate)
  const assignment = assignmentOptions[item.id] || assignmentOptions
  item.owner = assignment.owner || 'papa'
  if (typeof assignment.isLongTerm === 'boolean') item.isLongTerm = assignment.isLongTerm
  if (item.owner === 'payton') adjustPaytonBalance(getPaytonAccountForItem(item), -toNumber(item.cost))
  item.status = 'inventory'
  saveToLocalStorage()
  addOperationLog('purchase_to_inventory', `移入库存: ${item.name}`, {
    itemId: item.id,
    name: item.name,
    sid: item.sid,
    inStockDate,
    before: { status: 'purchase' },
    after: { status: 'inventory' },
  })
  return true
}

export function batchMoveToInventory(itemIds = [], ownerAssignments = {}) {
  const idSet = new Set(itemIds)
  const inStockDate = todayDate()
  let movedCount = 0
  const movedNames = []
  const movedItemIds = []

  store.items.forEach((item) => {
    if (idSet.has(item.id) && item?.status === 'purchase') {
      const assignment = ownerAssignments[item.id] || {}
      movedNames.push(item.name)
      movedItemIds.push(item.id)
      item.owner = assignment.owner || 'papa'
      if (typeof assignment.isLongTerm === 'boolean') item.isLongTerm = assignment.isLongTerm
      if (item.owner === 'payton') adjustPaytonBalance(getPaytonAccountForItem(item), -toNumber(item.cost))
      item.status = 'inventory'
      markInStockDate(item, inStockDate)
      movedCount += 1
    }
  })

  saveToLocalStorage()
  addOperationLog('purchase_batch_to_inventory', `批量移入库存`, {
    count: movedCount,
    inStockDate,
    itemNames: movedNames,
    itemIds: movedItemIds,
    before: { status: 'purchase' },
    after: { status: 'inventory' },
  })
}

export function deletePurchaseItem(itemId) {
  const idx = store.items.findIndex((x) => x.id === itemId)
  if (idx < 0) return false

  const target = store.items[idx]
  const transferId = target?.purchaseDetails?.transferId
  const groupId = String(target?.purchaseDetails?.purchaseGroupId || '').trim()
  const groupCostBefore = groupId ? computeGroupCost(groupId) : null

  store.items.splice(idx, 1)

  if (transferId) {
    recalcTransferItemsByTransferId(transferId)
  }

  saveToLocalStorage()
  const groupCostAfter = groupId ? computeGroupCost(groupId) : null
  addOperationLog('purchase_delete', '删除采购商品: ' + (target ? target.name : itemId), {
    name: target ? target.name : '',
    sid: target ? target.sid : '',
    transferId: transferId,
    itemId: itemId,
    purchaseGroupId: groupId,
    // 完整商品快照：回溯时用于还原被删除的采购商品
    deletedItems: target ? [clone(target)] : [],
    ...(groupId ? { groupPriceBefore: groupCostBefore, groupPriceAfter: groupCostAfter } : {}),
  })
  return true
}

/** 计算指定购买组的总成本（组价联动，供日志记录删除影响） */
function computeGroupCost(groupId) {
  return store.items
    .filter((i) => String(i?.purchaseDetails?.purchaseGroupId || '').trim() === String(groupId).trim())
    .reduce((s, i) => s + Number(i?.cost || 0), 0)
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
