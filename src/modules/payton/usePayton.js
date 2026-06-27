// Payton 基金模块逻辑层（无 UI）

import { addOperationLog, formatChangesSummary, saveToLocalStorage, state as store } from '../../data/store'

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

function removeFromPaytonInventory({ carId, name, brand, qty, avgPrice, pool = 'sell' }) {
  const removeQty = toNumber(qty)
  const removeAvg = toNumber(avgPrice)
  if (removeQty <= 0) return null

  // 优先 carId 查找，回退 name+brand+pool
  let idx = -1
  if (carId) {
    idx = store.paytonInventory.findIndex((x) => x.id === carId && String(x?.pool || 'sell') === pool)
  }
  if (idx < 0) {
    const n = normalizeText(name || '')
    const b = normalizeText(brand || '')
    idx = store.paytonInventory.findIndex(
      (x) => normalizeText(x?.name) === n && normalizeText(x?.brand) === b && String(x?.pool || 'sell') === pool,
    )
  }
  if (idx < 0) {
    console.warn('[removeFromPaytonInventory] 未找到库存条目，跳过', { carId, name, brand, qty, avgPrice, pool })
    return null
  }

  const row = store.paytonInventory[idx]
  const currentQty = toNumber(row.qty)
  const currentAvg = toNumber(row.avgPrice)
  const actualRemoveQty = Math.min(removeQty, currentQty)
  const removedTotalCost = actualRemoveQty * removeAvg
  const newQty = currentQty - actualRemoveQty
  const newAvg = newQty > 0 ? (currentQty * currentAvg - removedTotalCost) / newQty : 0

  if (newQty <= 0) {
    store.paytonInventory.splice(idx, 1)
  } else {
    row.qty = newQty
    row.avgPrice = newAvg
    row.totalCost = newQty * newAvg
  }
  return row
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
  const record = {
    id: genId(),
    createdAt: toPositiveTimestamp(recordData.createdAt),
    type: recordData.type,
    category: recordData.category || '',
    account: recordData.account || '',
    date: recordData.date || '',
    amount: toNumber(recordData.amount),
    note: ensureCategoryPrefix(recordData.category, recordData.note),
    carId: recordData.carId || null,
    carQty: recordData.carQty || null,
    carUnitPrice: recordData.carUnitPrice || null,
    carName: recordData.carName || null,
    carBrand: recordData.carBrand || null,
  }

  store.paytonRecords.push(record)
  applyBalance(record.account, record.type, record.amount)
  saveToLocalStorage()
  addOperationLog('payton_add_record', `新增基金流水: ${record.category || record.type || '-'}${record.carName ? ' | ' + record.carName : ''}`, {
    type: record.type,
    amount: record.amount,
    account: record.account,
    category: record.category,
    carName: record.carName,
    date: record.date,
  })
  return record
}

export function deletePaytonRecord(recordId) {
  const idx = store.paytonRecords.findIndex((x) => x.id === recordId)
  if (idx < 0) return false

  const record = store.paytonRecords[idx]

  // 库存联动（best-effort）
  if (record.carQty && record.carUnitPrice) {
    try {
      if (record.category === '买小车') {
        removeFromPaytonInventory({
          carId: record.carId,
          name: record.carName,
          brand: record.carBrand,
          qty: record.carQty,
          avgPrice: record.carUnitPrice,
          pool: 'sell',
        })
      } else if (record.category === '卖小车') {
        mergePaytonInventory({
          name: record.carName,
          brand: record.carBrand,
          qty: record.carQty,
          avgPrice: record.carUnitPrice,
          pool: 'sell',
        })
      }
    } catch (e) {
      console.warn('[deletePaytonRecord] 库存联动失败，继续执行', e)
    }
  }

  rollbackBalance(record.account, record.type, record.amount)
  store.paytonRecords.splice(idx, 1)

  saveToLocalStorage()
  addOperationLog('payton_delete_record', `删除基金流水: ${record.category || '-'}${record.carName ? ' | ' + record.carName : ''}`, {
    recordId,
    category: record.category,
    amount: record.amount,
    account: record.account,
    carName: record.carName,
  })
  return true
}

export function editPaytonRecord(recordId, newData = {}) {
  const record = store.paytonRecords.find((x) => x.id === recordId)
  if (!record) return false

  const beforeRecord = {
    ...record,
  }

  // 库存联动：编辑买小车金额时更新均价（best-effort）
  const isBuyCar = record.category === '买小车'
  const hasAmountChange = 'amount' in newData
  if (isBuyCar && hasAmountChange && record.carQty && record.carUnitPrice) {
    try {
      const oldUnitPrice = record.carUnitPrice
      const newAmount = toNumber(newData.amount)
      const newUnitPrice = newAmount > 0 ? newAmount / record.carQty : 0
      // 移除旧贡献
      removeFromPaytonInventory({
        carId: record.carId,
        name: record.carName,
        brand: record.carBrand,
        qty: record.carQty,
        avgPrice: oldUnitPrice,
        pool: 'sell',
      })
      // 添加新贡献
      if (newUnitPrice > 0) {
        mergePaytonInventory({
          name: record.carName,
          brand: record.carBrand,
          qty: record.carQty,
          avgPrice: newUnitPrice,
          pool: 'sell',
        })
      }
      // 更新 carUnitPrice 以便后续删除时正确回滚
      record.carUnitPrice = newUnitPrice
    } catch (e) {
      console.warn('[editPaytonRecord] 库存均价联动失败，继续执行', e)
    }
  }

  // 回滚旧记录
  rollbackBalance(record.account, record.type, record.amount)

  // 更新记录
  Object.keys(newData).forEach((key) => {
    if (key === 'amount') {
      record.amount = toNumber(newData.amount)
    } else if (key !== 'carUnitPrice') {
      // carUnitPrice is handled above; skip direct set
      record[key] = newData[key]
    }
  })

  // 统一按分类补齐/纠正前缀
  record.note = ensureCategoryPrefix(record.category, record.note)

  // 应用新记录
  applyBalance(record.account, record.type, record.amount)

  const changes = {}
  Object.keys(newData).forEach((key) => {
    const before = beforeRecord[key]
    const after = record[key]
    if (valueForCompare(before) !== valueForCompare(after)) {
      changes[key] = { before, after }
    }
  })

  saveToLocalStorage()
  var changesText = formatChangesSummary(changes)
  addOperationLog('payton_edit_record', '编辑流水: ' + (record.category || '-') + (record.carName ? ' | ' + record.carName : '') + (changesText ? ' ← ' + changesText : ''), {
    recordId: recordId,
    category: record.category,
    carName: record.carName,
    account: record.account,
    changedFields: Object.keys(changes),
    changes: changes,
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

export function sellPaytonCar(carId, sellData = {}) {
  const car = store.paytonInventory.find((x) => x.id === carId)
  if (!car) return false
  if (String(car.pool || 'sell') !== 'sell') return false

  const qty = toNumber(sellData.qty)
  const sellPrice = toNumber(sellData.sellPrice)

  if (qty <= 0 || qty > toNumber(car.qty)) return false

  // 在 qty 被修改之前捕获成本价和车辆信息
  const avgPriceAtSale = toNumber(car.avgPrice)
  const carNameAtSale = car.name
  const carBrandAtSale = car.brand

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
    carId: car.id,
    carQty: qty,
    carUnitPrice: avgPriceAtSale,
    carName: carNameAtSale,
    carBrand: carBrandAtSale,
  })

  saveToLocalStorage()
  addOperationLog('payton_sell_car', `卖出小车: ${carNameAtSale || '-'}`, {
    carId,
    carName: carNameAtSale,
    carBrand: carBrandAtSale,
    qty,
    sellPrice,
    avgPriceAtSale,
    account: sellData.account,
  })
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
  addOperationLog('payton_move_keep', `转入自留库: ${source.name || '-'}`, {
    carId,
    carName: source.name,
    carBrand: source.brand,
    qty: n,
    keepTotalCost: movedTotalCost,
    movedAvgPrice,
  })
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
  addOperationLog('payton_move_sell', `移出自留库: ${source.name || '-'}`, {
    carId,
    carName: source.name,
    carBrand: source.brand,
    qty: n,
  })
  return true
}

export function clearCarRefFromRecords(carId) {
  store.paytonRecords.forEach((record) => {
    if (record.carId === carId) {
      record.carId = null
    }
  })
  saveToLocalStorage()
}

export function syncPaytonRecordsForCarRename(carId, oldName, newName) {
  store.paytonRecords.forEach((record) => {
    if (record.carId !== carId) return
    if (record.note && record.note.includes(oldName)) {
      record.note = record.note.replace(oldName, newName)
    }
  })
  saveToLocalStorage()
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
    clearCarRefFromRecords,
    syncPaytonRecordsForCarRename,
  }
}
