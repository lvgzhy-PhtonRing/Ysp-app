<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import AppSidebar from './components/AppSidebar.vue'
import GlassModal from './components/GlassModal.vue'
import HomeModule from './modules/home/HomeModule.vue'
import InventoryModule from './modules/inventory/InventoryModule.vue'
import InventoryAgingModule from './modules/inventory/InventoryAgingModule.vue'
import PurchaseModule from './modules/purchase/PurchaseModule.vue'
import SalesModule from './modules/sales/SalesModule.vue'
import FinanceModule from './modules/finance/FinanceModule.vue'
import RushCarPrototypeModule from './modules/rushcar/RushCarPrototypeModule.vue'
import MarketPriceModule from './modules/market-price/MarketPriceModule.vue'
import {
  addOperationLog,
  clearCloudSession,
  clearOperationLogs,
  computeConflictDiff,
  exportData,
  getLocalModifiedAt,
  getUnsyncedOperations,
  isCloudSyncUnhealthy,
  isContentEqual,
  loadData,
  loadFromLocalStorage,
  loadUiStateFromLocalStorage,
  registerCloudSyncHandler,
  resetCloudUnhealthyWarning,
  saveToLocalStorage,
  setCloudLoadError,
  setCloudLoadSuccess,
  setCloudSession,
  setCloudSettings,
  setHistorySuppressed,
  setCloudSyncSuppressed,
  setLocalModifiedAt,
  state as store,
  redoLastChange,
  syncToCloudNow,
  undoLastChange,
} from './data/store'
import {
  fetchCloudState,
  isCloudConfigReady,
  readCloudConfigFromPublic,
  saveCloudState,
  signInWithPassword,
} from './services/cloudStore'
import { shouldWarnBeforeOverwrite, buildSyncRationale } from './services/dataProtection'

const tabs = [
  { id: 'home', name: '数据透视' },
  { id: 'inventory', name: '库存管理' },
  { id: 'sales', name: '销售记账' },
  { id: 'purchase', name: '采购管理' },
  { id: 'finance', name: '公共收支' },
  { id: 'rushcar', name: '美淘记录' },
  { id: 'market-price', name: '市场价格' },
]

const currentTab = ref('home')
const fileInputRef = ref(null)
const showLogsModal = ref(false)
const showLogDetailModal = ref(false)
const selectedLog = ref(null)
var expandedLogId = ref(null)
var showLogMeta = ref(false)
const logTypeMeta = {
  app_import: { label: '系统导入', color: 'text-teal-600', icon: 'fa-solid fa-upload', pillClass: 'bg-teal-100 text-teal-700' },
  app_export: { label: '系统导出', color: 'text-blue-600', icon: 'fa-solid fa-download', pillClass: 'bg-blue-100 text-blue-700' },
  app_undo: { label: '系统撤销', color: 'text-orange-600', icon: 'fa-solid fa-rotate-left', pillClass: 'bg-orange-100 text-orange-700' },
  app_redo: { label: '系统重做', color: 'text-emerald-600', icon: 'fa-solid fa-rotate-right', pillClass: 'bg-emerald-100 text-emerald-700' },
  cloud_settings: { label: '云端', color: 'text-cyan-600', icon: 'fa-solid fa-cloud', pillClass: 'bg-cyan-100 text-cyan-700' },
  cloud_signin: { label: '云端', color: 'text-cyan-600', icon: 'fa-solid fa-user-check', pillClass: 'bg-cyan-100 text-cyan-700' },
  cloud_signout: { label: '云端', color: 'text-cyan-600', icon: 'fa-solid fa-user-slash', pillClass: 'bg-cyan-100 text-cyan-700' },
  cloud_sync: { label: '云端', color: 'text-cyan-600', icon: 'fa-solid fa-arrows-rotate', pillClass: 'bg-cyan-100 text-cyan-700' },
  cloud_pull: { label: '云端', color: 'text-cyan-600', icon: 'fa-solid fa-cloud-arrow-down', pillClass: 'bg-cyan-100 text-cyan-700' },
  cloud_conflict: { label: '云端冲突', color: 'text-orange-600', icon: 'fa-solid fa-triangle-exclamation', pillClass: 'bg-orange-100 text-orange-700' },
  purchase_add: { label: '采购新增', color: 'text-yellow-600', icon: 'fa-solid fa-plus', pillClass: 'bg-yellow-100 text-yellow-700',
    summary: function (d) {
      var lines = []
      if (d.totalItems) lines.push(d.totalItems + '件')
      if (d.batch) lines.push('批次:' + d.batch)
      if (d.paymentBatch) lines.push('支付:' + d.paymentBatch)
      if (Array.isArray(d.sidSummary) && d.sidSummary.length > 0) {
        lines.push('商品:' + d.sidSummary.map(function (s) { return s.sid + '(' + s.qty + '件)' }).join('、'))
      }
      return lines
    },
  },
  purchase_transfer: { label: '采购转运', color: 'text-amber-600', icon: 'fa-solid fa-truck', pillClass: 'bg-amber-100 text-amber-700',
    summary: function (d) {
      var parts = []
      if (d.count) parts.push(d.count + '件')
      if (d.totalRMB) parts.push('总RMB:\xA5' + Number(d.totalRMB).toFixed(0))
      return parts
    },
  },
  purchase_transfer_delete: { label: '采购转运', color: 'text-amber-600', icon: 'fa-solid fa-truck-ramp-box', pillClass: 'bg-amber-100 text-amber-700' },
  purchase_edit: { label: '采购编辑', color: 'text-blue-600', icon: 'fa-solid fa-pen', pillClass: 'bg-blue-100 text-blue-700',
    summary: function (d) {
      var parts = []
      if (d.sid) parts.push('SID:' + d.sid)
      if (d.changedFields && d.changedFields.length) parts.push('改' + d.changedFields.length + '字段')
      return parts
    },
  },
  purchase_delete: { label: '采购删除', color: 'text-red-600', icon: 'fa-solid fa-trash', pillClass: 'bg-red-100 text-red-700',
    summary: function (d) {
      var parts = []
      if (d.sid) parts.push('SID:' + d.sid)
      if (d.deletedCount > 1) parts.push('共' + d.deletedCount + '件')
      return parts
    },
  },
  purchase_to_inventory: { label: '采购入库', color: 'text-green-600', icon: 'fa-solid fa-box', pillClass: 'bg-green-100 text-green-700' },
  purchase_batch_to_inventory: { label: '采购入库', color: 'text-green-600', icon: 'fa-solid fa-boxes-stacked', pillClass: 'bg-green-100 text-green-700',
    summary: function (d) {
      var parts = []
      if (d.count) parts.push(d.count + '件')
      return parts
    },
  },
  purchase_group_edit: { label: '购买组编辑', color: 'text-blue-600', icon: 'fa-solid fa-diagram-project', pillClass: 'bg-blue-100 text-blue-700' },
  inventory_manual_add: { label: '库存新增', color: 'text-blue-600', icon: 'fa-solid fa-bolt', pillClass: 'bg-blue-100 text-blue-700' },
  inventory_edit: { label: '库存编辑', color: 'text-blue-600', icon: 'fa-solid fa-pen', pillClass: 'bg-blue-100 text-blue-700',
    summary: function (d) {
      var parts = []
      if (d.sid) parts.push('SID:' + d.sid)
      if (d.affected > 1) parts.push('影响' + d.affected + '件')
      if (d.changedFields && d.changedFields.length) parts.push('改' + d.changedFields.length + '字段')
      return parts
    },
  },
  inventory_unlist: { label: '库存下架', color: 'text-amber-600', icon: 'fa-solid fa-arrow-down', pillClass: 'bg-amber-100 text-amber-700' },
  inventory_delete: { label: '库存删除', color: 'text-red-600', icon: 'fa-solid fa-trash', pillClass: 'bg-red-100 text-red-700',
    summary: function (d) {
      var parts = []
      if (d.sid) parts.push('SID:' + d.sid)
      if (d.deletedCount > 1) parts.push('共' + d.deletedCount + '件')
      return parts
    },
  },
  inventory_long_term: { label: '库存长线', color: 'text-purple-600', icon: 'fa-solid fa-infinity', pillClass: 'bg-purple-100 text-purple-700' },
  inventory_sales_sync: { label: '库存销售同步', color: 'text-green-600', icon: 'fa-solid fa-arrows-rotate', pillClass: 'bg-green-100 text-green-700' },
  sales_submit: { label: '销售新增', color: 'text-green-600', icon: 'fa-solid fa-cash-register', pillClass: 'bg-green-100 text-green-700',
    summary: function (d) {
      var parts = []
      if (d.price) parts.push('售价:\xA5' + Number(d.price).toFixed(0))
      return parts
    },
  },
  sales_edit: { label: '销售编辑', color: 'text-blue-600', icon: 'fa-solid fa-pen', pillClass: 'bg-blue-100 text-blue-700',
    summary: function (d) {
      var parts = []
      if (d.sid) parts.push('SID:' + d.sid)
      if (d.changedFields && d.changedFields.length) parts.push('改' + d.changedFields.length + '字段')
      return parts
    },
  },
  sales_rollback: { label: '销售回滚', color: 'text-red-600', icon: 'fa-solid fa-rotate-left', pillClass: 'bg-red-100 text-red-700' },
  finance_add_record: { label: '收支新增', color: 'text-indigo-600', icon: 'fa-solid fa-receipt', pillClass: 'bg-indigo-100 text-indigo-700',
    summary: function (d) {
      var parts = []
      if (d.type) parts.push(d.type === 'income' ? '收入' : '支出')
      if (d.amount) parts.push('\xA5' + Number(d.amount).toFixed(0))
      return parts
    },
  },
  finance_delete_record: { label: '收支删除', color: 'text-red-600', icon: 'fa-solid fa-trash', pillClass: 'bg-red-100 text-red-700' },
  finance_add_loan: { label: '借贷新增', color: 'text-yellow-600', icon: 'fa-solid fa-hand-holding-dollar', pillClass: 'bg-yellow-100 text-yellow-700' },
  finance_update_record: { label: '收支编辑', color: 'text-blue-600', icon: 'fa-solid fa-pen', pillClass: 'bg-blue-100 text-blue-700',
    summary: function (d) {
      var parts = []
      if (d.type) parts.push(d.type === 'income' ? '收入' : '支出')
      if (d.amount) parts.push('\xA5' + Number(d.amount).toFixed(0))
      return parts
    },
  },
  finance_update_loan: { label: '借贷编辑', color: 'text-blue-600', icon: 'fa-solid fa-pen', pillClass: 'bg-blue-100 text-blue-700' },
  finance_repaid: { label: '借贷归还', color: 'text-gray-600', icon: 'fa-solid fa-check', pillClass: 'bg-gray-100 text-gray-700' },
  finance_delete_loan: { label: '借贷删除', color: 'text-red-600', icon: 'fa-solid fa-trash', pillClass: 'bg-red-100 text-red-700' },
  purchase_transfer_edit: { label: '采购转运编辑', color: 'text-blue-600', icon: 'fa-solid fa-pen-to-square', pillClass: 'bg-blue-100 text-blue-700' },
  sales_unlist: { label: '销售下架', color: 'text-amber-600', icon: 'fa-solid fa-arrow-down', pillClass: 'bg-amber-100 text-amber-700' },
  home_calc: { label: '计算器', color: 'text-blue-600', icon: 'fa-solid fa-calculator', pillClass: 'bg-blue-100 text-blue-700',
    summary: function (d) {
      if (d.before !== undefined && d.after !== undefined) {
        return ['\xA5' + Number(d.before).toFixed(0) + ' → \xA5' + Number(d.after).toFixed(0)]
      }
      return []
    },
  },
  market_price_update: {
    label: '市价更新',
    color: 'text-blue-600',
    icon: 'fa-solid fa-chart-line',
    pillClass: 'bg-blue-100 text-blue-700',
    summary: function (d) {
      var parts = []
      if (d.price) parts.push('¥' + Number(d.price).toFixed(0))
      if (d.linkedCount > 1) parts.push('联动' + d.linkedCount + '件')
      return parts
    },
  },
}

function getLogMeta(type) {
  return (
    logTypeMeta[type] || {
      label: formatLogKey(type),
      color: 'text-gray-500',
      icon: 'fa-solid fa-circle-info',
      pillClass: 'bg-gray-100 text-gray-700',
      summary: function () { return [] },
    }
  )
}

function formatLogKey(key) {
  if (!key) return '-'
  const parts = key.split('_')
  return parts.length ? `${parts[0]}` : key
}

function openLogDetail(log) {
  selectedLog.value = log || null
  showLogDetailModal.value = true
  showLogMeta.value = false
}

function toggleExpand(log) {
  if (expandedLogId.value === log.id) {
    expandedLogId.value = null
  } else {
    expandedLogId.value = log.id
  }
}

function formatLogDetailValue(value) {
  if (value === null || value === undefined || value === '') return '-'
  if (typeof value === 'object') {
    return '[复杂数据，请查看上方明细]'
  }
  return String(value)
}

function getLogDetailEntries(detail) {
  if (!detail || typeof detail !== 'object') return []
  var userFields = ['sid', 'name', 'affected', 'deletedCount', 'count', 'totalItems', 'totalSids',
    'batch', 'purchaseGroupId', 'paymentBatch', 'category', 'transferId', 'inStockDate']
  return Object.entries(detail).filter(function (entry) {
    var key = entry[0]
    if (key === 'changes' || key === 'sidSummary' || key === 'deletedNames' || key === 'deletedItemIds' || key === 'changedFields' || key === 'itemId' || key === 'itemNames' || key === 'qty' || key === 'price' || key === 'cost' || key === 'profit' || key === 'amount' || key === 'account' || key === 'recordId' || key === 'loanId') return false
    return userFields.indexOf(key) >= 0
  })
}

function getLogModule(type) {
  if (!type) return '-'
  const [mod] = String(type).split('_')
  const map = {
    app: '系统',
    cloud: '云端',
    purchase: '采购',
    inventory: '库存',
    sales: '销售',
    finance: '公共收支',
    home: '数据透视',
  }
  return map[mod] || mod
}

function getLogRawJson(detail) {
  if (!detail || typeof detail !== 'object') return '-'
  try {
    return JSON.stringify(detail, null, 2)
  } catch (_) {
    return String(detail)
  }
}

const showCloudSettings = ref(false)
const cloudForm = ref({
  supabaseUrl: '',
  supabaseAnonKey: '',
  stateId: 'main',
  enabled: false,
  publicRead: true,
  email: '',
  password: '',
})
const cloudBusy = ref(false)

// 云端冲突检测弹窗（本地数据比云端新时弹出，供用户选择数据源）
const cloudConflict = ref(false)
const cloudConflictInfo = ref({ localAt: '', cloudAt: '', entries: [], total: 0 })
let cloudConflictResolver = null

// 云端覆盖本地前的重大异常强提示（B 方向）
const overwriteWarn = ref(false)
const overwriteWarnInfo = ref({ reasons: [], countLocal: 0, countCloud: 0, lastSaleLocal: '', lastSaleCloud: '' })
let overwriteWarnResolver = null

function askOverwriteWarn(info) {
  overwriteWarnInfo.value = info
  overwriteWarn.value = true
  return new Promise((resolve) => {
    overwriteWarnResolver = resolve
  })
}

function resolveOverwriteWarn(choice) {
  overwriteWarn.value = false
  if (typeof overwriteWarnResolver === 'function') {
    overwriteWarnResolver(choice)
    overwriteWarnResolver = null
  }
}

// 冲突差异明细最多展开显示的条目数，超出仅提示数量
const DIFF_DISPLAY_LIMIT = 5

function kindText(kind) {
  if (kind === 'localOnly') return '本地独有'
  if (kind === 'cloudOnly') return '云端独有'
  return '两边不同'
}

function tsToEpoch(t) {
  const n = t ? new Date(t).getTime() : 0
  return Number.isFinite(n) ? n : 0
}

function formatConflictTime(t) {
  if (!t || t === '-') return '-'
  const d = new Date(t)
  if (isNaN(d.getTime())) return String(t)
  return d.toLocaleString()
}

function askCloudConflict(cloudResult, localAt, diff) {
  cloudConflictInfo.value = {
    localAt: localAt || '',
    cloudAt: cloudResult?.updatedAt || '',
    entries: diff?.entries || [],
    total: diff?.total || 0,
  }
  cloudConflict.value = true
  return new Promise((resolve) => {
    cloudConflictResolver = resolve
  })
}

function resolveCloudConflict(choice) {
  cloudConflict.value = false
  if (typeof cloudConflictResolver === 'function') {
    cloudConflictResolver(choice)
    cloudConflictResolver = null
  }
}

const cloudUnhealthy = computed(() => isCloudSyncUnhealthy())
const showUnsyncedList = ref(false)
const unsyncedLogs = computed(() => getUnsyncedOperations())

watch(cloudUnhealthy, (unhealthy) => {
  if (!unhealthy) resetCloudUnhealthyWarning()
})

function getEnvCloudSettings() {
  const enabledRaw = String(import.meta.env.VITE_SUPABASE_ENABLED || '').toLowerCase()
  const publicReadRaw = String(import.meta.env.VITE_SUPABASE_PUBLIC_READ || 'true').toLowerCase()
  return {
    supabaseUrl: import.meta.env.VITE_SUPABASE_URL || '',
    supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY || '',
    stateId: import.meta.env.VITE_SUPABASE_STATE_ID || 'main',
    enabled: enabledRaw === 'true' || enabledRaw === '1',
    publicRead: !(publicReadRaw === 'false' || publicReadRaw === '0'),
  }
}

async function tryLoadCloudConfigFromPublicFile() {
  const basePath = import.meta.env.BASE_URL || '/'
  try {
    const config = await readCloudConfigFromPublic(basePath)
    if (isCloudConfigReady(config)) {
      setCloudSettings({
        ...store.cloudSettings,
        ...config,
      })
    }
  } catch (_) {
    // ignore
  }
}

function applyCloudDataToStore(payload = {}, options = {}) {
  if (!payload || typeof payload !== 'object') return false
  const trackHistory = options.trackHistory !== false

  setCloudSyncSuppressed(true)
  setHistorySuppressed(!trackHistory)
  try {
    loadData(payload)
    if (options.sourceUpdatedAt) setLocalModifiedAt(options.sourceUpdatedAt)
    saveToLocalStorage({ bumpTimestamp: false })
  } finally {
    setHistorySuppressed(false)
    setCloudSyncSuppressed(false)
  }
  return true
}

const canUndo = computed(() => store.undoStack.length > 0)
const canRedo = computed(() => store.redoStack.length > 0)

function handleUndo() {
  if (!canUndo.value) {
    alert('当前没有可撤销的操作')
    return
  }
  const result = undoLastChange()
  if (!result) {
    alert('撤销失败')
    return
  }
  addOperationLog('app_undo', `撤销：${result.message || result.type || '数据变更'}`)
}

function handleRedo() {
  if (!canRedo.value) {
    alert('当前没有可重做的操作')
    return
  }
  const result = redoLastChange()
  if (!result) {
    alert('重做失败')
    return
  }
  addOperationLog('app_redo', `重做：${result.message || result.type || '数据变更'}`)
}

function openCloudSettings() {
  cloudForm.value = {
    supabaseUrl: store.cloudSettings.supabaseUrl || '',
    supabaseAnonKey: store.cloudSettings.supabaseAnonKey || '',
    stateId: store.cloudSettings.stateId || 'main',
    enabled: !!store.cloudSettings.enabled,
    publicRead: store.cloudSettings.publicRead !== false,
    email: store.cloudSession.user?.email || '',
    password: '',
  }
  showCloudSettings.value = true
}

function saveCloudSettingsFromForm(notify = true) {
  setCloudSettings({
    supabaseUrl: cloudForm.value.supabaseUrl,
    supabaseAnonKey: cloudForm.value.supabaseAnonKey,
    stateId: cloudForm.value.stateId,
    enabled: cloudForm.value.enabled,
    publicRead: cloudForm.value.publicRead,
  })
  addOperationLog('cloud_settings', '更新云端同步配置', {
    supabaseUrl: cloudForm.value.supabaseUrl,
    stateId: cloudForm.value.stateId,
    enabled: cloudForm.value.enabled,
  })
  if (notify) {
    alert('云端配置已保存')
  }
}

async function cloudSignIn() {
  const email = cloudForm.value.email || ''
  const password = cloudForm.value.password || ''
  if (!email || !password) {
    alert('请填写云端账号和密码')
    return
  }

  saveCloudSettingsFromForm(false)
  if (!isCloudConfigReady(store.cloudSettings)) {
    alert('请先填写完整 Supabase 地址和 anon key')
    return
  }

  cloudBusy.value = true
  try {
    const session = await signInWithPassword(store.cloudSettings, email, password)
    setCloudSession(session)
    cloudForm.value.password = ''
    addOperationLog('cloud_signin', '云端登录成功', {
      email: session.user?.email,
    })
    alert('云端登录成功')
  } catch (err) {
    alert(`云端登录失败: ${err.message}`)
  } finally {
    cloudBusy.value = false
  }
}

function cloudSignOut() {
  clearCloudSession()
  addOperationLog('cloud_signout', '云端已退出登录')
  alert('已退出云端账号')
}

async function pullFromCloud() {
  if (!isCloudConfigReady(store.cloudSettings)) {
    alert('请先配置云端参数')
    return
  }

  cloudBusy.value = true
  try {
    const result = await fetchCloudState(store.cloudSettings, {
      session: store.cloudSession,
      onSession: (session) => setCloudSession(session),
      publicOnly: false,
    })
    if (!result?.payload) {
      alert('云端没有可用数据')
      return
    }
    applyCloudDataToStore(result.payload, { sourceUpdatedAt: result.updatedAt })
    setCloudLoadSuccess(result.updatedAt)
    addOperationLog('cloud_pull', '从云端加载数据成功', {
      updatedAt: result.updatedAt,
    })
    alert('已从云端加载最新数据')
  } catch (err) {
    setCloudLoadError(err.message)
    alert(`从云端加载失败: ${err.message}`)
  } finally {
    cloudBusy.value = false
  }
}

async function syncCloudNowFromUi() {
  if (!isCloudConfigReady(store.cloudSettings)) {
    alert('请先配置云端参数')
    return
  }

  cloudBusy.value = true
  try {
    const result = await syncToCloudNow()
    addOperationLog('cloud_sync', '手动同步云端成功', {
      updatedAt: result?.updatedAt,
    })
    alert('云端同步成功')
  } catch (err) {
    alert(`云端同步失败: ${err.message}`)
  } finally {
    cloudBusy.value = false
  }
}

function getCloudStatusText() {
  if (store.cloudStatus.syncing) return '同步中'
  if (store.cloudStatus.connected) return '已连接'
  return '未连接'
}

function getCloudStatusClass() {
  if (store.cloudStatus.syncing) return 'text-blue-600'
  if (store.cloudStatus.connected) return 'text-green-600'
  return 'text-gray-500'
}

function getCloudSyncTimeText() {
  if (!store.cloudStatus.lastSyncAt) return '-'
  return new Date(store.cloudStatus.lastSyncAt).toLocaleString()
}

function getCloudLoadTimeText() {
  if (!store.cloudStatus.lastCloudLoadAt) return '-'
  return new Date(store.cloudStatus.lastCloudLoadAt).toLocaleString()
}

/**
 * 页面切走/关闭时静默兜底上传：用 keepalive 请求把最新数据补传云端。
 * 尽力而为、不阻塞、不提示；有未同步操作且云同步可用时才触发。
 */
function syncSilentlyOnHidden() {
  if (document.visibilityState !== 'hidden') return
  if (!store.cloudSettings.enabled) return
  if (!isCloudConfigReady(store.cloudSettings)) return
  if (store.cloudStatus.syncing) return
  if (getUnsyncedOperations().length === 0) return

  const payload = exportData()
  saveCloudState(store.cloudSettings, payload, {
    session: store.cloudSession,
    onSession: (session) => setCloudSession(session),
    makePublic: store.cloudSettings.publicRead,
    keepalive: true,
  }).catch(() => {
    // 静默失败：尽力而为，不打扰用户
  })
}

async function loadCloudOnStartup() {
  if (!store.cloudSettings.enabled) return false
  if (!isCloudConfigReady(store.cloudSettings)) return false

  try {
    const result = await fetchCloudState(store.cloudSettings, {
      session: store.cloudSession,
      onSession: (session) => setCloudSession(session),
      publicOnly: false,
    })
    if (!result?.payload) return false

    const cloudTs = tsToEpoch(result.updatedAt)
    const localAt = getLocalModifiedAt()
    const localTs = tsToEpoch(localAt)

    // 本地数据比云端更新 → 先比较内容：仅时间戳/快照不同则对齐时间戳，不弹窗
    if (cloudTs && localTs && localTs > cloudTs) {
      const localPayload = exportData()

      // 用户数据内容一致（只是时间戳/自动快照不同）→ 对齐时间戳，不打扰用户
      if (isContentEqual(localPayload, result.payload)) {
        setLocalModifiedAt(result.updatedAt)
        saveToLocalStorage({ bumpTimestamp: false })
        setCloudLoadSuccess(result.updatedAt)
        addOperationLog('cloud_conflict', '本地与云端内容一致，已对齐时间戳', {
          localUpdatedAt: localAt,
          cloudUpdatedAt: result.updatedAt,
          ...buildSyncRationale(shouldWarnBeforeOverwrite(localPayload, result.payload)),
        })
        return true
      }

      const diff = computeConflictDiff(localPayload, result.payload)
      const warn = shouldWarnBeforeOverwrite(localPayload, result.payload)
      const choice = await askCloudConflict(result, localAt, diff)
      if (choice === 'local') {
        try {
          const syncResult = await syncToCloudNow()
          addOperationLog('cloud_conflict', '本地数据较新，已上传覆盖云端', {
            updatedAt: syncResult?.updatedAt || result.updatedAt,
            ...buildSyncRationale(warn),
          })
          setCloudLoadSuccess(syncResult?.updatedAt || result.updatedAt)
        } catch (err) {
          addOperationLog('cloud_conflict', '本地数据较新，但上传云端失败，已保留本地', {
            error: err.message,
            ...buildSyncRationale(warn),
          })
          setCloudLoadError(err.message)
          alert(`上传云端失败：${err.message}\n本地数据已保留，请检查网络或云端登录。`)
        }
        return true
      }
      if (choice === 'cloud') {
        if (warn.shouldWarn) {
          const c = await askOverwriteWarn(warn)
          if (c !== 'overwrite') {
            addOperationLog('cloud_conflict', '云端数据异常，已取消用云端覆盖，保留本地', buildSyncRationale(warn))
            return false
          }
        }
        applyCloudDataToStore(result.payload, { trackHistory: false, sourceUpdatedAt: result.updatedAt })
        setCloudLoadSuccess(result.updatedAt)
        addOperationLog('cloud_conflict', '云端数据较新，已用云端覆盖本地', {
          updatedAt: result.updatedAt,
          ...buildSyncRationale(warn),
        })
        return true
      }
      // 手动对比：不自动覆盖，保持本地数据，用户可在云端设置里手动拉取/同步
      addOperationLog('cloud_conflict', '本地与云端数据存在差异，已保留本地待手动处理', {
        localUpdatedAt: localAt,
        cloudUpdatedAt: result.updatedAt,
        diffCount: diff.total,
        ...buildSyncRationale(warn),
      })
      return false
    }

    // 云端较新或无法比较 → 先检测重大异常再决定是否覆盖（原行为为无条件覆盖）
    const cloudWarn = shouldWarnBeforeOverwrite(exportData(), result.payload)
    if (cloudWarn.shouldWarn) {
      const c = await askOverwriteWarn(cloudWarn)
      if (c !== 'overwrite') {
        addOperationLog('cloud_conflict', '检测到云端数据异常，已保留本地', buildSyncRationale(cloudWarn))
        return false
      }
    }
    applyCloudDataToStore(result.payload, { trackHistory: false, sourceUpdatedAt: result.updatedAt })
    setCloudLoadSuccess(result.updatedAt)
    addOperationLog('cloud_conflict', '云端数据较新，已用云端覆盖本地', {
      updatedAt: result.updatedAt,
      ...buildSyncRationale(cloudWarn),
    })
    return true
  } catch (err) {
    setCloudLoadError(err.message)
    return false
  }
}

const currentDate = computed(() => {
  const d = new Date()
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}${mm}${dd}`
})

function triggerImport() {
  fileInputRef.value?.click()
}

function handleImport(event) {
  const file = event.target.files?.[0]
  if (!file) return

  const reader = new FileReader()
  reader.onload = (e) => {
    try {
      const json = JSON.parse(e.target?.result)
      loadData(json)
      saveToLocalStorage()
      addOperationLog('app_import', '导入数据成功', { file: file.name })
      alert('导入成功')
    } catch (err) {
      alert(`导入失败：${err.message}`)
    }
  }
  reader.readAsText(file)
  event.target.value = ''
}

function handleExport() {
  const data = exportData()
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `饮食派数据_${currentDate.value}.json`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
  addOperationLog('app_export', '导出备份', { fileName: a.download })
}

onMounted(async () => {
  loadUiStateFromLocalStorage()
  loadFromLocalStorage()

  const envCloudSettings = getEnvCloudSettings()
  if (!isCloudConfigReady(store.cloudSettings) && isCloudConfigReady(envCloudSettings)) {
    setCloudSettings({
      ...store.cloudSettings,
      ...envCloudSettings,
    })
  }

  if (!isCloudConfigReady(store.cloudSettings)) {
    await tryLoadCloudConfigFromPublicFile()
  }

  registerCloudSyncHandler(async (payload) => {
    const result = await saveCloudState(store.cloudSettings, payload, {
      session: store.cloudSession,
      onSession: (session) => setCloudSession(session),
      makePublic: store.cloudSettings.publicRead,
    })
    return {
      updatedAt: result?.updatedAt,
      row: result?.row,
    }
  })

  document.addEventListener('visibilitychange', syncSilentlyOnHidden)

  const cloudLoaded = await loadCloudOnStartup()

  if (!cloudLoaded && store.items.length === 0) {
    try {
      const basePath = import.meta.env.BASE_URL || '/'
      const res = await fetch(`${basePath}a.json?t=${Date.now()}`, { cache: 'no-store' })
      if (res.ok) {
        const json = await res.json()
        loadData(json)
      }
    } catch (_) {
      // ignore
    }
  }
})

onBeforeUnmount(() => {
  document.removeEventListener('visibilitychange', syncSilentlyOnHidden)
})

watch(
  () => store.rushcar,
  () => {
    saveToLocalStorage()
  },
  { deep: true },
)
</script>

<template>
  <div class="flex h-screen overflow-hidden bg-appbg text-gray-800" v-cloak>
    <input
      ref="fileInputRef"
      type="file"
      accept="application/json,.json"
      class="hidden"
      @change="handleImport"
    />

    <AppSidebar
      :tabs="tabs"
      :current-tab="currentTab"
      :version="store.version"
      :cloud-unhealthy="cloudUnhealthy"
      @select="currentTab = $event"
      @import="triggerImport"
      @export="handleExport"
      @cloud="openCloudSettings"
      @logs="showLogsModal = true"
    />

    <main :class="['flex-1 overflow-y-auto p-8', currentTab === 'inventory-aging' ? 'bg-sky-50/60' : '']">
      <!-- 云端未连接警告 -->
      <div
        v-if="cloudUnhealthy"
        class="-mt-4 mb-4 mx-1 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-700"
      >
        <div class="flex items-center gap-2">
          <i class="fa-solid fa-triangle-exclamation text-amber-500"></i>
          <span>云端同步未连接，数据仅保存在本地浏览器中。</span>
          <button class="ml-auto shrink-0 underline hover:text-amber-800" @click="openCloudSettings">去登录</button>
        </div>
        <div v-if="unsyncedLogs.length" class="mt-2 border-t border-amber-200 pt-2">
          <button class="text-xs underline hover:text-amber-900" @click="showUnsyncedList = !showUnsyncedList">
            {{ showUnsyncedList ? '收起未同步明细' : '查看未同步明细（' + unsyncedLogs.length + ' 条）' }}
          </button>
          <div v-if="showUnsyncedList" class="mt-1 max-h-44 overflow-y-auto space-y-1">
            <div
              v-for="log in unsyncedLogs.slice(0, 30)"
              :key="log.id"
              class="flex items-start justify-between gap-3 text-xs text-amber-800"
            >
              <span class="min-w-0 truncate">{{ getLogMeta(log.type).label }} · {{ log.message }}</span>
              <span class="shrink-0 text-amber-600/70">{{ new Date(log.time).toLocaleString() }}</span>
            </div>
            <div v-if="unsyncedLogs.length > 30" class="text-xs text-amber-600">仅显示前 30 条，共 {{ unsyncedLogs.length }} 条</div>
          </div>
        </div>
      </div>
      <div class="mx-auto max-w-7xl space-y-6 pb-8">
        <HomeModule v-if="currentTab === 'home'" />
        <InventoryModule v-else-if="currentTab === 'inventory'" @open-aging="currentTab = 'inventory-aging'" />
        <InventoryAgingModule v-else-if="currentTab === 'inventory-aging'" @back="currentTab = 'inventory'" />
        <SalesModule v-else-if="currentTab === 'sales'" />
        <PurchaseModule v-else-if="currentTab === 'purchase'" />
        <FinanceModule v-else-if="currentTab === 'finance'" />
        <RushCarPrototypeModule v-else-if="currentTab === 'rushcar'" :source-data="store" />
        <MarketPriceModule v-else-if="currentTab === 'market-price'" />

        <div
          v-else
          class="apple-card p-8 text-sm text-gray-500"
        >
          {{ tabs.find((t) => t.id === currentTab)?.name }} 模块 UI 开发中…
        </div>
      </div>
    </main>

    <GlassModal v-model="showCloudSettings" panel-class="w-full max-w-md p-6 relative" :close-on-overlay="true">
      <div class="mb-4 text-xl font-bold">云端同步设置</div>
      <div class="space-y-3">
        <div>
          <label class="block text-sm mb-1 text-gray-600">Supabase URL</label>
          <input v-model="cloudForm.supabaseUrl" class="apple-input" placeholder="https://xxxx.supabase.co" />
        </div>
        <div>
          <label class="block text-sm mb-1 text-gray-600">Supabase anon key</label>
          <input v-model="cloudForm.supabaseAnonKey" class="apple-input" placeholder="eyJ..." />
        </div>
        <div>
          <label class="block text-sm mb-1 text-gray-600">State ID</label>
          <input v-model="cloudForm.stateId" class="apple-input" placeholder="main" />
        </div>
        <div class="flex items-center gap-3 text-sm">
          <label class="inline-flex items-center gap-2 cursor-pointer">
            <input v-model="cloudForm.enabled" type="checkbox" />
            <span>启用云端同步</span>
          </label>
          <label class="inline-flex items-center gap-2 cursor-pointer">
            <input v-model="cloudForm.publicRead" type="checkbox" />
            <span>手机页匿名读取</span>
          </label>
        </div>
      </div>

      <div class="mt-4 border-t border-gray-100 pt-4 space-y-3">
        <div class="text-sm font-medium text-gray-700">云端登录（写入需要）</div>
        <div>
          <label class="block text-sm mb-1 text-gray-600">邮箱</label>
          <input v-model="cloudForm.email" class="apple-input" placeholder="you@example.com" />
        </div>
        <div>
          <label class="block text-sm mb-1 text-gray-600">密码</label>
          <input v-model="cloudForm.password" type="password" class="apple-input" placeholder="Supabase 账号密码" />
        </div>
      </div>

      <div class="mt-4 rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-600">
        <div class="flex justify-between"><span>状态</span><span :class="getCloudStatusClass()">{{ getCloudStatusText() }}</span></div>
        <div class="flex justify-between"><span>最近同步</span><span>{{ getCloudSyncTimeText() }}</span></div>
        <div class="flex justify-between"><span>最近拉取</span><span>{{ getCloudLoadTimeText() }}</span></div>
        <div v-if="store.cloudStatus.lastSyncError" class="mt-1 text-red-500">同步错误：{{ store.cloudStatus.lastSyncError }}</div>
        <div v-if="store.cloudStatus.lastCloudLoadError" class="mt-1 text-red-500">拉取错误：{{ store.cloudStatus.lastCloudLoadError }}</div>
      </div>

      <div class="mt-6 flex flex-wrap justify-end gap-2">
        <button class="btn btn-outline" @click="showCloudSettings = false">关闭</button>
        <button class="btn btn-outline" :disabled="cloudBusy" @click="saveCloudSettingsFromForm">保存配置</button>
        <button class="btn btn-outline" :disabled="cloudBusy" @click="cloudSignIn">登录云端</button>
        <button class="btn btn-outline" :disabled="cloudBusy" @click="cloudSignOut">退出登录</button>
        <button class="btn btn-outline" :disabled="cloudBusy" @click="pullFromCloud">从云端拉取</button>
        <button class="btn btn-primary" :disabled="cloudBusy" @click="syncCloudNowFromUi">立即同步</button>
      </div>
    </GlassModal>

    <GlassModal v-model="cloudConflict" panel-class="w-full max-w-md p-6 relative max-h-[80vh] overflow-y-auto" :close-on-overlay="false">
      <div class="mb-1 text-xl font-bold">检测到数据冲突</div>
      <p class="text-sm text-gray-600 mb-4">
        本机数据比云端更新，可能是上次未同步成功或另一台设备未同步。请选择使用哪一份数据：
      </p>
      <div class="mb-4 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600 space-y-1">
        <div class="flex justify-between gap-3">
          <span class="shrink-0">本机数据时间</span>
          <span class="font-mono text-gray-800">{{ formatConflictTime(cloudConflictInfo.localAt) }}</span>
        </div>
        <div class="flex justify-between gap-3">
          <span class="shrink-0">云端数据时间</span>
          <span class="font-mono text-gray-800">{{ formatConflictTime(cloudConflictInfo.cloudAt) }}</span>
        </div>
      </div>
      <div v-if="cloudConflictInfo.total" class="mb-4 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600">
        <div class="font-medium text-gray-700 mb-1">差异明细（{{ cloudConflictInfo.total }} 处）</div>
        <div class="space-y-2 max-h-48 overflow-y-auto">
          <div
            v-for="e in cloudConflictInfo.entries.slice(0, DIFF_DISPLAY_LIMIT)"
            :key="e.key"
            class="border-t border-gray-200/70 pt-1.5 first:border-t-0 first:pt-0"
          >
            <div class="flex items-center gap-2">
              <span class="min-w-0 truncate font-medium text-gray-700">{{ e.collectionLabel }}·{{ e.recordLabel }}</span>
              <span class="shrink-0 rounded bg-white/70 px-1.5 py-0.5 text-gray-500">{{ kindText(e.kind) }}</span>
            </div>
            <div v-if="e.kind === 'modified' && e.summary" class="mt-0.5 text-gray-500">{{ e.summary }}</div>
          </div>
          <div v-if="cloudConflictInfo.total > DIFF_DISPLAY_LIMIT" class="border-t border-gray-200/70 pt-1.5 text-gray-500">
            另有 {{ cloudConflictInfo.total - DIFF_DISPLAY_LIMIT }} 处未显示
          </div>
        </div>
      </div>
      <div class="space-y-2">
        <button class="btn btn-primary w-full" @click="resolveCloudConflict('local')">用本地的覆盖云端（上传本地）</button>
        <button class="btn btn-outline w-full" @click="resolveCloudConflict('cloud')">用云端的覆盖本地</button>
        <button class="btn btn-outline w-full" @click="resolveCloudConflict('manual')">先手动对比（不自动同步）</button>
      </div>
    </GlassModal>

    <GlassModal v-model="overwriteWarn" panel-class="w-full max-w-md p-6 relative" :close-on-overlay="false">
      <h3 class="mb-2 text-lg font-semibold text-red-600">⚠️ 云端数据疑似异常</h3>
      <p class="mb-3 text-sm text-gray-600">检测到云端数据比本地少或更旧，用云端覆盖本地可能丢失本地改动：</p>
      <ul class="mb-4 space-y-1.5 text-sm text-gray-700">
        <li v-for="(r, i) in overwriteWarnInfo.reasons" :key="i" class="rounded bg-red-50 px-2 py-1">• {{ r }}</li>
      </ul>
      <div class="grid gap-2">
        <button class="btn btn-outline w-full" @click="resolveOverwriteWarn('overwrite')">仍用云端覆盖本地</button>
        <button class="btn btn-primary w-full" @click="resolveOverwriteWarn('keep')">保留本地数据（推荐）</button>
      </div>
    </GlassModal>

    <GlassModal v-model="showLogsModal" panel-class="w-full max-w-2xl relative max-h-[80vh] flex flex-col p-0" :close-on-overlay="true">
      <div class="px-4 py-4 border-b border-gray-100 flex items-center justify-between">
        <h3 class="text-xl font-bold">操作日志 <span class="text-sm font-normal text-gray-500">(近7天)</span></h3>
        <div class="flex items-center gap-2">
          <button class="btn btn-outline btn-sm" :disabled="!canUndo" @click="handleUndo">撤销 {{ store.undoStack.length }}</button>
          <button class="btn btn-outline btn-sm" :disabled="!canRedo" @click="handleRedo">重做 {{ store.redoStack.length }}</button>
          <button class="btn btn-outline btn-sm" @click="clearOperationLogs">清空日志</button>
        </div>
      </div>
      <div class="flex-1 overflow-y-auto space-y-2 p-4">
        <div v-if="store.operationLogs.length === 0" class="text-center text-gray-400 py-8">暂无日志记录</div>
        <div
          v-for="log in store.operationLogs.slice(0, 100)"
          :key="log.id"
          class="p-3 rounded-lg cursor-pointer transition-colors"
          :class="expandedLogId === log.id ? 'bg-blue-50 ring-1 ring-blue-200' : 'bg-gray-50 hover:bg-gray-100'"
          @click="toggleExpand(log)"
        >
          <div class="flex justify-between items-start">
            <div class="flex items-start gap-2 min-w-0">
              <span class="inline-block px-2 py-0.5 rounded text-xs font-medium shrink-0" :class="getLogMeta(log.type).pillClass">
                {{ getLogMeta(log.type).label }}
              </span>
              <div class="min-w-0">
                <span class="text-sm text-gray-800 break-words">{{ log.message }}</span>
              </div>
            </div>
            <span class="text-xs text-gray-400 whitespace-nowrap ml-2 shrink-0">{{ new Date(log.time).toLocaleString() }}</span>
          </div>

          <div v-if="expandedLogId === log.id && getLogMeta(log.type).summary" class="mt-2 border-t border-blue-100 pt-2">
            <div class="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
              <span v-for="(line, i) in getLogMeta(log.type).summary(log.detail)" :key="i">{{ line }}</span>
            </div>
            <div class="mt-2 flex items-center gap-3">
              <button class="text-[11px] text-blue-600 hover:text-blue-800 font-medium" @click.stop="openLogDetail(log)">
                <i class="fa-solid fa-magnifying-glass mr-1" />查看详情
              </button>
              <span class="text-[11px] text-gray-300">收起 ▲</span>
            </div>
          </div>

          <div v-if="expandedLogId !== log.id" class="mt-1 text-[11px] text-blue-500">点击查看详情</div>
        </div>
      </div>
    </GlassModal>

    <GlassModal v-model="showLogDetailModal" panel-class="w-full max-w-xl p-0 overflow-hidden" :close-on-overlay="true">
      <div class="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
        <div class="flex items-center gap-2">
          <i :class="getLogMeta(selectedLog?.type).icon" />
          <h3 class="text-lg font-bold">日志详情</h3>
        </div>
        <span class="text-xs text-gray-400">{{ selectedLog?.time ? new Date(selectedLog.time).toLocaleString() : '' }}</span>
      </div>
      <div class="p-5 space-y-4 text-sm">
        <div class="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
          <div class="bg-gray-50 rounded px-3 py-2">
            <div class="text-gray-400">日志ID</div>
            <div class="text-gray-700">{{ selectedLog?.id || '-' }}</div>
          </div>
          <div class="bg-gray-50 rounded px-3 py-2">
            <div class="text-gray-400">模块</div>
            <div class="text-gray-700">{{ getLogModule(selectedLog?.type) }}</div>
          </div>
          <div class="bg-gray-50 rounded px-3 py-2">
            <div class="text-gray-400">详情字段数</div>
            <div class="text-gray-700">{{ selectedLog?.detail ? Object.keys(selectedLog.detail).length : 0 }}</div>
          </div>
          <div class="bg-gray-50 rounded px-3 py-2">
            <div class="text-gray-400">时间</div>
            <div class="text-gray-700">{{ selectedLog?.time ? new Date(selectedLog.time).toLocaleString() : '-' }}</div>
          </div>
        </div>
        <div>
          <div class="text-xs text-gray-500 mb-1">类型</div>
          <div class="font-medium">{{ getLogMeta(selectedLog?.type).label }} ({{ selectedLog?.type || '-' }})</div>
        </div>
        <div>
          <div class="text-xs text-gray-500 mb-1">描述</div>
          <div class="font-medium">{{ selectedLog?.message || '-' }}</div>
        </div>
        <div>
          <div class="text-xs text-gray-500 mb-2">详细字段</div>
          <div v-if="selectedLog?.detail && Object.keys(selectedLog.detail).length > 0" class="border border-gray-200 rounded-lg overflow-hidden">
            <template v-if="selectedLog?.detail?.changes && Object.keys(selectedLog.detail.changes).length > 0">
              <div class="bg-indigo-50 text-indigo-700 px-3 py-2 text-xs font-medium border-b border-indigo-100">修改明细</div>
              <div
                v-for="(change, fieldKey) in selectedLog.detail.changes"
                :key="`change-${fieldKey}`"
                class="grid grid-cols-[120px_1fr_1fr] border-b border-gray-100"
              >
                <div class="bg-gray-50 px-3 py-2 text-gray-700">{{ fieldKey }}</div>
                <div class="px-3 py-2 border-l border-gray-100">
                  <div class="text-[11px] text-gray-400 mb-1">修改前</div>
                  <pre class="text-gray-700 whitespace-pre-wrap break-all m-0">{{ formatLogDetailValue(change?.before) }}</pre>
                </div>
                <div class="px-3 py-2 border-l border-gray-100">
                  <div class="text-[11px] text-gray-400 mb-1">修改后</div>
                  <pre class="text-gray-900 whitespace-pre-wrap break-all m-0">{{ formatLogDetailValue(change?.after) }}</pre>
                </div>
              </div>
            </template>
            <!-- 商品清单（购买组新增） -->
            <template v-if="selectedLog?.detail?.sidSummary && selectedLog.detail.sidSummary.length > 0">
              <div class="bg-green-50 text-green-700 px-3 py-2 text-xs font-medium border-b border-green-100">商品清单</div>
              <div class="overflow-x-auto">
                <table class="w-full text-xs">
                  <thead>
                    <tr class="bg-gray-50 text-gray-500">
                      <th class="px-3 py-1.5 text-left font-medium">SID</th>
                      <th class="px-3 py-1.5 text-left font-medium">名称</th>
                      <th class="px-3 py-1.5 text-right font-medium">日元原价</th>
                      <th class="px-3 py-1.5 text-center font-medium">件数</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="(s, si) in selectedLog.detail.sidSummary" :key="si" class="border-b border-gray-50">
                      <td class="px-3 py-1.5 text-gray-500 font-mono">{{ s.sid }}</td>
                      <td class="px-3 py-1.5">{{ s.name }}</td>
                      <td class="px-3 py-1.5 text-right">{{ s.originalPrice ? '\xA5' + s.originalPrice : '-' }}</td>
                      <td class="px-3 py-1.5 text-center">{{ s.qty }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </template>

            <!-- 删除清单 -->
            <template v-if="selectedLog?.detail?.deletedNames && selectedLog.detail.deletedNames.length > 0">
              <div class="bg-red-50 text-red-700 px-3 py-2 text-xs font-medium border-b border-red-100">
                已删除 {{ selectedLog.detail.deletedCount || selectedLog.detail.deletedNames.length }} 件商品
              </div>
              <div class="px-3 py-2 text-xs text-gray-600">
                {{ selectedLog.detail.deletedNames.join('、') }}
              </div>
            </template>
            <div
              v-for="([k, v]) in getLogDetailEntries(selectedLog.detail)"
              :key="k"
              class="grid grid-cols-[120px_1fr] border-b border-gray-100 last:border-b-0"
            >
              <div class="bg-gray-50 px-3 py-2 text-gray-600">{{ k }}</div>
              <pre class="px-3 py-2 text-gray-800 whitespace-pre-wrap break-all m-0">{{ formatLogDetailValue(v) }}</pre>
            </div>
          </div>
          <div v-else class="text-gray-400">无详细字段</div>
        </div>
        <!-- 数据追踪（默认折叠） -->
        <div class="border-t border-gray-100 pt-3">
          <button class="text-xs text-gray-400 hover:text-gray-600 w-full text-left" @click="showLogMeta = !showLogMeta">
            <i :class="showLogMeta ? 'fa-solid fa-chevron-down' : 'fa-solid fa-chevron-right'" class="mr-1" />
            数据追踪
          </button>
          <div v-if="showLogMeta" class="mt-2 text-xs text-gray-400 space-y-1">
            <div>type: {{ selectedLog?.type || '-' }}</div>
            <div>id: {{ selectedLog?.id || '-' }}</div>
            <div>time: {{ selectedLog?.time || '-' }}</div>
          </div>
        </div>
      </div>
      <div class="px-5 py-4 border-t border-gray-100 flex justify-end">
        <button class="btn btn-outline" @click="showLogDetailModal = false">关闭</button>
      </div>
    </GlassModal>
  </div>
</template>
