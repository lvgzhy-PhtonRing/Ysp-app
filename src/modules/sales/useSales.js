// 销售模块逻辑层（无 UI）

import { calcProfit } from '../../utils/calc'
import { addOperationLog, saveToLocalStorage, state as store } from '../../data/store'

function toNumber(value, fallback = 0) {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

function valueForCompare(value) {
  if (value === undefined) return '__ysp_undefined__'
  try {
    return JSON.stringify(value)
  } catch (_) {
    return String(value)
  }
}

export function submitSell(itemId, saleData = {}, options = {}) {
  const item = store.items.find((x) => x.id === itemId)
  if (!item) return false

  const price = toNumber(saleData.price)
  const express = toNumber(saleData.express)
  const feeRate = toNumber(saleData.feeRate)
  const deduction = toNumber(saleData.deduction)
  const date = saleData.date || ''

  const profit = calcProfit(price, express, feeRate, deduction, toNumber(item.cost))

  item.status = 'sold'
  item.stock = 0
  item.saleDetails = {
    price,
    express,
    feeRate,
    deduction,
    date,
    profit,
  }

  saveToLocalStorage()
  if (!options?.skipLog) {
    addOperationLog('sales_submit', `记录销售: ${item.name} x1`, { sid: item.sid, qty: 1, price })
  }
  return item
}

export function unlistItem(itemId, unlistData = {}) {
  const item = store.items.find((x) => x.id === itemId)
  if (!item) return false

  item.status = 'unlisted'
  item.unlistDetails = {
    reason: unlistData.reason || '',
    date: unlistData.date || '',
  }

  saveToLocalStorage()
  addOperationLog('sales_unlist', `下架商品: ${item.name}`, { sid: item.sid, reason: unlistData.reason })
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

  const beforeSaleDetails = {
    ...(item.saleDetails || {}),
  }

  item.saleDetails = {
    ...merged,
    price,
    express,
    feeRate,
    deduction,
    profit: calcProfit(price, express, feeRate, deduction, toNumber(item.cost)),
  }

  const changes = {}
  Object.keys(item.saleDetails).forEach((key) => {
    const before = beforeSaleDetails[key]
    const after = item.saleDetails[key]
    if (valueForCompare(before) !== valueForCompare(after)) {
      changes[key] = { before, after }
    }
  })

  saveToLocalStorage()
  addOperationLog('sales_edit', `编辑销售记录: ${item.name}`, {
    sid: item.sid,
    changedFields: Object.keys(changes),
    changes,
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

export function useSales() {
  return {
    submitSell,
    unlistItem,
    editSaleRecord,
    getSalesStats,
  }
}
