// 全局状态管理：承接应用主数据、导入导出、localStorage 持久化

import { reactive } from 'vue'

const APP_VERSION = '2.1.2'
const CLOUD_SYNC_DEBOUNCE_MS = 800

const DEFAULT_CALC = {
  debt: 0,
  wechat: 0,
  publicExp: 0,
  unconfirmed: 0,
  fund: 0,
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

export const state = reactive({
  // 字段名与 a.json 对应映射后的 store 结构保持一致
  items: [],
  calc: { ...DEFAULT_CALC },
  financeRecords: [],
  loanRecords: [],
  transfers: [],
  paytonAccounts: {},
  paytonRecords: [],
  paytonInventory: [],
  version: APP_VERSION,
  webdavSettings: {
    url: '',
    username: '',
    password: '',
    enabled: false,
  },
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
  operationLogs: [],
})

const UI_STORAGE_KEY = 'ysp_ui'
let cloudSyncHandler = null
let cloudSyncTimer = null
let suppressCloudSync = false

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
  }
  replaceObject(state.calc, nextCalc)

  replaceArray(state.financeRecords, data.finance?.records)
  replaceArray(state.loanRecords, data.finance?.loans)

  replaceArray(state.transfers, data.transfers)

  replaceObject(state.paytonAccounts, data.payton?.accounts || {})
  replaceArray(state.paytonRecords, data.payton?.records)
  replaceArray(state.paytonInventory, data.payton?.inventory)

  // 侧边栏版本固定显示程序版本，不受导入 JSON 中 version 字段影响
  state.version = APP_VERSION
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
    payton: {
      accounts: clone(state.paytonAccounts),
      records: clone(state.paytonRecords),
      inventory: clone(state.paytonInventory),
    },
    version: state.version,
  }
}

export function saveToLocalStorage() {
  localStorage.setItem('ysp_data', JSON.stringify(exportData()))
  scheduleCloudSync()
}

export function registerCloudSyncHandler(handler) {
  cloudSyncHandler = typeof handler === 'function' ? handler : null
}

export function setCloudSyncSuppressed(flag) {
  suppressCloudSync = Boolean(flag)
}

export async function syncToCloudNow() {
  clearCloudSyncTimer()
  return runCloudSync({ reason: 'manual', force: true })
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

export function addOperationLog(type, message, detail = {}) {
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
}

export function clearOperationLogs() {
  state.operationLogs.splice(0, state.operationLogs.length)
  saveUiStateToLocalStorage()
}

export function saveUiStateToLocalStorage() {
  const payload = {
    webdavSettings: { ...state.webdavSettings },
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
  if (parsed?.webdavSettings && typeof parsed.webdavSettings === 'object') {
    Object.assign(state.webdavSettings, parsed.webdavSettings)
  }

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
  if (!raw) return

  const parsed = JSON.parse(raw)
  loadData(parsed)
}
