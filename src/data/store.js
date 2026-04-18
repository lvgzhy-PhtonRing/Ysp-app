// 全局状态管理：承接应用主数据、导入导出、localStorage 持久化

import { reactive } from 'vue'

const APP_VERSION = '2.1.2'

const DEFAULT_CALC = {
  debt: 0,
  wechat: 0,
  publicExp: 0,
  unconfirmed: 0,
  fund: 0,
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
  operationLogs: [],
})

const UI_STORAGE_KEY = 'ysp_ui'

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
