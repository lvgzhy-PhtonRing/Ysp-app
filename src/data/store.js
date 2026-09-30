// 全局状态管理：承接应用主数据、导入导出、localStorage 持久化

import { reactive } from 'vue'

import { SLOT_KEYS, slotValue, normalizeRev, computeSlotPlan, buildMerged, revOf, hasUsableSlotValue } from './cloudSlotPlan'

import {
  downloadJsonBackup,
  isBackupDue,
} from '../services/dataProtection'

const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.0.0'
const CLOUD_SYNC_DEBOUNCE_MS = 800
const MAX_UNDO_STEPS = 20
const HISTORY_META_EXPIRE_MS = 3000
export const CLOUD_AUTO_SYNC_INTERVAL = 30000 // 30秒自动检测
var DELETE_MERGE_WINDOW_MS = 500
var DELETE_LOG_TYPES = { inventory_delete: true, purchase_delete: true }
var ALIGN_LOG_TYPES = { 'cloud_sync': true }
var _sessionStartAt = Date.now() // 会话开始时间，用于检测应用关闭再打开

// === 新增：云同步配置默认值 ===
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
  user: { id: '', email: '' },
}

const DEFAULT_CLOUD_STATUS = {
  syncing: false,
  connected: false,
  lastSyncAt: '',
  lastSyncError: '',
  lastCloudLoadAt: '',
  lastCloudLoadError: '',
  lastAutoSyncAt: 0, // 上一次自动同步时间戳
  cloudRev: {}, // 同步基线槽位版本：{ slot: number }，随 cloudStatus 持久化
}

// === 新增：启动时的云端数据比对阈值（毫秒）===
// 如果本地数据比云端新，则上传本地；云端新则比较内容后决定
const CLOUD_SYNC_COMPARE_THRESHOLD_MS = 30000 // 与 CLOUD_AUTO_SYNC_INTERVAL 对齐：刚同步过（30s 内）则不重复启动比对

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

// 状态值→中文映射（用于冲突差异展示）
const STATUS_VALUE_MAP = {
  // 商品状态
  inventory: '库存', purchase: '采购', sold: '已售', unlisted: '已下架',
  // 转运状态
  pending: '待转运', completed: '已转运',
  // 收支类型
  expense: '支出', income: '收入',
  // 借贷类型
  borrow: '借入', lend: '借出',
}

// 值→人类可读文本映射
export function formatValueForDisplay(field, value) {
  if (value === null || value === undefined || value === '') return '无'
  // 状态字段映射
  if (field === 'status' || field === 'type') {
    return STATUS_VALUE_MAP[value] || value
  }
  // 数字格式
  if (typeof value === 'number') return Number(value).toFixed(0)
  // 布尔值
  if (typeof value === 'boolean') return value ? '是' : '否'
  // 字符串截断
  return String(value).slice(0, 20)
}

function fmtBrief(v) {
  if (v === null || v === undefined || v === '') return '-'
  if (typeof v === 'number') return '¥' + Number(v).toFixed(0)
  if (typeof v === 'boolean') return v ? '是' : '否'
  if (Array.isArray(v)) return v.length > 0 ? v.slice(0, 3).map(fmtBrief).join(',') + (v.length > 3 ? '...' : '') : '空'
  if (typeof v === 'object') {
    const keys = Object.keys(v)
    if (keys.length === 0) return '{}'
    return '{' + keys.slice(0, 3).join(',') + (keys.length > 3 ? '...' : '') + '}'
  }
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
    var label = FIELD_LABEL_MAP[key.split('.').pop()] || key.split('.').pop()
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

export function clone(value) {
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
  // 字段名与持久化 JSON（localStorage / 云端 payload）对应映射后的 store 结构保持一致
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
  autoBackup: {
    lastDate: '', // 最近一次自动备份日期（YYYY-MM-DD），一日一次
    lastNotice: '', // 最近一次生成备份的日期，App.vue 据此显示手动下载提示
  },
  snapshots: [],
  // === 新增：云同步相关辅助状态 ===
  // lastLocalModifiedAt: 在 loadFromLocalStorage 中从持久化数据恢复
})

const UI_STORAGE_KEY = 'ysp_ui'
let cloudSyncHandler = null
let cloudConflictHandler = null
let cloudSyncTimer = null
let suppressCloudSync = false
let suppressHistory = false
let lastPersistedData = null
let lastPersistedSerialized = ''
let lastPersistedCompareSerialized = ''
let hasPersistedSnapshot = false
let pendingHistoryMeta = null
let currentPayloadRev = {} // payload._rev 的本地真源（模块态，非响应式）
let lastPersistedSlot = {} // { slot: 上次持久化的槽位序列化串 }（脏检测基线）
// 本地数据最后修改时间（ISO 字符串），用于启动时与云端 updated_at 比较
let localLastModifiedAt = ''
let _cloudUnhealthyWarned = false

export function isCloudSyncUnhealthy() {
  const s = state.cloudSettings
  return Boolean(s.enabled && s.supabaseUrl && s.supabaseAnonKey) && !state.cloudStatus.connected
}

export function needsAutoSyncOnStart() {
  // 如果从未成功同步过云端，或者上次自动检测距今超过阈值，则返回 true
  const now = Date.now()
  const lastSync = state.cloudStatus.lastAutoSyncAt || 0
  return now - lastSync > CLOUD_SYNC_COMPARE_THRESHOLD_MS
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

// 移除 updatedAt 与 _rev 字段，用于判断本地数据是否有"真实"变化（时间戳/版本变化不算）
function stripMeta(data) {
  if (!data || typeof data !== 'object') return data
  const copy = { ...data }
  delete copy.updatedAt
  delete copy._rev
  return copy
}

function setPersistedSnapshot(data) {
  const safeData = data && typeof data === 'object' ? clone(data) : exportData()
  lastPersistedData = safeData
  lastPersistedSerialized = JSON.stringify(safeData)
  lastPersistedCompareSerialized = JSON.stringify(stripMeta(safeData))
  lastPersistedSlot = {}
  for (const slot of SLOT_KEYS) {
    lastPersistedSlot[slot] = stableSerialize(slotValue(safeData, slot))
  }
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

export async function performSyncDecision({ reason = 'auto', force = false, silent = false, pull = false, keepalive = false } = {}) {
  if (suppressCloudSync) return null
  if (!state.cloudSettings.enabled && !force) return null
  if (!hasCloudSyncConfig()) return null
  if (typeof cloudSyncHandler !== 'function') return null
  if (state.cloudStatus.syncing) return null // 重入锁

  setCloudStatusPatch({ syncing: true, lastSyncError: '' })
  try {
    // 1. 只读预检
    const cloudResult = await cloudSyncHandler(exportData(), { reason: 'pre-check' })
    const cloudPayload = cloudResult?.payload
    const cloudUpdatedAt = cloudResult?.updatedAt || ''

    // 2. 云端无行 → 上传本地初始化（含 _rev 印章），并在上传后建立槽位基线
    if (!cloudPayload && !cloudResult?.row) {
      const result = await cloudSyncHandler(exportData(), { reason })
      for (const slot of SLOT_KEYS) {
        state.cloudStatus.cloudRev[slot] = revOf(exportData(), slot)
      }
      setCloudStatusPatch({ syncing: false, connected: true, lastSyncAt: result?.updatedAt || new Date().toISOString(), lastSyncError: '' })
      saveUiStateToLocalStorage()
      addOperationLog('cloud_sync', force ? '手动同步：云端无数据，已上传本地完成初始化' : '首次启动：无云端数据，本地数据保持不变', { reason })
      return result
    }

    // 3. 云端载荷损坏（无 items）→ 视为无数据（沿用 B1 边界）
    const hasUsableCloudPayload = cloudPayload && typeof cloudPayload === 'object' && !Array.isArray(cloudPayload) && Array.isArray(cloudPayload.items)
    if (!hasUsableCloudPayload) {
      setCloudStatusPatch({ syncing: false, connected: true, lastSyncAt: new Date().toISOString(), lastSyncError: '', lastAutoSyncAt: Date.now() })
      saveUiStateToLocalStorage()
      addOperationLog('cloud_sync', '首次启动：无云端数据，本地数据保持不变', { reason })
      return { updatedAt: new Date().toISOString(), row: null }
    }

    const localPayload = exportData()
    const plan = computeSlotPlan(localPayload, cloudPayload, state.cloudStatus.cloudRev, stableSerialize)

    const adoptSlots = SLOT_KEYS.filter((s) => plan[s] === 'adopt-cloud')
    const conflictSlots = SLOT_KEYS.filter((s) => plan[s] === 'conflict')
    const uploadSlots = SLOT_KEYS.filter((s) => plan[s] === 'upload')

    // 4. silent：存在 adopt/conflict → 整轮跳过（不静默覆盖，也不上传导致顺带覆盖）
    if (silent && (adoptSlots.length > 0 || conflictSlots.length > 0)) {
      setCloudStatusPatch({ syncing: false, connected: true, lastSyncAt: cloudUpdatedAt || new Date().toISOString(), lastAutoSyncAt: Date.now(), lastSyncError: '' })
      addOperationLog('cloud_sync', '后台同步：与云端存在分歧槽位，暂不动作，等待定期检测提示', { reason, adoptSlots, conflictSlots })
      return { updatedAt: getLocalModifiedAt(), row: cloudPayload }
    }

    // 5. 全对齐 → 仅对齐时间戳
    if (adoptSlots.length === 0 && conflictSlots.length === 0 && uploadSlots.length === 0) {
      setLocalModifiedAt(cloudUpdatedAt)
      saveToLocalStorage({ bumpTimestamp: false })
      setCloudStatusPatch({ syncing: false, connected: true, lastSyncAt: cloudUpdatedAt || new Date().toISOString(), lastAutoSyncAt: Date.now(), lastSyncError: '' })
      saveUiStateToLocalStorage()
      addOperationLog('cloud_sync', force ? '手动同步：云端与本地一致，已对齐时间戳' : '内容一致，已对齐时间戳', { localModifiedAt: getLocalModifiedAt(), cloudUpdatedAt })
      return { updatedAt: cloudUpdatedAt, row: cloudPayload }
    }

    // 6. 需用户决策的槽位（adopt-cloud / conflict；pull 模式额外并入 upload 槽，默认偏云端）
    const decisionSlots = pull
      ? SLOT_KEYS.filter((s) => plan[s] === 'adopt-cloud' || plan[s] === 'conflict' || plan[s] === 'upload')
      : [...adoptSlots, ...conflictSlots]
    let decisions = {}
    let copies = []
    if (decisionSlots.length > 0) {
      if (typeof cloudConflictHandler === 'function') {
        const userChoice = await cloudConflictHandler('slot-conflict', {
          plan, localPayload, cloudPayload, cloudUpdatedAt, localModifiedAt: getLocalModifiedAt(), decisionSlots,
        })
        if (!userChoice) {
          // 用户取消：本地不动、不上传、不覆盖云端任何槽位（与 silent 同级，整轮跳过）
          setCloudStatusPatch({ syncing: false, connected: true, lastSyncAt: cloudUpdatedAt || new Date().toISOString(), lastAutoSyncAt: Date.now(), lastSyncError: '' })
          saveUiStateToLocalStorage()
          addOperationLog('cloud_sync', '用户取消同步，保持本地数据', { adoptSlots, conflictSlots, reason })
          return { updatedAt: getLocalModifiedAt(), row: cloudPayload }
        }
        decisions = userChoice.decisions || {}
        copies = Array.isArray(userChoice.copies) ? userChoice.copies : []
      } else {
        decisions = {}
      }
    }
    if (pull) {
      // 拉取默认偏云端：upload 槽未显式决策时采纳云端
      for (const s of uploadSlots) if (!(s in decisions)) decisions[s] = 'cloud'
    }

    // 7. I1 逐槽守卫：采纳云端内容前校验 cloud 槽位存在且类型正确，缺失/错型 → 该槽回退本地
    for (const slot of SLOT_KEYS) {
      const wantsCloud = decisions[slot] === 'cloud' || (plan[slot] === 'adopt-cloud' && decisions[slot] !== 'local')
      if (!wantsCloud) continue
      if (!hasUsableSlotValue(cloudPayload, slot)) {
        decisions[slot] = 'local'
        addOperationLog('cloud_sync', '云端槽位损坏/缺失，已回退本地', { slot })
      }
    }

    // 8. 合并 + 有采纳云端内容 → 应用合并结果到本地（loadData 恢复 merged._rev）
    const merged = buildMerged(localPayload, cloudPayload, plan, decisions)
    const adoptToLocal = adoptSlots.some((s) => decisions[s] !== 'local') || (pull && uploadSlots.some((s) => decisions[s] === 'cloud'))
    const conflictToCloud = conflictSlots.some((s) => decisions[s] === 'cloud')
    if (adoptToLocal || conflictToCloud) {
      const applied = await applyCloudPayload(merged, {
        trackHistory: force,
        sourceUpdatedAt: cloudUpdatedAt,
        decisionSlots: SLOT_KEYS.filter((slot) => {
          const wantsCloud = decisions[slot] === 'cloud' || (plan[slot] === 'adopt-cloud' && decisions[slot] !== 'local')
          return wantsCloud
        }),
      })
      if (!applied) {
        addOperationLog('cloud_sync', '云端载荷损坏/缺失，已拒绝应用，保留本地', { adoptSlots, conflictSlots, cloudUpdatedAt })
        setCloudStatusPatch({ syncing: false, connected: false, lastSyncError: '云端数据不完整，已拒绝应用' })
        saveUiStateToLocalStorage()
        return { updatedAt: getLocalModifiedAt(), row: cloudPayload }
      }
      setCloudLoadSuccess?.(cloudUpdatedAt)
    }

    // 9. 需上传（有本地获胜槽位，或云端缺 _rev 需印章一次性自愈；pull 已采纳云端的槽不重复上传）
    let result = null
    const localWinUploadSlots = pull ? uploadSlots.filter((s) => decisions[s] !== 'cloud') : uploadSlots
    const mustUpload = localWinUploadSlots.length > 0 || !hasRevEqual(merged, cloudPayload)
    if (mustUpload) {
      result = await cloudSyncHandler(merged, { reason: 'sync', keepalive })
      setLocalModifiedAt(result?.updatedAt || cloudUpdatedAt)
      saveToLocalStorage({ bumpTimestamp: false })
    }

    // 10. 更新基线 & 状态
    for (const slot of SLOT_KEYS) {
      state.cloudStatus.cloudRev[slot] = revOf(merged, slot)
    }
    setCloudStatusPatch({ syncing: false, connected: true, lastSyncAt: result?.updatedAt || cloudUpdatedAt || new Date().toISOString(), lastAutoSyncAt: Date.now(), lastSyncError: '' })
    saveUiStateToLocalStorage()
    addOperationLog('cloud_sync', '同步完成', { reason, adoptSlots, conflictSlots, uploadSlots, copies })
    return { updatedAt: result?.updatedAt || cloudUpdatedAt, row: cloudPayload }
  } catch (err) {
    setCloudStatusPatch({ syncing: false, connected: false, lastSyncError: err?.message || '云端同步失败' })
    saveUiStateToLocalStorage()
    throw err
  }
}

function hasRevEqual(a, b) {
  // 缺失 _rev（云端旧数据）按 null 处理：与显式 `{}` 不相等，触发一次印章上传自愈
  return stableSerialize(a?._rev ?? null) === stableSerialize(b?._rev ?? null)
}

function scheduleCloudSync() {
  if (suppressCloudSync) return
  if (!state.cloudSettings.enabled) return
  if (!hasCloudSyncConfig()) return
  if (typeof cloudSyncHandler !== 'function') return

  clearCloudSyncTimer()
  cloudSyncTimer = setTimeout(() => {
    performSyncDecision({ reason: 'debounced', silent: true }).catch(() => {
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

  currentPayloadRev = normalizeRev(data._rev)
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
    _rev: clone(currentPayloadRev),
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

/**
 * 每日自动备份：今日首次保存时下载一份完整数据（含操作日志）到 Downloads。
 * 仅在页面可见时触发（后台静默兜底上传不触发，避免被浏览器拦截）。
 * 自动下载可能被浏览器静默拦截，lastNotice 记录本次生成，供界面显示手动下载入口兜底。
 */
function maybeAutoBackup() {
  if (typeof document === 'undefined') return
  if (document.visibilityState && document.visibilityState !== 'visible') return
  const today = todayDateStr()
  if (!isBackupDue(today, state.autoBackup.lastDate)) return

  const payload = { ...exportData(), operationLogs: [...state.operationLogs] }
  downloadJsonBackup(payload, `饮食派数据_${today}.json`)

  state.autoBackup.lastDate = today
  state.autoBackup.lastNotice = today
  saveUiStateToLocalStorage()
  addOperationLog('app_auto_backup', `已生成每日备份 饮食派数据_${today}.json`, { date: today })
}

export function saveToLocalStorage(options = {}) {
  const bumpTimestamp = options.bumpTimestamp !== false
  takeDailySnapshot()
  let currentData = exportData()
  const compareSerialized = JSON.stringify(stripMeta(currentData))
  const hasDataChange = hasPersistedSnapshot && compareSerialized !== lastPersistedCompareSerialized

  if (bumpTimestamp && hasDataChange) {
    bumpSlotRevs(currentData)
    localLastModifiedAt = new Date().toISOString()
    currentData = exportData()
  } else if (hasDataChange) {
    // 纯时间戳对齐/外部应用：不 bump rev，但刷新槽位基线防止脏误判
    refreshSlotBaseline(currentData)
  }
  const serialized = JSON.stringify(currentData)

  if (hasDataChange && !suppressHistory) {
    pushHistoryEntry(lastPersistedData, currentData)
  } else {
    clearPendingHistoryMeta()
  }

  localStorage.setItem('ysp_data', serialized)
  setPersistedSnapshot(currentData)
  // 仅在有真实内容变更时调度云同步；纯时间戳对齐/无变化时不再触发，避免同步死循环
  if (hasDataChange) scheduleCloudSync()
  maybeAutoBackup()
}

function bumpSlotRevs(currentData) {
  const next = { ...(currentPayloadRev || {}) }
  let touched = false
  for (const slot of SLOT_KEYS) {
    const ser = stableSerialize(slotValue(currentData, slot))
    if (ser !== lastPersistedSlot[slot]) {
      next[slot] = { rev: (Number(next[slot]?.rev) || 0) + 1, at: new Date().toISOString() }
      lastPersistedSlot[slot] = ser
      touched = true
    }
  }
  if (touched) currentPayloadRev = next
}

function refreshSlotBaseline(currentData) {
  for (const slot of SLOT_KEYS) {
    lastPersistedSlot[slot] = stableSerialize(slotValue(currentData, slot))
  }
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
    col.localList.forEach((r, i) => localMap.set(recordKey(r, col, i), r))
    const cloudMap = new Map()
    col.cloudList.forEach((r, i) => cloudMap.set(recordKey(r, col, i), r))

    for (const id of new Set([...localMap.keys(), ...cloudMap.keys()])) {
      const l = localMap.get(id)
      const c = cloudMap.get(id)
      const label = recordLabel(l || c, col)
      if (l && c) {
        if (stableSerialize(l) === stableSerialize(c)) continue
        // 字段级差异，每条记录每个变更字段一条 entry
        const changes = diffRecordFields(c, l)
        for (const [field, change] of Object.entries(changes)) {
          const fieldName = FIELD_LABEL_MAP[field.split('.').pop()] || field.split('.').pop()
          entries.push({
            key: `${col.label}:${id}:${field}`,
            collectionLabel: col.label,
            recordLabel: label,
            fieldName: fieldName,
            kind: 'modified',
            cloudValue: formatValueForDisplay(field.split('.').pop(), change.before),
            localValue: formatValueForDisplay(field.split('.').pop(), change.after),
            summary: `${fieldName}:${formatValueForDisplay(field.split('.').pop(), change.before)}→${formatValueForDisplay(field.split('.').pop(), change.after)}`,
          })
        }
      } else if (l) {
        entries.push({ key: `${col.label}:${id}`, collectionLabel: col.label, recordLabel: label, fieldName: null, kind: 'localOnly', cloudValue: '无', localValue: formatValueForDisplay('name', l[col.nameField]), summary: '' })
      } else {
        entries.push({ key: `${col.label}:${id}`, collectionLabel: col.label, recordLabel: label, fieldName: null, kind: 'cloudOnly', cloudValue: formatValueForDisplay('name', c[col.nameField]), localValue: '无', summary: '' })
      }
    }
  }

  return { entries, total: entries.length }
}

function recordKey(record, col, index) {
  if (record && record.id !== undefined) return String(record.id)
  if (record && col.altField && record[col.altField] !== undefined) return `${col.altField}:${record[col.altField]}`
  // 无 id/altField 的记录：用集合内序号兜底，避免同内容重复记录被 Map 合并而遗漏差异（M3）
  return `idx:${index ?? '?'}`
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
function diffRecordFields(cloudRecord, localRecord, prefix = '') {
  const changes = {}
  const keys = new Set([...Object.keys(cloudRecord || {}), ...Object.keys(localRecord || {})])
  for (const key of keys) {
    if (key === 'id') continue
    const a = cloudRecord && cloudRecord[key]
    const b = localRecord && localRecord[key]
    if (stableSerialize(a) === stableSerialize(b)) continue
    const label = prefix ? `${prefix}.${key}` : key
    const isObj = (x) => x !== null && typeof x === 'object'
    if (isObj(a) || isObj(b)) {
      Object.assign(changes, diffRecordFields(a, b, label))
    } else {
      changes[label] = { before: a, after: b }
    }
  }
  return changes
}

// 应用云端载荷回调：由 App.vue 注入（带 8 集合守卫与撤销语义的实现）
let cloudApplyHandler = null

export function registerCloudApplyHandler(handler) {
  cloudApplyHandler = typeof handler === 'function' ? handler : null
}

/**
 * 应用云端载荷到本地 store。
 * 优先走注入的实现（守卫 + 撤销语义）；未注入时退化为原行为。
 * @returns {boolean} false 表示云端载荷损坏/缺失被拒
 */
async function applyCloudPayload(payload, options = {}) {
  if (typeof cloudApplyHandler === 'function') {
    return cloudApplyHandler(payload, options)
  }
  loadData(payload)
  if (options.sourceUpdatedAt) setLocalModifiedAt(options.sourceUpdatedAt)
  saveToLocalStorage({ bumpTimestamp: false })
  return true
}

export function registerCloudSyncHandler(handler) {
  cloudSyncHandler = typeof handler === 'function' ? handler : null
}

/**
 * 注册冲突决策 UI 回调（模态框）。
 * 由 App.vue 注册，performSyncDecision 在需要用户决策时调用。
 * 回调签名: async (type, data) => { decisions, copies } | null
 * type: 'slot-conflict'（本地与云端都修改过且内容不同的槽位）
 * data: { plan, localPayload, cloudPayload, cloudUpdatedAt, localModifiedAt }
 * 返回 null 表示用户取消，整轮跳过：本地不动、不上传、不覆盖云端任何槽位。
 */
export function registerCloudConflictHandler(handler) {
  cloudConflictHandler = typeof handler === 'function' ? handler : null
}

export function setCloudSyncSuppressed(flag) {
  suppressCloudSync = Boolean(flag)
}

export function setHistorySuppressed(flag) {
  suppressHistory = Boolean(flag)
}

export async function syncToCloudNow() {
  clearCloudSyncTimer()
  return performSyncDecision({ reason: 'manual', force: true })
}

/** 非强制同步：走完整冲突检测流程（pre-check → 比对 → 冲突决策） */
export async function runCloudSyncCheck() {
  clearCloudSyncTimer()
  return performSyncDecision({ reason: 'periodic-check' })
}

/** 启动时同步（供 App.vue loadCloudOnStartup 调用） */
export async function runStartupSync() {
  clearCloudSyncTimer()
  return performSyncDecision({ reason: 'startup' })
}

/** 页面切走静默兜底同步：silent 模式，有分歧槽位则整轮跳过（不盲写） */
export async function hiddenSync() {
  clearCloudSyncTimer()
  return performSyncDecision({ reason: 'hidden-sync', silent: true })
}

/** 关闭前 keepalive 兜底同步：silent 模式 + keepalive 透传（不盲写） */
export async function unloadSync() {
  clearCloudSyncTimer()
  return performSyncDecision({ reason: 'unload-sync', silent: true, keepalive: true })
}

/** 拉取云端：pull 模式，upload 槽也并入决策、默认偏云端（拉取 = 从云端优先采纳） */
export async function runPullSync() {
  clearCloudSyncTimer()
  return performSyncDecision({ reason: 'pull', pull: true })
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

/** 登录成功后标记云端已连接，并清除历史拉取错误提示 */
export function markCloudConnected() {
  setCloudStatusPatch({
    connected: true,
    lastCloudLoadError: '',
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
      // 完整商品对象随合并一起累加（回溯时用于还原被删除的商品）
      var prevItems = Array.isArray(last.detail.deletedItems) ? last.detail.deletedItems : (last.detail.item ? [last.detail.item] : [])
      var newItems = Array.isArray(detail.deletedItems) ? detail.deletedItems : []

      last.detail = Object.assign({}, last.detail, {
        deletedCount: newCount,
        deletedItemIds: prevIds.concat([detail.itemId || detail.sid]),
        deletedNames: prevNames.concat([detail.name || '']),
        deletedItems: prevItems.concat(newItems),
      })
      last.message = '删除商品: ' + (detail.name || '') + ' x' + newCount
      last.time = new Date().toISOString()
      last.id = Date.now() + Math.floor(Math.random() * 1000)
      saveUiStateToLocalStorage()
      return
    }
  }

  // 对齐时间戳聚合：同一会话内连续的对齐日志合并为 1 条
  // 边界：用户操作日志、应用关闭再打开（会话时间检测）
  if (ALIGN_LOG_TYPES[type] && /对齐时间戳|内容一致/.test(message) && state.operationLogs.length > 0) {
    var last = state.operationLogs[0]
    var lastTime = new Date(last.time).getTime()
    if (
      ALIGN_LOG_TYPES[last.type] &&
      /对齐时间戳|内容一致/.test(last.message) &&
      lastTime >= _sessionStartAt // 只合并当前会话内的日志
    ) {
      var prevCount = last.detail?.alignCount || 1
      last.detail = Object.assign({}, last.detail, { alignCount: prevCount + 1 })
      last.message = last.message.replace(/ x\d+$/, '') + ' x' + (prevCount + 1)
      last.time = new Date().toISOString()
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
    autoBackup: { ...state.autoBackup },
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

  if (parsed?.autoBackup && typeof parsed.autoBackup === 'object') {
    Object.assign(state.autoBackup, {
      lastDate: typeof parsed.autoBackup.lastDate === 'string' ? parsed.autoBackup.lastDate : '',
      lastNotice: typeof parsed.autoBackup.lastNotice === 'string' ? parsed.autoBackup.lastNotice : '',
    })
  }
}

export function loadFromLocalStorage() {
  _sessionStartAt = Date.now() // 标记新会话开始
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
