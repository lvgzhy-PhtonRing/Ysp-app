// 操作日志回溯工具（纯函数，不依赖 store 实例）
//
// 用途：验证日志完整性 —— 从当前状态出发，仅凭操作日志反向回放，
// 还原到任意时间点的数据。仅作验证/研究工具，不接入 UI。

const clone = (value) => JSON.parse(JSON.stringify(value))

// ── 回放能力分级 ──────────────────────────────────────────────
// full    日志含完整 before 数据，可精确逆放
// partial 日志记录了变更内容，但缺少部分前置状态，逆放不精确
// barrier 整体状态替换类操作，日志无法表达，遇到即中止回放
// noop    无业务变更（系统/云端提示类），回放时跳过
const CAP = { FULL: 'full', PARTIAL: 'partial', BARRIER: 'barrier', NOOP: 'noop' }

export const LOG_REPLAY_CAPABILITY = {
  inventory_delete: CAP.FULL,
  inventory_manual_add: CAP.FULL,
  inventory_edit: CAP.FULL,
  inventory_unlist: CAP.PARTIAL,
  inventory_long_term: CAP.PARTIAL,
  inventory_sales_sync: CAP.FULL,
  sales_submit: CAP.FULL,
  sales_unlist: CAP.FULL,
  sales_rollback: CAP.FULL,
  sales_edit: CAP.FULL,
  purchase_add: CAP.FULL,
  purchase_delete: CAP.FULL,
  purchase_transfer: CAP.FULL,
  purchase_transfer_edit: CAP.FULL,
  purchase_transfer_delete: CAP.FULL,
  purchase_to_inventory: CAP.FULL,
  purchase_batch_to_inventory: CAP.FULL,
  purchase_group_edit: CAP.PARTIAL,
  purchase_edit: CAP.FULL,
  finance_add_record: CAP.FULL,
  finance_delete_record: CAP.FULL,
  finance_update_record: CAP.FULL,
  finance_add_loan: CAP.FULL,
  finance_delete_loan: CAP.FULL,
  finance_update_loan: CAP.FULL,
  finance_repaid: CAP.NOOP,
  calc_update: CAP.FULL,
  home_calc: CAP.PARTIAL,
  market_price_update: CAP.PARTIAL,
  app_import: CAP.BARRIER,
  cloud_pull: CAP.BARRIER,
  app_undo: CAP.BARRIER,
  app_redo: CAP.BARRIER,
  cloud_sync: CAP.NOOP,
  cloud_settings: CAP.NOOP,
  cloud_signin: CAP.NOOP,
  cloud_signout: CAP.NOOP,
  cloud_conflict: CAP.NOOP,
  app_export: CAP.NOOP,
  app_auto_backup: CAP.NOOP,
}

// ── 回溯必需字段契约表 ────────────────────────────────────────
// 每个类型的 detail 必须包含哪些字段，才能支撑反向回放
export const LOG_DETAIL_CONTRACT = {
  inventory_delete: ['sid', 'itemId', 'deletedItems'],
  inventory_manual_add: ['itemId', 'name', 'sid'],
  inventory_edit: ['sid', 'changes'],
  inventory_unlist: ['itemId', 'itemIds', 'before'],
  inventory_long_term: ['itemIds', 'itemNames'],
  inventory_sales_sync: ['sid', 'itemIds'],
  sales_submit: ['itemId', 'name', 'before'],
  sales_unlist: ['itemId', 'name', 'before'],
  sales_rollback: ['itemId', 'name', 'before'],
  sales_edit: ['itemId', 'changes'],
  purchase_add: ['name', ['itemIds', 'itemId']],
  purchase_delete: ['itemId', 'deletedItems'],
  purchase_transfer: ['transferId', 'itemIds', 'itemCosts'],
  purchase_transfer_edit: ['transferId', 'changes'],
  purchase_transfer_delete: ['transferId', 'transfer', 'affectedItems'],
  purchase_to_inventory: ['itemId', 'name'],
  purchase_batch_to_inventory: ['itemIds', 'itemNames'],
  purchase_group_edit: ['purchaseGroupId', 'changes'],
  purchase_edit: ['sid', 'itemId', 'changes'],
  finance_add_record: ['recordId'],
  finance_delete_record: ['recordId', 'record'],
  finance_update_record: ['recordId', 'changes'],
  finance_add_loan: ['loanId'],
  finance_delete_loan: ['loanId', 'loan'],
  finance_update_loan: ['loanId', 'changes'],
  calc_update: ['field', 'before'],
  market_price_update: ['sid', 'name'],
}

// 未知类型 / 无业务变更类型不参与契约校验
const VALIDATED_TYPES = new Set(Object.keys(LOG_DETAIL_CONTRACT))

/**
 * 校验单条日志的 detail 是否满足回溯契约
 * @returns {{ok: boolean, missing: string[], capability: string}}
 */
export function validateLogDetail(log) {
  const type = log?.type
  const capability = LOG_REPLAY_CAPABILITY[type] || 'unknown'
  const required = LOG_DETAIL_CONTRACT[type]

  if (!type || !VALIDATED_TYPES.has(type)) {
    return { ok: true, missing: [], capability }
  }

  const detail = log.detail
  const missing = []
  if (!detail || typeof detail !== 'object' || Array.isArray(detail)) {
    required.forEach((field) => missing.push(field))
    return { ok: false, missing, capability }
  }

  required.forEach((field) => {
    // 数组表示「任一字段满足即可」
    const fields = Array.isArray(field) ? field : [field]
    if (!fields.some((f) => detail[f] !== undefined && detail[f] !== null && detail[f] !== '')) {
      missing.push(fields.join(' | '))
    }
  })

  return { ok: missing.length === 0, missing, capability }
}

// ── 内部工具 ──────────────────────────────────────────────────

const findItem = (items, id) => items.find((x) => x?.id === id)

function removeById(collection, field, id) {
  const idx = collection.findIndex((x) => x?.[field] === id)
  if (idx >= 0) collection.splice(idx, 1)
}

function restoreItems(state, deletedItems) {
  if (!Array.isArray(deletedItems)) return
  const items = state.items || (state.items = [])
  deletedItems.forEach((item) => {
    if (!item || !item.id || items.some((x) => x.id === item.id)) return
    items.push(clone(item))
  })
}

function applyChangesTo(target, changes, keyMap) {
  if (!target || !changes || typeof changes !== 'object') return
  Object.keys(changes).forEach((key) => {
    const entry = changes[key]
    const before = entry && typeof entry === 'object' ? entry.before : entry
    const field = keyMap && keyMap[key] !== undefined ? keyMap[key] : key
    target[field] = clone(before)
  })
}

// 采购商品状态回退：status → purchase，清除入库标记
function revertToPurchase(item) {
  if (!item) return
  item.status = 'purchase'
  delete item.inStockDate
  delete item.arrivedDate
}

// 销售记录回退：恢复库存态，清除销售明细
function revertSale(item) {
  if (!item) return
  item.status = 'inventory'
  item.stock = 1
  delete item.saleDetails
}

// ── 逐类型逆操作 ──────────────────────────────────────────────

const INVERSE_HANDLERS = {
  inventory_delete: (state, d) => restoreItems(state, d.deletedItems),

  inventory_manual_add: (state, d) => removeById(state.items, 'id', d.itemId),

  inventory_edit: (state, d) => {
    (state.items || []).forEach((item) => {
      if (item?.sid && item.sid === d.sid && item.status === 'inventory') {
        applyChangesTo(item, d.changes)
      }
    })
  },

  inventory_unlist: (state, d) => {
    if (!Array.isArray(d.before)) return
    d.before.forEach((entry) => {
      const item = findItem(state.items, entry?.itemId)
      if (!item) return
      item.status = entry.status
      item.isLongTerm = !!entry.isLongTerm
      delete item.unlistDetails
    })
  },

  inventory_long_term: () => {},

  inventory_sales_sync: (state, d) => {
    if (!Array.isArray(d.itemIds)) return
    d.itemIds.forEach((id) => revertSale(findItem(state.items, id)))
  },

  sales_submit: (state, d) => {
    const item = findItem(state.items, d.itemId)
    if (!item) return
    if (d.before) {
      item.status = d.before.status
      item.stock = d.before.stock
    }
    delete item.saleDetails
  },

  sales_unlist: (state, d) => {
    const item = findItem(state.items, d.itemId)
    if (!item) return
    if (d.before) item.status = d.before.status
    delete item.unlistDetails
  },

  sales_rollback: (state, d) => {
    const item = findItem(state.items, d.itemId)
    if (!item || !d.before) return
    item.status = d.before.status
    item.stock = d.before.stock
    if (d.before.saleDetails) item.saleDetails = clone(d.before.saleDetails)
    else delete item.saleDetails
  },

  sales_edit: (state, d) => {
    const item = findItem(state.items, d.itemId)
    if (!item) return
    if (!item.saleDetails) item.saleDetails = {}
    applyChangesTo(item.saleDetails, d.changes)
  },

  purchase_add: (state, d) => {
    const ids = Array.isArray(d.itemIds)
      ? d.itemIds
      : [d.itemId].filter((x) => x !== undefined && x !== null)
    ids.forEach((id) => removeById(state.items, 'id', id))
  },

  purchase_delete: (state, d) => restoreItems(state, d.deletedItems),

  purchase_transfer: (state, d) => {
    if (!Array.isArray(d.itemCosts)) return
    d.itemCosts.forEach((entry) => {
      const item = findItem(state.items, entry?.itemId)
      if (!item) return
      if (!item.purchaseDetails) item.purchaseDetails = {}
      item.purchaseDetails.transferStatus = 'pending'
      item.purchaseDetails.transferCost = 0
      delete item.purchaseDetails.transferId
      delete item.purchaseDetails.transferBatch
      item.cost = entry.costBefore
    })
    removeById(state.transfers, 'transferId', d.transferId)
  },

  purchase_transfer_edit: (state, d) => {
    const record = (state.transfers || []).find((r) => r?.transferId === d.transferId)
    applyChangesTo(record, d.changes, {
      日期: 'date',
      总费用RMB: 'totalRMB',
      支付账户: 'paymentAccount',
      转运公司: 'company',
    })
  },

  purchase_transfer_delete: (state, d) => {
    if (d.transfer) state.transfers = state.transfers || []
    if (d.transfer && !state.transfers.some((r) => r?.transferId === d.transfer.transferId)) {
      state.transfers.push(clone(d.transfer))
    }
    if (!Array.isArray(d.affectedItems)) return
    d.affectedItems.forEach((entry) => {
      const item = findItem(state.items, entry?.itemId)
      if (!item) return
      if (!item.purchaseDetails) item.purchaseDetails = {}
      item.cost = entry.cost
      item.purchaseDetails.transferStatus = entry.transferStatus
      item.purchaseDetails.transferCost = entry.transferCost
      if (entry.transferId) item.purchaseDetails.transferId = entry.transferId
      else delete item.purchaseDetails.transferId
      if (entry.transferBatch) item.purchaseDetails.transferBatch = entry.transferBatch
      else delete item.purchaseDetails.transferBatch
    })
  },

  purchase_to_inventory: (state, d) => {
    const item = findItem(state.items, d.itemId)
    const transferId = item?.purchaseDetails?.transferId
    ;(state.items || []).forEach((x) => {
      if (transferId ? x?.purchaseDetails?.transferId === transferId : x?.id === d.itemId) {
        revertToPurchase(x)
      }
    })
  },

  purchase_batch_to_inventory: (state, d) => {
    if (!Array.isArray(d.itemIds)) return
    d.itemIds.forEach((id) => revertToPurchase(findItem(state.items, id)))
  },

  purchase_group_edit: () => {},

  purchase_edit: (state, d) => {
    const item = findItem(state.items, d.itemId)
    applyChangesTo(item, d.changes)
  },

  finance_add_record: (state, d) => removeById(state.financeRecords, 'id', d.recordId),

  finance_delete_record: (state, d) => {
    if (d.record && !state.financeRecords.some((r) => r?.id === d.record.id)) {
      state.financeRecords = state.financeRecords || []
      state.financeRecords.push(clone(d.record))
    }
  },

  finance_update_record: (state, d) => {
    const record = (state.financeRecords || []).find((r) => r?.id === d.recordId)
    applyChangesTo(record, d.changes)
  },

  finance_add_loan: (state, d) => removeById(state.loanRecords, 'id', d.loanId),

  finance_delete_loan: (state, d) => {
    if (d.loan && !state.loanRecords.some((r) => r?.id === d.loan.id)) {
      state.loanRecords = state.loanRecords || []
      state.loanRecords.push(clone(d.loan))
    }
  },

  finance_update_loan: (state, d) => {
    const loan = (state.loanRecords || []).find((r) => r?.id === d.loanId)
    applyChangesTo(loan, d.changes)
  },

  calc_update: (state, d) => {
    if (!state.calc) state.calc = {}
    state.calc[d.field] = clone(d.before)
  },
}

/**
 * 从当前状态反向回放，还原到 targetTime 时刻的数据。
 *
 * 处理方式：取所有 time > targetTime 的日志（最新在前）依次应用逆操作。
 * targetTime 为空时回放全部日志（还原到「首条日志之前」）。
 *
 * @param {object} currentState 形如 {items, calc, financeRecords, loanRecords, transfers}
 * @param {Array} logs store.operationLogs（时间升序或降序均可）
 * @param {string|null} targetTime ISO 时间戳
 * @returns {{state: object, skipped: Array, barriers: Array}}
 */
export function reconstructAtTime(currentState, logs = [], targetTime = null) {
  const state = clone(currentState || {})
  const skipped = []
  const barriers = []

  // 统一初始化各集合，避免缺省字段时逆操作抛错被误记 skipped
  state.items = Array.isArray(state.items) ? state.items : []
  state.calc = state.calc && typeof state.calc === 'object' ? state.calc : {}
  state.financeRecords = Array.isArray(state.financeRecords) ? state.financeRecords : []
  state.loanRecords = Array.isArray(state.loanRecords) ? state.loanRecords : []
  state.transfers = Array.isArray(state.transfers) ? state.transfers : []

  const targetMs = targetTime ? new Date(targetTime).getTime() : null
  const candidates = (logs || []).filter((log) => {
    if (!log || !log.time) return false
    if (targetMs === null) return true
    return new Date(log.time).getTime() > targetMs
  }).slice().sort((a, b) => new Date(b.time) - new Date(a.time))

  for (const log of candidates) {
    const type = log.type
    const d = log.detail || {}

    if (LOG_REPLAY_CAPABILITY[type] === CAP.BARRIER) {
      barriers.push({ id: log.id, type, time: log.time, message: log.message })
      break
    }

    // 云端"下载覆盖本地"类同步等同整体状态替换
    if (type === 'cloud_sync' && /下载|选择使用云端数据/.test(String(log.message || ''))) {
      barriers.push({ id: log.id, type, time: log.time, message: log.message })
      break
    }

    const handler = INVERSE_HANDLERS[type]
    if (!handler) {
      skipped.push({ id: log.id, type, time: log.time, reason: 'no_inverse_handler' })
      continue
    }

    try {
      handler(state, d)
    } catch (err) {
      skipped.push({ id: log.id, type, time: log.time, reason: String(err && err.message || err) })
    }
  }

  return { state, skipped, barriers }
}
