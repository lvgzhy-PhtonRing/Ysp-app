// 销售模块逻辑层（无 UI）

import { calcProfit } from '../../utils/calc'
import { addOperationLog, formatChangesSummary, saveToLocalStorage, state as store } from '../../data/store'
import { adjustPaytonBalance, getPaytonAccountForItem } from '../payton-finance/usePaytonFinance'
import { DEFAULT_SALES_CHANNEL, inferLegacySalesChannel, isSalesChannel } from './salesChannels'

function toNumber(value, fallback = 0) {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

let saleOrderSeed = 0

function nextOrderedTimestamp() {
  saleOrderSeed = (saleOrderSeed + 1) % 1000
  return Date.now() * 1000 + saleOrderSeed
}

function toPositiveTimestamp(value, fallback = nextOrderedTimestamp()) {
  const n = Number(value)
  if (Number.isFinite(n) && n > 0) return n
  const fb = Number(fallback)
  if (Number.isFinite(fb) && fb > 0) return fb
  return nextOrderedTimestamp()
}

function valueForCompare(value) {
  if (value === undefined) return '__ysp_undefined__'
  try {
    return JSON.stringify(value)
  } catch (_) {
    return String(value)
  }
}

function netProceeds(details = {}) {
  const price = toNumber(details.price)
  return price - toNumber(details.express) - price * toNumber(details.feeRate) - toNumber(details.deduction)
}

export function submitSell(itemId, saleData = {}, options = {}) {
  const item = store.items.find((x) => x.id === itemId)
  if (!item) return false

  const price = toNumber(saleData.price)
  const express = toNumber(saleData.express)
  const feeRate = toNumber(saleData.feeRate)
  const deduction = toNumber(saleData.deduction)
  const date = saleData.date || ''
  const shop = isSalesChannel(saleData.shop) ? saleData.shop : DEFAULT_SALES_CHANNEL
  const soldAt = toPositiveTimestamp(saleData.soldAt)

  const profit = calcProfit(price, express, feeRate, deduction, toNumber(item.cost))
  const beforeStatus = item.status
  const beforeStock = item.stock

  item.status = 'sold'
  item.stock = 0
  item.saleDetails = {
    price,
    express,
    feeRate,
    deduction,
    date,
    shop,
    soldAt,
    profit,
  }
  const paytonAccount = getPaytonAccountForItem(item)
  if (paytonAccount) adjustPaytonBalance(paytonAccount, netProceeds(item.saleDetails))

  saveToLocalStorage()
  if (!options?.skipLog) {
    addOperationLog('sales_submit', `记录销售: ${item.name} x1`, {
      itemId: item.id,
      name: item.name,
      sid: item.sid,
      qty: 1,
      price,
      express,
      feeRate,
      deduction,
      shop,
      date,
      soldAt,
      profit,
      cost: toNumber(item.cost),
      before: { status: beforeStatus, stock: beforeStock },
      after: { status: 'sold', stock: 0 },
    })
  }
  return item
}

export function unlistItem(itemId, unlistData = {}) {
  const item = store.items.find((x) => x.id === itemId)
  if (!item) return false

  if (item.status === 'sold') {
    const account = getPaytonAccountForItem(item)
    if (account) adjustPaytonBalance(account, -netProceeds(item.saleDetails))
  }
  item.status = 'unlisted'
  item.unlistDetails = {
    reason: unlistData.reason || '',
    date: unlistData.date || '',
  }

  saveToLocalStorage()
  addOperationLog('sales_unlist', `下架商品: ${item.name}`, {
    itemId: item.id,
    name: item.name,
    sid: item.sid,
    reason: unlistData.reason,
    before: { status: 'sold' },
  })
  return item
}

export function editSaleRecord(itemId, newSaleData = {}) {
  const item = store.items.find((x) => x.id === itemId)
  if (!item) return false

  const previous = item.saleDetails || {}
  const merged = {
    ...previous,
    ...newSaleData,
  }

  const price = toNumber(merged.price)
  const express = toNumber(merged.express)
  const feeRate = toNumber(merged.feeRate)
  const deduction = toNumber(merged.deduction)
  const shop = isSalesChannel(merged.shop) ? merged.shop : inferLegacySalesChannel(merged.date)
  const soldAt = toPositiveTimestamp(merged.soldAt, Number(item?.saleDetails?.soldAt || item?.id || 0))

  const beforeSaleDetails = {
    ...(item.saleDetails || {}),
  }
  const account = getPaytonAccountForItem(item)
  if (account) adjustPaytonBalance(account, -netProceeds(previous))

  item.saleDetails = {
    ...merged,
    price,
    express,
    feeRate,
    deduction,
    shop,
    soldAt,
    profit: calcProfit(price, express, feeRate, deduction, toNumber(item.cost)),
  }
  if (account) adjustPaytonBalance(account, netProceeds(item.saleDetails))

  const changes = {}
  Object.keys(item.saleDetails).forEach((key) => {
    const before = beforeSaleDetails[key]
    const after = item.saleDetails[key]
    if (valueForCompare(before) !== valueForCompare(after)) {
      changes[key] = { before, after }
    }
  })

  saveToLocalStorage()
  var changesText = formatChangesSummary(changes)
  addOperationLog('sales_edit', '编辑销售: ' + item.name + (changesText ? ' ← ' + changesText : ''), {
    itemId: item.id,
    name: item.name,
    sid: item.sid,
    changedFields: Object.keys(changes),
    changes: changes,
  })
  return item
}

export function getSalesStats(items = []) {
  const soldItems = items.filter((item) => item?.status === 'sold')

  const totalSoldCount = soldItems.length
  const totalRevenue = soldItems.reduce((sum, item) => sum + toNumber(item?.saleDetails?.price), 0)
  const totalProfit = soldItems.reduce((sum, item) => sum + toNumber(item?.saleDetails?.profit), 0)
  const totalInvestment = soldItems.reduce((sum, item) => sum + toNumber(item?.cost), 0)

  const profitMargin = totalInvestment > 0 ? totalProfit / totalInvestment : 0
  const recoveryRate = totalInvestment > 0 ? totalRevenue / totalInvestment : 0

  return {
    totalSoldCount,
    totalRevenue,
    totalProfit,
    totalInvestment,
    profitMargin,
    recoveryRate,
  }
}

export function getOwnerInventory(items = [], owner = 'papa') {
  return items.filter((item) => item?.status === 'inventory' && (item?.owner || 'papa') === owner)
}

export function useSales() {
  return {
    submitSell,
    unlistItem,
    editSaleRecord,
    getSalesStats,
    getOwnerInventory,
  }
}
