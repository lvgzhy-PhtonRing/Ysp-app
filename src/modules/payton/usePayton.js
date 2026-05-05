// Payton 基金模块逻辑层（无 UI）

import { addOperationLog, saveToLocalStorage, state as store } from '../../data/store'

function toNumber(value, fallback = 0) {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

let paytonRecordOrderSeed = 0

function nextOrderedTimestamp() {
  paytonRecordOrderSeed = (paytonRecordOrderSeed + 1) % 1000
  return Date.now() * 1000 + paytonRecordOrderSeed
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

function genId() {
  return Date.now() + Math.floor(Math.random() * 1000)
}

function normalizeText(v) {
  return String(v || '').trim().toLowerCase()
}

const CATEGORY_PREFIX_SET = new Set(['买小车', '卖小车', '零花钱', '生活日常', '其它'])

function ensureCategoryPrefix(category, note) {
  const c = String(category || '').trim()
  let n = String(note || '').trim()
  if (!CATEGORY_PREFIX_SET.has(c)) return n

  const prefix = `[${c}]`
  if (n.startsWith(prefix)) return n

  // 若已存在其他分类前缀（例如编辑后改了分类），先去掉旧前缀再套新前缀
  n = n.replace(/^\[[^\]]+\]\s*/, '')
  return n ? `${prefix} ${n}` : prefix
}

function findInventoryIndex({ name, brand, pool = 'sell' }) {
  const n = normalizeText(name)
  const b = normalizeText(brand)
  return store.paytonInventory.findIndex(
    (x) => normalizeText(x?.name) === n && normalizeText(x?.brand) === b && String(x?.pool || 'sell') === pool,
  )
}

function mergePaytonInventory({ name, brand, qty, avgPrice, pool = 'sell' }) {
  const nextQty = toNumber(qty)
  const nextAvg = toNumber(avgPrice)
  if (nextQty <= 0) return null

  const idx = findInventoryIndex({ name, brand, pool })
  if (idx >= 0) {
    const row = store.paytonInventory[idx]
    const oldQty = toNumber(row.qty)
    const oldAvg = toNumber(row.avgPrice)
    const mergedQty = oldQty + nextQty
    const mergedAvg = mergedQty > 0 ? (oldQty * oldAvg + nextQty * nextAvg) / mergedQty : nextAvg
    row.qty = mergedQty
    row.avgPrice = mergedAvg
    row.totalCost = mergedQty * mergedAvg
    row.pool = pool
    return row
  }

  const car = {
    id: genId(),
    name: name || '',
    brand: brand || '',
    qty: nextQty,
    avgPrice: nextAvg,
    totalCost: nextQty * nextAvg,
    pool,
  }
  store.paytonInventory.push(car)
  return car
}

function cleanupInventoryRow(car) {
  if (!car) return
  if (toNumber(car.qty) > 0) {
    car.totalCost = toNumber(car.qty) * toNumber(car.avgPrice)
    return
  }
  const idx = store.paytonInventory.findIndex((x) => x.id === car.id)
  if (idx >= 0) store.paytonInventory.splice(idx, 1)
}

function makeCarKey(name, brand) {
  return `${normalizeText(name)}__${normalizeText(brand)}`
}

function applyInventoryDeltaForBuy(payload = {}) {
  const name = String(payload.name || '').trim()
  const brand = String(payload.brand || '').trim()
  const qty = toNumber(payload.qty)
  const unitPrice = toNumber(payload.unitPrice)
  if (!name || qty <= 0 || unitPrice < 0) {
    return { ok: false, message: '车辆信息无效' }
  }
  mergePaytonInventory({
    name,
    brand,
    qty,
    avgPrice: unitPrice,
    pool: 'sell',
  })
  return { ok: true }
}

function rollbackInventoryDeltaForBuy(payload = {}) {
  const name = String(payload.name || '').trim()
  const brand = String(payload.brand || '').trim()
  const qty = toNumber(payload.qty)
  const unitPrice = toNumber(payload.unitPrice)
  if (!name || qty <= 0 || unitPrice < 0) {
    return { ok: false, message: '车辆信息无效' }
  }
  const idx = findInventoryIndex({ name, brand, pool: 'sell' })
  if (idx < 0) return { ok: false, message: `库存中未找到：${name}` }
  const row = store.paytonInventory[idx]
  const oldQty = toNumber(row.qty)
  const oldAvg = toNumber(row.avgPrice)
  if (oldQty < qty) {
    return { ok: false, message: `库存不足，当前 ${name} 仅 ${oldQty} 辆，需回滚 ${qty} 辆` }
  }
  const oldTotal = oldQty * oldAvg
  const rollbackTotal = qty * unitPrice
  const remainQty = oldQty - qty
  if (remainQty <= 0) {
    store.paytonInventory.splice(idx, 1)
    return { ok: true }
  }
  const remainTotal = oldTotal - rollbackTotal
  if (remainTotal < 0) {
    return { ok: false, message: `库存回滚后成本为负，已阻止：${name}` }
  }
  row.qty = remainQty
  row.avgPrice = remainQty > 0 ? remainTotal / remainQty : 0
  row.totalCost = remainQty > 0 ? remainTotal : 0
  return { ok: true }
}

function toInventoryLink(input = {}) {
  const type = String(input.type || '').trim()
  if (!type) return null
  return {
    type,
    carName: String(input.carName || '').trim(),
    carBrand: String(input.carBrand || '').trim(),
    qty: toNumber(input.qty),
    unitPrice: toNumber(input.unitPrice),
    totalCost: toNumber(input.totalCost),
    carKey: makeCarKey(input.carName, input.carBrand),
  }
}

function ensurePaytonAccount(accountKey) {
  if (!accountKey) return null
  if (!store.paytonAccounts[accountKey]) {
    store.paytonAccounts[accountKey] = {
      name: accountKey,
      balance: 0,
    }
  }
  return store.paytonAccounts[accountKey]
}

function applyBalance(accountKey, type, amount) {
  const account = ensurePaytonAccount(accountKey)
  if (!account) return

  const current = toNumber(account.balance)
  const amt = toNumber(amount)

  if (type === 'income') {
    account.balance = current + amt
  } else if (type === 'expense') {
    account.balance = current - amt
  }
}

function rollbackBalance(accountKey, type, amount) {
  const account = ensurePaytonAccount(accountKey)
  if (!account) return

  const current = toNumber(account.balance)
  const amt = toNumber(amount)

  if (type === 'income') {
    account.balance = current - amt
  } else if (type === 'expense') {
    account.balance = current + amt
  }
}

export function addPaytonRecord(recordData = {}) {
  const inventoryLink = toInventoryLink(recordData.inventoryLink)
  if (inventoryLink?.type === 'buy') {
    const applied = applyInventoryDeltaForBuy({
      name: inventoryLink.carName,
      brand: inventoryLink.carBrand,
      qty: inventoryLink.qty,
      unitPrice: inventoryLink.unitPrice,
    })
    if (!applied.ok) return null
  }

  const record = {
    id: genId(),
    createdAt: toPositiveTimestamp(recordData.createdAt),
    type: recordData.type,
    category: recordData.category || '',
    account: recordData.account || '',
    date: recordData.date || '',
    amount: toNumber(recordData.amount),
    note: ensureCategoryPrefix(recordData.category, recordData.note),
    inventoryLink,
  }

  store.paytonRecords.push(record)
  applyBalance(record.account, record.type, record.amount)
  saveToLocalStorage()
  addOperationLog('payton_add_record', `新增基金流水`, { type: record.type, amount: record.amount, account: record.account })
  return record
}

export function deletePaytonRecord(recordId) {
  const idx = store.paytonRecords.findIndex((x) => x.id === recordId)
  if (idx < 0) return false

  const record = store.paytonRecords[idx]
  if (record?.inventoryLink?.type === 'buy') {
    const rollbackResult = rollbackInventoryDeltaForBuy({
      name: record.inventoryLink.carName,
      brand: record.inventoryLink.carBrand,
      qty: record.inventoryLink.qty,
      unitPrice: record.inventoryLink.unitPrice,
    })
    if (!rollbackResult.ok) return false
  }
  rollbackBalance(record.account, record.type, record.amount)
  store.paytonRecords.splice(idx, 1)

  saveToLocalStorage()
  addOperationLog('payton_delete_record', `删除基金流水`, { recordId })
  return true
}

export function editPaytonRecord(recordId, newData = {}) {
  const record = store.paytonRecords.find((x) => x.id === recordId)
  if (!record) return false

  const beforeRecord = {
    ...record,
  }

  const incomingInventoryLink =
    Object.prototype.hasOwnProperty.call(newData, 'inventoryLink')
      ? toInventoryLink(newData.inventoryLink)
      : record.inventoryLink || null

  if (record?.inventoryLink?.type === 'buy') {
    const rollbackResult = rollbackInventoryDeltaForBuy({
      name: record.inventoryLink.carName,
      brand: record.inventoryLink.carBrand,
      qty: record.inventoryLink.qty,
      unitPrice: record.inventoryLink.unitPrice,
    })
    if (!rollbackResult.ok) return false
  }

  // 回滚旧记录
  rollbackBalance(record.account, record.type, record.amount)

  // 更新记录
  Object.keys(newData).forEach((key) => {
    if (key === 'amount') {
      record.amount = toNumber(newData.amount)
    } else if (key === 'inventoryLink') {
      record.inventoryLink = incomingInventoryLink
    } else {
      record[key] = newData[key]
    }
  })

  if (!Object.prototype.hasOwnProperty.call(newData, 'inventoryLink')) {
    record.inventoryLink = incomingInventoryLink
  }

  // 统一按分类补齐/纠正前缀
  record.note = ensureCategoryPrefix(record.category, record.note)

  // 应用新记录
  applyBalance(record.account, record.type, record.amount)

  if (record?.inventoryLink?.type === 'buy') {
    const applied = applyInventoryDeltaForBuy({
      name: record.inventoryLink.carName,
      brand: record.inventoryLink.carBrand,
      qty: record.inventoryLink.qty,
      unitPrice: record.inventoryLink.unitPrice,
    })
    if (!applied.ok) {
      rollbackBalance(record.account, record.type, record.amount)
      Object.keys(beforeRecord).forEach((k) => {
        record[k] = beforeRecord[k]
      })
      applyBalance(beforeRecord.account, beforeRecord.type, beforeRecord.amount)
      if (beforeRecord?.inventoryLink?.type === 'buy') {
        applyInventoryDeltaForBuy({
          name: beforeRecord.inventoryLink.carName,
          brand: beforeRecord.inventoryLink.carBrand,
          qty: beforeRecord.inventoryLink.qty,
          unitPrice: beforeRecord.inventoryLink.unitPrice,
        })
      }
      return false
    }
  }

  const changes = {}
  Object.keys(newData).forEach((key) => {
    const before = beforeRecord[key]
    const after = record[key]
    if (valueForCompare(before) !== valueForCompare(after)) {
      changes[key] = { before, after }
    }
  })

  saveToLocalStorage()
  addOperationLog('payton_edit_record', `编辑基金流水`, {
    recordId,
    changedFields: Object.keys(changes),
    changes,
  })
  return record
}

export function addPaytonCar(carData = {}) {
  const qty = toNumber(carData.qty)
  const avgPrice = toNumber(carData.avgPrice)

  const car = mergePaytonInventory({
    name: carData.name,
    brand: carData.brand,
    qty,
    avgPrice,
    pool: 'sell',
  })
  saveToLocalStorage()
  addOperationLog('payton_add_car', `新增小车`, { name: car.name, qty: car.qty })
  return car
}

export function addPaytonCarByPurchase(carData = {}) {
  const car = mergePaytonInventory({
    name: carData.name,
    brand: carData.brand,
    qty: toNumber(carData.qty),
    avgPrice: toNumber(carData.avgPrice),
    pool: 'sell',
  })
  saveToLocalStorage()
  addOperationLog('payton_buy_car', `买入小车`, { name: car?.name, qty: car?.qty })
  return car
}

export function adjustPaytonInventoryByRecord(inventoryData = {}) {
  const before = inventoryData.before || {}
  const after = inventoryData.after || {}
  const beforeTotal = toNumber(before.qty) * toNumber(before.avgPrice)
  const afterTotal = toNumber(after.qty) * toNumber(after.avgPrice)
  const diff = Number((afterTotal - beforeTotal).toFixed(2))
  if (diff === 0) return null

  const type = diff > 0 ? 'expense' : 'income'
  const amount = Math.abs(diff)
  const account = String(inventoryData.account || 'yeb').trim() || 'yeb'
  const date = inventoryData.date || new Date().toISOString().slice(0, 10)
  const note = `[库存调整] ${before.name || after.name || '-'} ${before.qty || 0}->${after.qty || 0}，均价 ${before.avgPrice || 0}->${after.avgPrice || 0}`
  return addPaytonRecord({
    type,
    category: '其它',
    account,
    date,
    amount,
    note,
  })
}

export function sellPaytonCar(carId, sellData = {}) {
  const car = store.paytonInventory.find((x) => x.id === carId)
  if (!car) return false
  if (String(car.pool || 'sell') !== 'sell') return false

  const qty = toNumber(sellData.qty)
  const sellPrice = toNumber(sellData.sellPrice)

  if (qty <= 0 || qty > toNumber(car.qty)) return false

  car.qty = toNumber(car.qty) - qty
  car.totalCost = toNumber(car.qty) * toNumber(car.avgPrice)

  if (car.qty === 0) {
    const idx = store.paytonInventory.findIndex((x) => x.id === carId)
    if (idx >= 0) store.paytonInventory.splice(idx, 1)
  }

  const revenue = qty * sellPrice
  addPaytonRecord({
    type: 'income',
    category: '卖小车',
    account: sellData.account || 'yeb',
    date: sellData.date || '',
    amount: revenue,
    note: `[卖小车] 卖出${car.name} x${qty}`,
  })

  saveToLocalStorage()
  addOperationLog('payton_sell_car', `卖出小车`, { carId, qty, sellPrice, account: sellData.account })
  return true
}

export function movePaytonCarToKeep(carId, qty, keepTotalCost) {
  const source = store.paytonInventory.find((x) => x.id === carId)
  if (!source) return false
  if (String(source.pool || 'sell') !== 'sell') return false
  const n = toNumber(qty)
  if (n <= 0 || n > toNumber(source.qty)) return false

  const sourceQty = toNumber(source.qty)
  const sourceAvg = toNumber(source.avgPrice)
  const sourceTotalCost = sourceQty * sourceAvg
  const movedTotalCost = toNumber(keepTotalCost)
  if (movedTotalCost <= 0 || movedTotalCost > sourceTotalCost) return false

  const remainQty = sourceQty - n
  const remainTotalCost = sourceTotalCost - movedTotalCost

  source.qty = remainQty
  source.avgPrice = remainQty > 0 ? remainTotalCost / remainQty : 0
  source.totalCost = remainQty > 0 ? remainTotalCost : 0
  cleanupInventoryRow(source)

  const movedAvgPrice = n > 0 ? movedTotalCost / n : 0
  mergePaytonInventory({
    name: source.name,
    brand: source.brand,
    qty: n,
    avgPrice: movedAvgPrice,
    pool: 'keep',
  })

  saveToLocalStorage()
  addOperationLog('payton_move_keep', `转入自留库`, { carId, qty: n, keepTotalCost: movedTotalCost })
  return true
}

export function movePaytonCarToSell(carId, qty) {
  const source = store.paytonInventory.find((x) => x.id === carId)
  if (!source) return false
  if (String(source.pool || 'sell') !== 'keep') return false
  const n = toNumber(qty)
  if (n <= 0 || n > toNumber(source.qty)) return false

  source.qty = toNumber(source.qty) - n
  cleanupInventoryRow(source)
  mergePaytonInventory({
    name: source.name,
    brand: source.brand,
    qty: n,
    avgPrice: toNumber(source.avgPrice),
    pool: 'sell',
  })

  saveToLocalStorage()
  addOperationLog('payton_move_sell', `移出自留库`, { carId, qty: n })
  return true
}

export function getPaytonStats(accounts = {}, records = [], inventory = []) {
  const totalAccountBalance = Object.values(accounts).reduce(
    (sum, account) => sum + toNumber(account?.balance),
    0,
  )

  const inventoryValue = inventory.reduce((sum, car) => sum + toNumber(car?.totalCost), 0)
  const totalModels = inventory.length
  const totalCars = inventory.reduce((sum, car) => sum + toNumber(car?.qty), 0)

  const sellPool = inventory.filter((car) => String(car?.pool || 'sell') === 'sell')
  const keepPool = inventory.filter((car) => String(car?.pool || 'sell') === 'keep')
  const poolStats = (list) => ({
    models: list.length,
    cars: list.reduce((sum, car) => sum + toNumber(car?.qty), 0),
    value: list.reduce((sum, car) => sum + toNumber(car?.totalCost), 0),
  })

  const totalIncome = records.reduce(
    (sum, r) => (r?.type === 'income' ? sum + toNumber(r.amount) : sum),
    0,
  )

  const totalExpense = records.reduce(
    (sum, r) => (r?.type === 'expense' ? sum + toNumber(r.amount) : sum),
    0,
  )

  return {
    totalAccountBalance,
    inventoryValue,
    totalModels,
    totalCars,
    totalIncome,
    totalExpense,
    sellStats: poolStats(sellPool),
    keepStats: poolStats(keepPool),
  }
}

export function usePayton() {
  return {
    addPaytonRecord,
    deletePaytonRecord,
    editPaytonRecord,
    addPaytonCar,
    addPaytonCarByPurchase,
    sellPaytonCar,
    movePaytonCarToKeep,
    movePaytonCarToSell,
    getPaytonStats,
  }
}
