// 全局状态管理：承接应用主数据、导入导出、localStorage 持久化

import { reactive } from 'vue'

const APP_VERSION = '3.9.0'
const CLOUD_SYNC_DEBOUNCE_MS = 800
const MAX_UNDO_STEPS = 20
const HISTORY_META_EXPIRE_MS = 3000
var DELETE_MERGE_WINDOW_MS = 500
var DELETE_LOG_TYPES = { inventory_delete: true, purchase_delete: true }

// 操作日志：字段名→中文映射（编辑日志内联摘要用）
export const FIELD_LABEL_MAP = {
  name: '名称', brand: '品牌', cost: '成本', category: '大类', batch: '批次',
  amount: '金额', type: '类型', date: '日期', account: '账户', note: '备注',
  isDefect: '品相', isLongTerm: '长线',
  marketPrices: '市场价格',
  price: '售价', express: '运费', feeRate: '费率', deduction: '扣减',
  totalRMB: '总RMB', paymentBatch: '支付批次', paymentAccount: '支付账户',
  exchangeRate: '汇率', originalPrice: '日元原价', domesticShipping: '国内运费',
  transferCoefficient: '分摊系数',
  item: '项目', counterparty: '对方',
  debt: '总负债', wechat: '微信余额', publicExp: '公摊支出',
  unconfirmed: '未确认款', fund: '备用金',
  website: '网站', discount: '折扣', fee: '手续费',
  transferBatch: '转运批次', inStockDate: '入库日期',
  // 云同步冲突差异用（与编辑日志共用同一映射）
  status: '状态', qty: '数量', sid: '编号',
  saleDetails: '销售信息', purchaseDetails: '采购信息',
  company: '转运公司', isRepaid: '已还款', repaid: '已还款',
}

function fmtBrief(v) {
  if (v === null || v === undefined || v === '') return '-'
  if (typeof v === 'number') return '¥' + Number(v).toFixed(0)
  if (typeof v === 'boolean') return v ? '是' : '否'
  return String(v).slice(0, 20)
}

/**
 * 将 changes 对象转为可读摘要字符串
 * @param {object} changes — { fieldName: { before, after } }
 * @returns {string} 如 "名称, 成本:¥80→¥87"
 */
export function formatChangesSummary(changes) {
  if (!changes || typeof changes !== 'object') return ''
  var entries = Object.entries(changes)
  if (entries.length === 0) return ''
  var parts = entries.map(function (entry) {
    var key = entry[0]
    var val = entry[1]
    var label = FIELD_LABEL_MAP[key] || key
    if (val && typeof val === 'object' && 'changed' in val) {
      return label + '已变更'
    }
    if (val && typeof val === 'object' && 'before' in val && 'after' in val) {
      return label + ':' + fmtBrief(val.before) + '→' + fmtBrief(val.after)
    }
    return label
  })
  return parts.join(', ')
}

const DEFAULT_CALC = {
  debt: 0,
  wechat: 0,
  publicExp: 0,
  unconfirmed: 0,
  fund: 0,
  forwarderBalance: 0,
  watchBalance: 0,
}

const DEFAULT_RUSHCAR = {
  entries: [],
  forwarderInfos: [],
  mattelSiteInfos: [],
  paymentCards: [],
}

const DEFAULT_CLOUD_SETTINGS = {
  supabaseUrl: '',
  supabaseAnonKey: '',
  stateId: 'main',
  enabled: false,
  publicRead: true,
}

const DEFAULT_CLOUD_SESSION = {
  accessToken: '',
  refreshToken: '',
  expiresAt: 0,
  tokenType: 'bearer',
  user: {
    id: '',
    email: '',
  },
}

const DEFAULT_CLOUD_STATUS = {
  syncing: false,
  connected: false,
  lastSyncAt: '',
  lastSyncError: '',
  lastCloudLoadAt: '',
  lastCloudLoadError: '',
}

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function replaceArray(target, source) {
  target.splice(0, target.length, ...(Array.isArray(source) ? clone(source) : []))
}

function replaceObject(target, source) {
  Object.keys(target).forEach((key) => delete target[key])
  Object.assign(target, clone(source || {}))
}

function normalizeRushCarData(input = {}) {
  const data = input && typeof input === 'object' ? input : {}
  return {
    entries: Array.isArray(data.entries) ? clone(data.entries) : [],
    forwarderInfos: Array.isArray(data.forwarderInfos) ? clone(data.forwarderInfos) : [],
    mattelSiteInfos: Array.isArray(data.mattelSiteInfos) ? clone(data.mattelSiteInfos) : [],
    paymentCards: Array.isArray(data.paymentCards) ? clone(data.paymentCards) : [],
  }
}

export const state = reactive({
  // 字段名与 a.json 对应映射后的 store 结构保持一致
  items: [],
  calc: { ...DEFAULT_CALC },
  financeRecords: [],
  loanRecords: [],
  transfers: [],
  rushcar: clone(DEFAULT_RUSHCAR),
  version: APP_VERSION,
  cloudSettings: {
    ...DEFAULT_CLOUD_SETTINGS,
  },
  cloudSession: {
    ...DEFAULT_CLOUD_SESSION,
    user: {
      ...DEFAULT_CLOUD_SESSION.user,
    },
  },
  cloudStatus: {
    ...DEFAULT_CLOUD_STATUS,
  },
  undoStack: [],
  redoStack: [],
  operationLogs: [],
  snapshots: [],
})

const UI_STORAGE_KEY = 'ysp_ui'
let cloudSyncHandler = null
let cloudSyncTimer = null
let suppressCloudSync = false
let suppressHistory = false
let lastPersistedData = null
let lastPersistedSerialized = ''
let lastPersistedCompareSerialized = ''
let hasPersistedSnapshot = false
let pendingHistoryMeta = null
// 本地数据最后修改时间（ISO 字符串），用于启动时与云端 updated_at 比较
let localLastModifiedAt = ''

let _cloudUnhealthyWarned = false

export function isCloudSyncUnhealthy() {
  const s = state.cloudSettings
  return Boolean(s.enabled && s.supabaseUrl && s.supabaseAnonKey) && !state.cloudStatus.connected
}

export function resetCloudUnhealthyWarning() {
  _cloudUnhealthyWarned = false
}

function trimString(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeCloudSettings(settings = {}) {
  return {
    supabaseUrl: trimString(settings.supabaseUrl).replace(/\/+$/, ''),
    supabaseAnonKey: trimString(settings.supabaseAnonKey),
    stateId: trimString(settings.stateId) || 'main',
    enabled: Boolean(settings.enabled),
    publicRead: settings.publicRead !== false,
  }
}

function normalizeCloudSession(session = {}) {
  return {
    accessToken: trimString(session.accessToken),
    refreshToken: trimString(session.refreshToken),
    expiresAt: Number(session.expiresAt || 0) || 0,
    tokenType: trimString(session.tokenType) || 'bearer',
    user: {
      id: trimString(session.user?.id),
      email: trimString(session.user?.email),
    },
  }
}

function setCloudStatusPatch(patch = {}) {
  Object.assign(state.cloudStatus, patch)
}

function clearCloudSyncTimer() {
  if (!cloudSyncTimer) return
  clearTimeout(cloudSyncTimer)
  cloudSyncTimer = null
}

// 移除 updatedAt 字段，用于判断本地数据是否有"真实"变化（时间戳变化不算）
function stripUpdatedAt(data) {
  if (!data || typeof data !== 'object') return data
  const copy = { ...data }
  delete copy.updatedAt
  return copy
}

function setPersistedSnapshot(data) {
  const safeData = data && typeof data === 'object' ? clone(data) : exportData()
  lastPersistedData = safeData
  lastPersistedSerialized = JSON.stringify(safeData)
  lastPersistedCompareSerialized = JSON.stringify(stripUpdatedAt(safeData))
  hasPersistedSnapshot = true
}

function clearPendingHistoryMeta() {
  pendingHistoryMeta = null
}

function trimHistoryStacks() {
  if (state.undoStack.length > MAX_UNDO_STEPS) {
    state.undoStack.splice(0, state.undoStack.length - MAX_UNDO_STEPS)
  }
  if (state.redoStack.length > MAX_UNDO_STEPS) {
    state.redoStack.splice(0, state.redoStack.length - MAX_UNDO_STEPS)
  }
}

function pushHistoryEntry(before, after) {
  const entry = {
    id: Date.now() + Math.floor(Math.random() * 1000),
    time: new Date().toISOString(),
    type: 'data_change',
    message: '数据变更',
    before: clone(before),
    after: clone(after),
  }

  state.undoStack.push(entry)
  state.redoStack.splice(0, state.redoStack.length)
  trimHistoryStacks()

  pendingHistoryMeta = {
    id: entry.id,
    expireAt: Date.now() + HISTORY_META_EXPIRE_MS,
  }
}

function attachHistoryMetaFromOperationLog(type, message) {
  if (!pendingHistoryMeta?.id) return
  if (Date.now() > Number(pendingHistoryMeta.expireAt || 0)) {
    clearPendingHistoryMeta()
    return
  }

  const entry = state.undoStack.find((x) => x.id === pendingHistoryMeta.id)
  if (!entry) {
    clearPendingHistoryMeta()
    return
  }

  entry.type = type || entry.type
  entry.message = message || entry.message
  clearPendingHistoryMeta()
}

function hasCloudSyncConfig() {
  return Boolean(
    trimString(state.cloudSettings.supabaseUrl) &&
      trimString(state.cloudSettings.supabaseAnonKey) &&
      trimString(state.cloudSettings.stateId),
  )
}

async function runCloudSync({ reason = 'auto', force = false } = {}) {
  if (suppressCloudSync) return null
  if (!state.cloudSettings.enabled && !force) return null
  if (!hasCloudSyncConfig()) return null
  if (typeof cloudSyncHandler !== 'function') return null

  setCloudStatusPatch({
    syncing: true,
    lastSyncError: '',
  })

  try {
    const result = await cloudSyncHandler(exportData(), { reason })
    setCloudStatusPatch({
      syncing: false,
      connected: true,
      lastSyncAt: result?.updatedAt || new Date().toISOString(),
      lastSyncError: '',
    })
    saveUiStateToLocalStorage()
    return result
  } catch (err) {
    setCloudStatusPatch({
      syncing: false,
      connected: false,
      lastSyncError: err?.message || '云端同步失败',
    })
    saveUiStateToLocalStorage()
    throw err
  }
}

function scheduleCloudSync() {
  if (suppressCloudSync) return
  if (!state.cloudSettings.enabled) return
  if (!hasCloudSyncConfig()) return
  if (typeof cloudSyncHandler !== 'function') return

  clearCloudSyncTimer()
  cloudSyncTimer = setTimeout(() => {
    runCloudSync({ reason: 'debounced' }).catch(() => {
      // ignore
    })
  }, CLOUD_SYNC_DEBOUNCE_MS)
}

export function loadData(jsonObject = {}) {
  const data = jsonObject && typeof jsonObject === 'object' ? jsonObject : {}

  replaceArray(state.items, data.items)
  // calc 字段：优先使用 JSON 中已存在值，仅在缺失时使用默认值
  const incomingCalc = data.calc && typeof data.calc === 'object' ? data.calc : {}
  const nextCalc = {
    debt:
      Object.prototype.hasOwnProperty.call(incomingCalc, 'debt')
        ? incomingCalc.debt
        : DEFAULT_CALC.debt,
    wechat:
      Object.prototype.hasOwnProperty.call(incomingCalc, 'wechat')
        ? incomingCalc.wechat
        : DEFAULT_CALC.wechat,
    publicExp:
      Object.prototype.hasOwnProperty.call(incomingCalc, 'publicExp')
        ? incomingCalc.publicExp
        : DEFAULT_CALC.publicExp,
    unconfirmed:
      Object.prototype.hasOwnProperty.call(incomingCalc, 'unconfirmed')
        ? incomingCalc.unconfirmed
        : DEFAULT_CALC.unconfirmed,
    fund:
      Object.prototype.hasOwnProperty.call(incomingCalc, 'fund')
        ? incomingCalc.fund
        : DEFAULT_CALC.fund,
    forwarderBalance:
      Object.prototype.hasOwnProperty.call(incomingCalc, 'forwarderBalance')
        ? incomingCalc.forwarderBalance
        : DEFAULT_CALC.forwarderBalance,
    watchBalance:
      Object.prototype.hasOwnProperty.call(incomingCalc, 'watchBalance')
        ? incomingCalc.watchBalance
        : DEFAULT_CALC.watchBalance,
  }
  replaceObject(state.calc, nextCalc)

  replaceArray(state.financeRecords, data.finance?.records)
  replaceArray(state.loanRecords, data.finance?.loans)

  replaceArray(state.transfers, data.transfers)

  replaceObject(state.rushcar, normalizeRushCarData(data.rushcar))

  // 侧边栏版本固定显示程序版本，不受导入 JSON 中 version 字段影响
  state.version = APP_VERSION

  // 恢复快照
  if (Array.isArray(data.snapshots)) {
    state.snapshots = data.snapshots
  } else if (!state.snapshots) {
    state.snapshots = []
  }

  // 恢复本地最后修改时间
  if (typeof data.updatedAt === 'string') {
    localLastModifiedAt = data.updatedAt
  }
}

export function exportData() {
  return {
    items: clone(state.items),
    calc: clone(state.calc),
    finance: {
      records: clone(state.financeRecords),
      loans: clone(state.loanRecords),
    },
    transfers: clone(state.transfers),
    rushcar: normalizeRushCarData(state.rushcar),
    version: state.version,
    snapshots: state.snapshots ? clone(state.snapshots) : [],
    updatedAt: localLastModifiedAt,
  }
}

function todayDateStr() {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * 记录当日快照（每天最多一次），记录 8 个关键指标用于历史回溯。
 * 快照存储在 state.snapshots 中，随 exportData 持久化到 localStorage 和云同步。
 */
function takeDailySnapshot() {
  const today = todayDateStr()
  if (state.snapshots?.some(s => s.date === today)) return

  const loanBalance = state.loanRecords.reduce((s, l) => {
    if (l?.isRepaid || l?.repaid) return s
    return s + (l?.type === 'borrow' ? Number(l.amount || 0) : -Number(l.amount || 0))
  }, 0)

  // 公共支出净额：支出 - 收入（与首页/财务页「公共支出」口径一致）
  const financeExpense = state.financeRecords
    .filter(r => r?.type === 'expense')
    .reduce((s, r) => s + Number(r?.amount || 0), 0)
  const financeIncome = state.financeRecords
    .filter(r => r?.type === 'income')
    .reduce((s, r) => s + Number(r?.amount || 0), 0)
  const publicExpense = financeExpense - financeIncome

  const soldItems = state.items.filter(i => i?.status === 'sold')
  const inventoryItems = state.items.filter(i => i?.status === 'inventory')
  const purchaseItems = state.items.filter(i => i?.status === 'purchase')

  const snapshot = {
    date: today,
    createdAt: new Date().toISOString(),
    calc: { ...state.calc },
    finance: { loanBalance, publicExpense },
    profit: {
      // 净实盈利润：已售利润 - 公共支出净额
      totalActualProfit: soldItems.reduce((s, i) => s + Number(i?.saleDetails?.profit || 0), 0) - publicExpense,
    },
    inventory: {
      value: inventoryItems.reduce((s, i) => s + Number(i?.cost || 0), 0),
      count: inventoryItems.length,
    },
    purchase: {
      totalCost: purchaseItems.reduce((s, i) => s + Number(i?.cost || 0), 0),
      count: purchaseItems.length,
    },
  }

  state.snapshots.push(snapshot)
}

export function saveToLocalStorage(options = {}) {
  const bumpTimestamp = options.bumpTimestamp !== false
  takeDailySnapshot()
  let currentData = exportData()
  const compareSerialized = JSON.stringify(stripUpdatedAt(currentData))
  const hasDataChange = hasPersistedSnapshot && compareSerialized !== lastPersistedCompareSerialized

  if (bumpTimestamp && hasDataChange) {
    localLastModifiedAt = new Date().toISOString()
    currentData = exportData()
  }
  const serialized = JSON.stringify(currentData)

  if (hasDataChange && !suppressHistory) {
    pushHistoryEntry(lastPersistedData, currentData)
  } else {
    clearPendingHistoryMeta()
  }

  localStorage.setItem('ysp_data', serialized)
  setPersistedSnapshot(currentData)
  scheduleCloudSync()
}

/** 读取本地数据最后修改时间（ISO 字符串，可能为空） */
export function getLocalModifiedAt() {
  return localLastModifiedAt
}

/** 显式设置本地数据最后修改时间（如云端拉取后对齐为云端时间） */
export function setLocalModifiedAt(t) {
  localLastModifiedAt = typeof t === 'string' ? t : ''
}

/**
 * 规范序列化：递归按键名排序，用于内容比对。
 * 规避 Supabase jsonb 重排对象键序导致的字符串比对不一致。
 * 输入为 JSON 安全值（经 clone/JSON 传输）；对 undefined 返回 'null' 兜底。
 */
export function stableSerialize(value) {
  if (value === undefined) return 'null'
  if (value === null) return 'null'
  if (Array.isArray(value)) {
    return '[' + value.map((item) => stableSerialize(item)).join(',') + ']'
  }
  if (typeof value === 'object') {
    const keys = Object.keys(value).sort()
    return '{' + keys.map((key) => JSON.stringify(key) + ':' + stableSerialize(value[key])).join(',') + '}'
  }
  return JSON.stringify(value)
}

/**
 * 产出「仅用户数据」的规范形态，供内容比对与冲突差异共用。
 * 有意排除 version / snapshots / updatedAt：快照与版本号为自动派生数据，不应触发冲突。
 */
function normalizePayloadForCompare(data) {
  const src = data && typeof data === 'object' ? data : {}
  return {
    items: Array.isArray(src.items) ? src.items : [],
    calc: src.calc && typeof src.calc === 'object' ? src.calc : {},
    finance: {
      records: Array.isArray(src.finance?.records) ? src.finance.records : [],
      loans: Array.isArray(src.finance?.loans) ? src.finance.loans : [],
    },
    transfers: Array.isArray(src.transfers) ? src.transfers : [],
    rushcar: normalizeRushCarData(src.rushcar),
  }
}

/** 仅比对用户数据内容（忽略时间戳/快照/版本），true 表示两边内容一致 */
export function isContentEqual(a, b) {
  return stableSerialize(normalizePayloadForCompare(a)) === stableSerialize(normalizePayloadForCompare(b))
}

/**
 * 计算本地与云端 payload 的条目级差异。
 * @returns {{ entries: Array, total: number }}
 *  entries 元素形如 { key, collectionLabel, recordLabel, kind, summary }
 *  kind: 'modified'（两边不同，summary 为字段级摘要）| 'localOnly' | 'cloudOnly'
 */
export function computeConflictDiff(localPayload, cloudPayload) {
  const entries = []
  const local = normalizePayloadForCompare(localPayload)
  const cloud = normalizePayloadForCompare(cloudPayload)

  // 各集合 → { 中文标签, 取本地, 取云端, 记录身份字段, 标签补充字段 }
  const collections = [
    { label: '商品', localList: local.items, cloudList: cloud.items, nameField: 'name', altField: 'sid', showField: 'sid' },
    { label: '收支记录', localList: local.finance.records, cloudList: cloud.finance.records, nameField: 'item', altField: 'type', showField: null },
    { label: '借贷记录', localList: local.finance.loans, cloudList: cloud.finance.loans, nameField: 'name', altField: 'type', showField: null },
    { label: '转运记录', localList: local.transfers, cloudList: cloud.transfers, nameField: 'name', altField: null, showField: null },
    { label: '美淘记录', localList: local.rushcar.entries, cloudList: cloud.rushcar.entries, nameField: 'name', altField: null, showField: null },
    { label: '转运公司', localList: local.rushcar.forwarderInfos, cloudList: cloud.rushcar.forwarderInfos, nameField: 'name', altField: null, showField: null },
    { label: '美泰站点', localList: local.rushcar.mattelSiteInfos, cloudList: cloud.rushcar.mattelSiteInfos, nameField: 'name', altField: null, showField: null },
    { label: '支付卡', localList: local.rushcar.paymentCards, cloudList: cloud.rushcar.paymentCards, nameField: 'name', altField: null, showField: null },
  ]

  for (const col of collections) {
    const localMap = new Map()
    col.localList.forEach((r) => localMap.set(recordKey(r, col), r))
    const cloudMap = new Map()
    col.cloudList.forEach((r) => cloudMap.set(recordKey(r, col), r))

    for (const id of new Set([...localMap.keys(), ...cloudMap.keys()])) {
      const l = localMap.get(id)
      const c = cloudMap.get(id)
      const label = recordLabel(l || c, col)
      if (l && c) {
        if (stableSerialize(l) === stableSerialize(c)) continue
        const summary = formatChangesSummary(diffRecordFields(c, l))
        entries.push({ key: `${col.label}:${id}`, collectionLabel: col.label, recordLabel: label, kind: 'modified', summary })
      } else if (l) {
        entries.push({ key: `${col.label}:${id}`, collectionLabel: col.label, recordLabel: label, kind: 'localOnly', summary: '' })
      } else {
        entries.push({ key: `${col.label}:${id}`, collectionLabel: col.label, recordLabel: label, kind: 'cloudOnly', summary: '' })
      }
    }
  }

  // 财务结算 calc 单独比对（标量字段，字段级差异可读性好）
  if (stableSerialize(local.calc) !== stableSerialize(cloud.calc)) {
    const summary = formatChangesSummary(diffRecordFields(cloud.calc, local.calc))
    entries.push({ key: 'calc', collectionLabel: '财务结算', recordLabel: '各项结算', kind: 'modified', summary })
  }

  return { entries, total: entries.length }
}

function recordKey(record, col) {
  if (record && record.id !== undefined) return String(record.id)
  if (record && col.altField && record[col.altField] !== undefined) return `${col.altField}:${record[col.altField]}`
  return `#${record ? stableSerialize(record) : '?'}`
}

function recordLabel(record, col) {
  if (!record) return '未知记录'
  const name = record[col.nameField]
  const base = typeof name === 'string' && name ? name : `#${record.id ?? '?'}`
  if (col.showField && record[col.showField] !== undefined) {
    return `${base} (${record[col.showField]})`
  }
  return base
}

/**
 * 计算两条记录顶层的字段级差异。
 * 标量差异记为 { before: 云端值, after: 本地值 }；嵌套对象/数组差异记为 { changed: true }（不做深层展开）。
 * 返回 { field: { before, after } | { changed } }，可直接交给 formatChangesSummary。
 */
function diffRecordFields(cloudRecord, localRecord) {
  const changes = {}
  const keys = new Set([...Object.keys(cloudRecord || {}), ...Object.keys(localRecord || {})])
  for (const key of keys) {
    if (key === 'id') continue
    const a = cloudRecord && cloudRecord[key]
    const b = localRecord && localRecord[key]
    if (stableSerialize(a) === stableSerialize(b)) continue
    const isObject = (a !== null && typeof a === 'object') || (b !== null && typeof b === 'object')
    if (isObject) {
      changes[key] = { changed: true }
    } else {
      changes[key] = { before: a, after: b }
    }
  }
  return changes
}

export function registerCloudSyncHandler(handler) {
  cloudSyncHandler = typeof handler === 'function' ? handler : null
}

export function setCloudSyncSuppressed(flag) {
  suppressCloudSync = Boolean(flag)
}

export function setHistorySuppressed(flag) {
  suppressHistory = Boolean(flag)
}

export async function syncToCloudNow() {
  clearCloudSyncTimer()
  return runCloudSync({ reason: 'manual', force: true })
}

export function undoLastChange() {
  if (state.undoStack.length === 0) return null

  const entry = state.undoStack.pop()
  state.redoStack.push(entry)
  trimHistoryStacks()

  const previousSuppress = suppressHistory
  suppressHistory = true
  try {
    loadData(entry.before)
    saveToLocalStorage()
  } finally {
    suppressHistory = previousSuppress
  }

  clearPendingHistoryMeta()
  return {
    id: entry.id,
    type: entry.type,
    message: entry.message,
    time: entry.time,
  }
}

export function redoLastChange() {
  if (state.redoStack.length === 0) return null

  const entry = state.redoStack.pop()
  state.undoStack.push(entry)
  trimHistoryStacks()

  const previousSuppress = suppressHistory
  suppressHistory = true
  try {
    loadData(entry.after)
    saveToLocalStorage()
  } finally {
    suppressHistory = previousSuppress
  }

  clearPendingHistoryMeta()
  return {
    id: entry.id,
    type: entry.type,
    message: entry.message,
    time: entry.time,
  }
}

export function clearUndoRedoHistory() {
  state.undoStack.splice(0, state.undoStack.length)
  state.redoStack.splice(0, state.redoStack.length)
  clearPendingHistoryMeta()
}

export function setCloudSettings(settings = {}) {
  Object.assign(state.cloudSettings, normalizeCloudSettings(settings))
  saveUiStateToLocalStorage()
}

export function setCloudSession(session = {}) {
  Object.assign(state.cloudSession, normalizeCloudSession(session))
  saveUiStateToLocalStorage()
}

export function clearCloudSession() {
  Object.assign(state.cloudSession, normalizeCloudSession(DEFAULT_CLOUD_SESSION))
  saveUiStateToLocalStorage()
}

export function setCloudLoadSuccess(at = '') {
  setCloudStatusPatch({
    connected: true,
    lastCloudLoadAt: at || new Date().toISOString(),
    lastCloudLoadError: '',
  })
  saveUiStateToLocalStorage()
}

export function setCloudLoadError(message = '') {
  setCloudStatusPatch({
    connected: false,
    lastCloudLoadError: message || '云端加载失败',
  })
  saveUiStateToLocalStorage()
}

export function addOperationLog(type, message, detail) {
  if (detail === undefined) detail = {}

  // 删除聚合：同一SID在 500ms 内连续删除 → 合并为 1 条日志
  if (DELETE_LOG_TYPES[type] && state.operationLogs.length > 0) {
    var last = state.operationLogs[0]
    var timeGap = Date.now() - new Date(last.time).getTime()
    if (
      last.type === type &&
      last.detail && last.detail.sid === detail.sid &&
      timeGap < DELETE_MERGE_WINDOW_MS
    ) {
      var prevCount = last.detail.deletedCount || 1
      var newCount = prevCount + 1
      var prevNames = Array.isArray(last.detail.deletedNames) ? last.detail.deletedNames : [last.detail.name || '']
      var prevIds = Array.isArray(last.detail.deletedItemIds) ? last.detail.deletedItemIds : [last.detail.itemId]

      last.detail = Object.assign({}, last.detail, {
        deletedCount: newCount,
        deletedItemIds: prevIds.concat([detail.itemId || detail.sid]),
        deletedNames: prevNames.concat([detail.name || '']),
      })
      last.message = '删除商品: ' + (detail.name || '') + ' x' + newCount
      last.time = new Date().toISOString()
      last.id = Date.now() + Math.floor(Math.random() * 1000)
      saveUiStateToLocalStorage()
      return
    }
  }

  attachHistoryMetaFromOperationLog(type, message)

  state.operationLogs.unshift({
    id: Date.now() + Math.floor(Math.random() * 1000),
    time: new Date().toISOString(),
    type,
    message,
    detail,
  })

  if (state.operationLogs.length > 500) {
    state.operationLogs.splice(500)
  }

  saveUiStateToLocalStorage()

  if (!_cloudUnhealthyWarned && isCloudSyncUnhealthy()) {
    _cloudUnhealthyWarned = true
    setTimeout(() => {
      alert('⚠️ 云端同步未连接，操作仅保存在本地浏览器中。\n更换设备或清除浏览器缓存后数据将丢失，请尽快登录云端账号同步。')
    }, 100)
  }
}

export function clearOperationLogs() {
  state.operationLogs.splice(0, state.operationLogs.length)
  saveUiStateToLocalStorage()
}

/**
 * 获取尚未同步到云端的操作清单（操作时间晚于最近一次成功同步/云端拉取的较晚者）。
 * 用于在"云端未连接"时向用户展示本地未同步的具体改动。
 */
export function getUnsyncedOperations() {
  const syncTs = state.cloudStatus.lastSyncAt ? new Date(state.cloudStatus.lastSyncAt).getTime() : 0
  const loadTs = state.cloudStatus.lastCloudLoadAt ? new Date(state.cloudStatus.lastCloudLoadAt).getTime() : 0
  const threshold = Math.max(syncTs, loadTs) || 0
  return state.operationLogs.filter((log) => {
    const t = new Date(log.time).getTime()
    return Number.isFinite(t) && t > threshold
  })
}

/**
 * 回溯指定时间点的 calc 字段值
 * @param {string} field - calc 字段名 (debt|wechat|publicExp|unconfirmed|fund)
 * @param {string|Date} targetDate - 目标时间点
 * @returns {number} 该字段在目标时间点的值
 *
 * 原理：从当前值出发，逆序回放 targetDate 之后的 calc_update 日志，
 * 将每次 after 替换成 before，最终得到 targetDate 时的值。
 *
 * 限制：仅对 calc_update 类型生效；旧日志（home_calc 类型）不含 before，
 * 会被跳过，新旧日志混合使用正常。
 */
export function reconstructCalcField(field, targetDate) {
  const target = new Date(targetDate).getTime()
  if (isNaN(target)) throw new Error('Invalid targetDate')

  let value = state.calc[field]

  const logs = state.operationLogs
    .filter(l => l.type === 'calc_update' && l.detail?.field === field)
    .filter(l => new Date(l.time).getTime() > target)
    .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())

  for (const log of logs) {
    if (log.detail.before !== undefined) {
      value = log.detail.before
    }
  }

  return value
}

/**
 * 获取离目标日期最近的每日快照
 * @param {string} targetDate - 日期 "2026-06-02"
 * @returns {object|null} 快照对象，若无则返回 null
 */
export function getSnapshotByDate(targetDate) {
  const snapshots = state.snapshots || []
  const exact = snapshots.find(s => s.date === targetDate)
  if (exact) return exact

  // 模糊匹配：找最近的（不超过 targetDate ± 7天）
  const target = new Date(targetDate).getTime()
  let closest = null
  let minDiff = Infinity
  for (const s of snapshots) {
    const diff = Math.abs(new Date(s.date).getTime() - target)
    if (diff < minDiff) {
      minDiff = diff
      closest = s
    }
  }
  return minDiff <= 7 * 86400000 ? closest : null
}

export function saveUiStateToLocalStorage() {
  const payload = {
    cloudSettings: { ...state.cloudSettings },
    cloudSession: {
      ...state.cloudSession,
      user: { ...state.cloudSession.user },
    },
    cloudStatus: { ...state.cloudStatus },
    operationLogs: [...state.operationLogs],
  }
  localStorage.setItem(UI_STORAGE_KEY, JSON.stringify(payload))
}

export function loadUiStateFromLocalStorage() {
  const raw = localStorage.getItem(UI_STORAGE_KEY)
  if (!raw) return

  const parsed = JSON.parse(raw)

  if (parsed?.cloudSettings && typeof parsed.cloudSettings === 'object') {
    Object.assign(state.cloudSettings, normalizeCloudSettings(parsed.cloudSettings))
  }

  if (parsed?.cloudSession && typeof parsed.cloudSession === 'object') {
    Object.assign(state.cloudSession, normalizeCloudSession(parsed.cloudSession))
  }

  if (parsed?.cloudStatus && typeof parsed.cloudStatus === 'object') {
    Object.assign(state.cloudStatus, {
      ...DEFAULT_CLOUD_STATUS,
      ...parsed.cloudStatus,
    })
  }

  if (Array.isArray(parsed?.operationLogs)) {
    replaceArray(state.operationLogs, parsed.operationLogs)
  }
}

export function loadFromLocalStorage() {
  const raw = localStorage.getItem('ysp_data')
  if (!raw) {
    hasPersistedSnapshot = false
    lastPersistedData = null
    lastPersistedSerialized = ''
    lastPersistedCompareSerialized = ''
    localLastModifiedAt = ''
    return
  }

  const parsed = JSON.parse(raw)
  loadData(parsed)
  setPersistedSnapshot(exportData())
}
