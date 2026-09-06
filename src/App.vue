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
import { primaryConflictAction } from './utils/cloudConflict'
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
  markCloudConnected,
  registerCloudApplyHandler,
  registerCloudConflictHandler,
  registerCloudSyncHandler,
  resetCloudUnhealthyWarning,
  runCloudSyncCheck,
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
  getLogBrief,
  getLogDetailSections,
  getLogMeta,
  getLogModule,
  hasLogDetail,
} from './data/operationLogDisplay'
import {
  fetchCloudState,
  isCloudConfigReady,
  readCloudConfigFromPublic,
  saveCloudState,
  signInWithPassword,
  signOutCloudSession,
} from './services/cloudStore'
import { shouldWarnBeforeOverwrite } from './services/dataProtection'
import { downloadJsonBackup } from './services/dataProtection'

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
var expandedLogId = ref(null)
var rawExpanded = ref(null)
const showAllDifferences = ref(false)
function toggleExpand(log) {
  if (expandedLogId.value === log.id) {
    expandedLogId.value = null
  } else {
    expandedLogId.value = log.id
  }
}

function toggleRaw(log) {
  rawExpanded.value = rawExpanded.value === log.id ? null : log.id
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
const cloudConflictType = ref('recovery')
const cloudConflictInfo = ref({ localAt: '', cloudAt: '', entries: [], total: 0 })
let cloudConflictResolver = null

// 主操作按钮方向：本地更新→上传，云端更新→下载
const primaryConflictActionValue = computed(() =>
  primaryConflictAction(cloudConflictType.value, cloudConflictInfo.value.localAt, cloudConflictInfo.value.cloudAt),
)

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

// 每日备份手动下载兜底（C 方向）
const backupNoticeVisible = ref(false)
let backupNoticeTimer = null

watch(
  () => store.autoBackup.lastNotice,
  (notice) => {
    if (!notice || notice !== todayStr()) return
    backupNoticeVisible.value = true
    clearTimeout(backupNoticeTimer)
    backupNoticeTimer = setTimeout(() => {
      backupNoticeVisible.value = false
    }, 8000)
  },
  { immediate: true }, // 重载页面时若今日已生成备份（lastNotice===today），仍显示 toast 供手动下载
)

function downloadBackupManually() {
  const today = todayStr()
  downloadJsonBackup({ ...exportData(), operationLogs: [...store.operationLogs] }, `饮食派数据_${today}.json`)
  backupNoticeVisible.value = false
}

function dismissBackupNotice() {
  backupNoticeVisible.value = false
}

function todayStr() {
  const d = new Date()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
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

/**
 * 冲突决策模态框（字段级差异展示）。
 * 由 store.js runCloudSync 通过 registerCloudConflictHandler 调用，也可在 loadCloudOnStartup 中直接调用。
 * @param {'upload-local'|'manual-sync'|'recovery'} type - 冲突类型
 * @param {object} data - { diff, warn, cloudUpdatedAt, localModifiedAt }
 * @returns {Promise<'upload'|'use-cloud'|'keep-local'|'cancel'>}
 */
async function askCloudConflict(type, data = {}) {
  const { diff, cloudUpdatedAt, localModifiedAt, warn } = data
  cloudConflictType.value = type || 'recovery'
  cloudConflictInfo.value = {
    localAt: localModifiedAt || '',
    cloudAt: cloudUpdatedAt || '',
    entries: diff?.entries || [],
    total: diff?.total || 0,
  }
  cloudConflict.value = true
  const choice = await new Promise((resolve) => {
    cloudConflictResolver = resolve
  })
  // 用户选择"用云端覆盖本地"，且检测到强警告（数据骤减/销售日期倒挂等）→ 二次确认
  if (choice === 'use-cloud' && warn?.shouldWarn && Array.isArray(warn.reasons) && warn.reasons.length > 0) {
    const second = await askOverwriteWarn({
      reasons: warn.reasons,
      countLocal: warn.countDiff ?? 0,
      countCloud: 0,
      lastSaleLocal: warn.lastSaleLocal ?? '',
      lastSaleCloud: warn.lastSaleCloud ?? '',
    })
    return second === 'overwrite' ? 'use-cloud' : 'keep-local'
  }
  return choice
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

function cloudFieldMissingGuard(label, remoteValue, localCount) {
  if (localCount <= 0) return false
  if (Array.isArray(remoteValue)) return false
  console.warn(`[applyCloudDataToStore] 云端载荷缺少或损坏「${label}」，拒绝应用以保护本地数据`)
  return true
}

function applyCloudDataToStore(payload = {}, options = {}) {
  if (!payload || typeof payload !== 'object') return false
  const guards = [
    ['items', payload.items, store.items.length],
    ['收支记录', payload.finance?.records, store.financeRecords.length],
    ['借贷记录', payload.finance?.loans, store.loanRecords.length],
    ['转运记录', payload.transfers, store.transfers.length],
    ['美淘订单', payload.rushcar?.entries, store.rushcar.entries.length],
    ['转运公司', payload.rushcar?.forwarderInfos, store.rushcar.forwarderInfos.length],
    ['美泰站点', payload.rushcar?.mattelSiteInfos, store.rushcar.mattelSiteInfos.length],
    ['支付卡', payload.rushcar?.paymentCards, store.rushcar.paymentCards.length],
  ]
  for (const [label, value, localCount] of guards) {
    if (cloudFieldMissingGuard(label, value, localCount)) return false
  }
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
    markCloudConnected()
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

async function cloudSignOut() {
  // 先通知服务端吊销令牌，再清本地；网络异常不阻塞本地退出
  try {
    await signOutCloudSession(store.cloudSettings, store.cloudSession)
  } catch (_) {
    // 尽力而为
  }
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
    const applied = applyCloudDataToStore(result.payload, { sourceUpdatedAt: result.updatedAt })
    if (!applied) {
      setCloudLoadError('云端数据不完整，已拒绝应用')
      alert('云端数据不完整（缺失/损坏），已拒绝应用，本地数据保持不变')
      return
    }
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
  // 本次会话尚未成功同步过（可能是旧浏览器/长期未同步）→ 不静默盲写，留给启动冲突检测
  if (!store.cloudStatus.lastSyncAt) return

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

    // === 新增：云首选策略 ===
    // 情况1：时间戳完全一致 → 内容必然一致，跳过同步
    if (cloudTs && localTs && cloudTs === localTs) {
      setCloudLoadSuccess(result.updatedAt)
      // 更新最后自动同步时间
      store.cloudStatus.lastAutoSyncAt = Date.now()
      return true
    }

    // 情况2：本地数据比云端新
    if (cloudTs && localTs && localTs > cloudTs) {
      const localPayload = exportData()
      const contentEqual = isContentEqual(localPayload, result.payload)

      // 内容一致 → 静默对齐时间戳，不打扰用户
      if (contentEqual) {
        setLocalModifiedAt(result.updatedAt)
        saveToLocalStorage({ bumpTimestamp: false })
        setCloudLoadSuccess(result.updatedAt)
        addOperationLog('cloud_sync', '内容一致，已静默对齐时间戳', { localUpdatedAt: localAt, cloudUpdatedAt: result.updatedAt })
        store.cloudStatus.lastAutoSyncAt = Date.now()
        return true
      }

      // 内容不一致，本地较新 → 弹模态框让用户决策
      const diff = computeConflictDiff(localPayload, result.payload)
      const userChoice = await askCloudConflict('upload-local', {
        diff,
        warn: shouldWarnBeforeOverwrite(localPayload, result.payload),
        cloudUpdatedAt: result.updatedAt,
        localModifiedAt: localAt,
      })

      if (userChoice === 'upload') {
        try {
          const syncResult = await syncToCloudNow()
          addOperationLog('cloud_sync', '本地数据较新，用户确认上传覆盖云端', { updatedAt: syncResult?.updatedAt || result.updatedAt, localUpdatedAt: localAt, diffCount: diff.total })
          setCloudLoadSuccess(syncResult?.updatedAt || result.updatedAt)
          store.cloudStatus.lastAutoSyncAt = Date.now()
          return true
        } catch (err) {
          addOperationLog('cloud_sync', '本地上传云端失败', { error: err.message, localUpdatedAt: localAt })
          setCloudLoadError(err.message)
          store.cloudStatus.lastAutoSyncAt = Date.now()
          return false
        }
      } else if (userChoice === 'use-cloud') {
        const applied = applyCloudDataToStore(result.payload, { trackHistory: false, sourceUpdatedAt: result.updatedAt })
        store.cloudStatus.lastAutoSyncAt = Date.now()
        if (!applied) {
          addOperationLog('cloud_sync', '云端载荷损坏/缺失，已拒绝应用，保留本地', { localUpdatedAt: localAt, cloudUpdatedAt: result.updatedAt, diffCount: diff.total })
          setCloudLoadError('云端数据不完整，已拒绝应用')
          return false
        }
        setCloudLoadSuccess(result.updatedAt)
        addOperationLog('cloud_sync', '用户选择保留云端数据，已下载到本地', { localUpdatedAt: localAt, cloudUpdatedAt: result.updatedAt, diffCount: diff.total })
        return true
      }
      // cancel：保持本地不变
      addOperationLog('cloud_sync', '用户取消同步，保持本地数据', { localUpdatedAt: localAt, cloudUpdatedAt: result.updatedAt, diffCount: diff.total })
      store.cloudStatus.lastAutoSyncAt = Date.now()
      return false
    }

    // 情况3：云端数据比本地新（或时间戳相等但内容不同）→ 弹模态框让用户决策
    const localPayload = exportData()
    const warn = shouldWarnBeforeOverwrite(localPayload, result.payload)
    const diff = computeConflictDiff(localPayload, result.payload)

    if (diff.total > 0 || warn.shouldWarn) {
      const userChoice = await askCloudConflict('recovery', {
        diff,
        warn,
        cloudUpdatedAt: result.updatedAt,
        localModifiedAt: localAt,
      })

      if (userChoice === 'use-cloud') {
        const applied = applyCloudDataToStore(result.payload, { trackHistory: false, sourceUpdatedAt: result.updatedAt })
        store.cloudStatus.lastAutoSyncAt = Date.now()
        if (!applied) {
          addOperationLog('cloud_sync', '云端载荷损坏/缺失，已拒绝应用，保留本地', { cloudUpdatedAt: result.updatedAt, localUpdatedAt: localAt, diffCount: diff.total })
          setCloudLoadError('云端数据不完整，已拒绝应用')
          return false
        }
        setCloudLoadSuccess(result.updatedAt)
        addOperationLog('cloud_sync', '用户选择使用云端数据', { cloudUpdatedAt: result.updatedAt, localUpdatedAt: localAt, diffCount: diff.total })
        return true
      } else if (userChoice === 'upload' || userChoice === 'keep-local') {
        addOperationLog('cloud_sync', '用户选择保留本地数据', { cloudUpdatedAt: result.updatedAt, localUpdatedAt: localAt, diffCount: diff.total })
        setCloudLoadError('用户已拒绝云端数据覆盖')
        store.cloudStatus.lastAutoSyncAt = Date.now()
        return false
      }
      // cancel：保持现状
      addOperationLog('cloud_sync', '用户取消云端数据覆盖决定', { cloudUpdatedAt: result.updatedAt, localUpdatedAt: localAt, diffCount: diff.total })
      store.cloudStatus.lastAutoSyncAt = Date.now()
      return false
    }

    // 云端较新且内容一致 → 静默对齐时间戳
    setLocalModifiedAt(result.updatedAt)
    saveToLocalStorage({ bumpTimestamp: false })
    setCloudLoadSuccess(result.updatedAt)
    addOperationLog('cloud_sync', '云端数据较新且内容一致，已对齐时间戳', { cloudUpdatedAt: result.updatedAt, localUpdatedAt: localAt })
    store.cloudStatus.lastAutoSyncAt = Date.now()
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

  registerCloudSyncHandler(async (payload, options = {}) => {
    const reason = options?.reason || ''
    if (reason === 'pre-check') {
      const result = await fetchCloudState(store.cloudSettings, {
        session: store.cloudSession,
        onSession: (session) => setCloudSession(session),
        publicOnly: false,
      })
      return {
        updatedAt: result?.updatedAt,
        row: result?.row,
        payload: result?.payload,
      }
    }
    const result = await saveCloudState(store.cloudSettings, payload, {
      session: store.cloudSession,
      onSession: (session) => setCloudSession(session),
      makePublic: store.cloudSettings.publicRead,
    })
    return {
      updatedAt: result?.updatedAt,
      row: result?.row,
      payload: result?.payload,
    }
  })

  registerCloudConflictHandler(askCloudConflict)
  registerCloudApplyHandler((payload, options = {}) => applyCloudDataToStore(payload, options))

  document.addEventListener('visibilitychange', syncSilentlyOnHidden)

  // === 新增：程序启动时自动从云端加载数据 ===
  const cloudLoaded = await loadCloudOnStartup()


  // === 新增：如果启用了云同步，在后台定期检测是否需要同步 ===
  if (store.cloudSettings.enabled && isCloudConfigReady(store.cloudSettings)) {
    // 延迟第一次检测，避免页面加载过慢
    periodicTimer = setTimeout(periodicCloudCheck, CLOUD_AUTO_SYNC_INTERVAL)
  }
})

let periodicTimer = null

/**
 * 定期检测云同步状态（每30秒）
 * - 如果有未同步操作且云端可用，静默上传
 * - 如果云端数据比本地新，静默下载
 */
function periodicCloudCheck() {
  if (!store.cloudSettings.enabled) return
  if (!isCloudConfigReady(store.cloudSettings)) return
  if (store.cloudStatus.syncing) return

  // 检查是否有未同步的操作
  const unsynced = getUnsyncedOperations()
  if (unsynced.length > 0) {
    // 有未同步操作，尝试同步
    syncToCloudNow().catch(() => {
      // 静默失败，下次再试
    })
  } else if (store.cloudStatus.connected) {
    // 无未同步操作，但云端已连接 → 轻量检查云端是否有新数据
    // 仅查询 updated_at 字段，若云端比本地 lastSyncAt 新则触发 runCloudSync
    fetchCloudState(store.cloudSettings, {
      session: store.cloudSession,
      onSession: (session) => setCloudSession(session),
      publicOnly: false,
    }).then((result) => {
      const cloudTs = tsToEpoch(result?.updatedAt)
      const localSyncTs = tsToEpoch(store.cloudStatus.lastSyncAt)
      if (cloudTs && (!localSyncTs || cloudTs > localSyncTs)) {
        // 云端有新数据，触发非强制同步（会走冲突检测）
        runCloudSyncCheck().catch(() => {})
      }
    }).catch(() => {
      // 静默失败，下次再试
    })
  }

  // 继续下一次检测
  periodicTimer = setTimeout(periodicCloudCheck, CLOUD_AUTO_SYNC_INTERVAL)
}

onBeforeUnmount(() => {
  clearTimeout(periodicTimer)
  document.removeEventListener('visibilitychange', syncSilentlyOnHidden)

  // 关闭前保底上传：页面卸载时 confirm 不可靠，不做复杂冲突检测。
  // 若有未同步的本地修改，用 keepalive 静默上传保底；冲突决策推迟到下次启动 loadCloudOnStartup。
  ;(async () => {
    if (
      !store.cloudSettings.enabled ||
      !isCloudConfigReady(store.cloudSettings) ||
      store.cloudStatus.syncing
    ) return

    // 仅在有未同步操作时才尝试 keepalive 上传
    if (getUnsyncedOperations().length === 0) return
    // 本次会话尚未成功同步过 → 不静默盲写，留给下次启动冲突检测
    if (!store.cloudStatus.lastSyncAt) return

    const payload = exportData()
    try {
      await saveCloudState(store.cloudSettings, payload, {
        session: store.cloudSession,
        onSession: (session) => setCloudSession(session),
        makePublic: store.cloudSettings.publicRead,
        keepalive: true,
      })
      addOperationLog('cloud_sync', '关闭前 keepalive 上传保底成功', { localUpdatedAt: getLocalModifiedAt() })
    } catch (err) {
      // 静默失败，下次启动 loadCloudOnStartup 会检测冲突并提示用户
      addOperationLog('cloud_sync', '关闭前 keepalive 上传失败', { error: err.message })
    }
  })()
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
        {{ cloudConflictType === 'upload-local' ? '本机数据比云端新，请选择使用哪一份数据：' : (cloudConflictType === 'manual-sync' ? '本地与云端数据不一致，请选择保留哪一份：' : '云端数据比本地新或存在差异，请选择使用哪一份数据：') }}
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
      <div class="mb-4 space-y-2">
        <button
          v-if="primaryConflictActionValue === 'upload'"
          class="btn btn-primary w-full !py-4 !text-lg"
          @click="resolveCloudConflict('upload')"
        >
          <span class="flex items-center justify-center gap-2">
            <i class="fa-solid fa-arrow-up text-xl"></i>
            <span class="text-2xl font-bold">{{ cloudConflictInfo.total }}</span>
            <span>上传</span>
          </span>
          <span class="block text-xs font-normal text-blue-100">用本机数据覆盖云端</span>
        </button>
        <button
          v-else
          class="btn btn-primary w-full !py-4 !text-lg"
          @click="resolveCloudConflict('use-cloud')"
        >
          <span class="flex items-center justify-center gap-2">
            <i class="fa-solid fa-arrow-down text-xl"></i>
            <span class="text-2xl font-bold">{{ cloudConflictInfo.total }}</span>
            <span>下载</span>
          </span>
          <span class="block text-xs font-normal text-blue-100">用云端数据覆盖本地</span>
        </button>
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
            <p v-if="e.kind === 'modified' && e.summary" class="mt-0.5 text-gray-500 line-clamp-1">{{ e.summary }}</p>
            <p v-else-if="e.kind === 'modified'" class="mt-0.5 text-gray-400 text-xs">(字段差异细节被压缩)</p>
          </div>
          <div v-if="cloudConflictInfo.total > DIFF_DISPLAY_LIMIT" class="border-t border-gray-200/70 pt-1.5 text-gray-500">
            另有 {{ cloudConflictInfo.total - DIFF_DISPLAY_LIMIT }} 处差异未显示
          </div>
          <div v-if="cloudConflictInfo.total > DIFF_DISPLAY_LIMIT" class="mt-2 text-xs text-gray-500 cursor-pointer" @click="showAllDifferences = !showAllDifferences">
            <i class="fa-solid fa-eye text-gray-400 mr-1"></i> {{ showAllDifferences ? '收起全部差异' : '查看全部 ' + cloudConflictInfo.total + ' 处差异' }}
          </div>
        </div>
      </div>
      <div v-if="cloudConflictInfo.total > DIFF_DISPLAY_LIMIT && showAllDifferences" class="mt-4 p-3 bg-gray-50 rounded border border-gray-200/50 text-xs text-gray-700">
        <div class="font-medium text-gray-700 mb-2">全部 {{ cloudConflictInfo.total }} 处差异明细</div>
        <div class="space-y-1 max-h-64 overflow-y-auto">
          <div
            v-for="e in cloudConflictInfo.entries"
            :key="e.key"
            class="border-t border-gray-200/70 pt-1.5 first:border-t-0 first:pt-0"
          >
            <div class="flex items-center gap-2">
              <span class="min-w-0 truncate font-medium text-gray-700">{{ e.collectionLabel }}·{{ e.recordLabel }}</span>
              <span class="shrink-0 rounded bg-white/70 px-1.5 py-0.5 text-gray-500">{{ kindText(e.kind) }}</span>
            </div>
            <p v-if="e.kind === 'modified' && e.summary" class="mt-0.5 text-gray-500 line-clamp-1">{{ e.summary }}</p>
            <p v-else-if="e.kind === 'modified'" class="mt-0.5 text-gray-400 text-xs">(字段差异细节被压缩)</p>
            <p v-if="e.kind === 'localOnly'" class="mt-0.5 text-gray-500 text-blue-600">仅本地存在</p>
            <p v-if="e.kind === 'cloudOnly'" class="mt-0.5 text-gray-500 text-green-600">仅云端存在</p>
          </div>
        </div>
      </div>
      <div class="space-y-2">
        <button
          v-if="primaryConflictActionValue !== 'upload'"
          class="btn btn-outline w-full"
          @click="resolveCloudConflict('upload')"
        >用本机数据覆盖云端</button>
        <button
          v-else
          class="btn btn-outline w-full"
          @click="resolveCloudConflict('use-cloud')"
        >用云端数据覆盖本地</button>
        <button class="btn btn-outline w-full" @click="resolveCloudConflict('cancel')">取消</button>
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
        <h3 class="text-xl font-bold">操作日志 <span class="text-sm font-normal text-gray-500">(最近100条)</span></h3>
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
          class="rounded-lg transition-colors"
          :class="[hasLogDetail(log) ? 'cursor-pointer' : 'cursor-default', expandedLogId === log.id ? 'bg-blue-50 ring-1 ring-blue-200' : 'bg-gray-50 hover:bg-gray-100']"
          @click="hasLogDetail(log) && toggleExpand(log)"
        >
          <div class="p-3 flex justify-between items-start">
            <div class="flex items-start gap-2 min-w-0">
              <span class="inline-block px-2 py-0.5 rounded text-xs font-medium shrink-0" :class="getLogMeta(log.type).pillClass">
                {{ getLogMeta(log.type).label }}
              </span>
              <div class="min-w-0">
                <div class="text-sm text-gray-800 break-words">{{ getLogBrief(log) }}</div>
                <div class="mt-0.5 text-[11px] text-gray-400">{{ getLogModule(log.type) }}</div>
              </div>
            </div>
            <div class="text-right whitespace-nowrap ml-2 shrink-0">
              <div class="text-xs text-gray-400">{{ new Date(log.time).toLocaleString() }}</div>
              <div v-if="hasLogDetail(log)" class="mt-0.5 text-[11px] text-blue-500">
                <i :class="expandedLogId === log.id ? 'fa-solid fa-chevron-up' : 'fa-solid fa-chevron-down'" class="mr-1" />{{ expandedLogId === log.id ? '收起' : '详情' }}
              </div>
            </div>
          </div>

          <div v-if="expandedLogId === log.id" class="px-3 pb-3 space-y-3 text-xs">
            <div
              v-for="(section, si) in getLogDetailSections(log)"
              :key="si"
            >
              <!-- 原始数据：默认折叠 -->
              <div v-if="section.kind === 'raw'" class="border-t border-gray-100 pt-2">
                <button class="w-full text-left text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1" @click.stop="toggleRaw(log)">
                  <i :class="rawExpanded === log.id ? 'fa-solid fa-chevron-down' : 'fa-solid fa-chevron-right'" />
                  {{ section.title }}
                </button>
                <pre v-if="rawExpanded === log.id" class="mt-1 bg-gray-50 rounded p-2 text-[11px] text-gray-500 whitespace-pre-wrap break-all">{{ section.json }}</pre>
              </div>
              <!-- 结构化区块 -->
              <div v-else>
                <div v-if="section.kind !== 'changes'" class="text-xs font-medium text-gray-500 mb-1">{{ section.title }}</div>
                <div v-if="section.kind === 'changes'" class="border border-gray-200 rounded-lg overflow-hidden">
                  <div class="bg-indigo-50 text-indigo-700 px-3 py-1.5 text-xs font-medium border-b border-indigo-100">修改明细</div>
                  <div
                    v-for="(row, ri) in section.rows"
                    :key="ri"
                    class="grid grid-cols-[110px_1fr_1fr] border-b border-gray-100 last:border-b-0"
                  >
                    <div class="bg-gray-50 px-3 py-2 text-gray-700">{{ row.field }}</div>
                    <div class="px-3 py-2 text-gray-500">{{ row.before }}</div>
                    <div class="px-3 py-2 text-gray-900">{{ row.after }}</div>
                  </div>
                </div>
                <div v-else-if="section.kind === 'items'" class="border border-gray-200 rounded-lg overflow-hidden">
                  <div class="overflow-x-auto">
                    <table class="w-full text-xs">
                      <thead>
                        <tr class="bg-gray-50 text-gray-500">
                          <th v-for="(col, ci) in section.columns" :key="ci" class="px-3 py-1.5 text-left font-medium">{{ col }}</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr v-for="(row, ri) in section.rows" :key="ri" class="border-b border-gray-100 last:border-b-0">
                          <td v-for="(cell, ci) in row" :key="ci" class="px-3 py-1.5">{{ cell }}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
                <div v-else-if="section.kind === 'names'" class="border border-gray-200 rounded-lg">
                  <div class="px-3 py-2 text-xs text-gray-600">
                    <span v-for="(n, ni) in section.names" :key="ni">
                      <span v-if="ni > 0" class="text-gray-300">、</span>{{ n }}
                    </span>
                  </div>
                </div>
                <div v-else-if="section.kind === 'kv'" class="border border-gray-200 rounded-lg overflow-hidden">
                  <div
                    v-for="(entry, ei) in section.entries"
                    :key="ei"
                    class="grid grid-cols-[110px_1fr] border-b border-gray-100 last:border-b-0"
                  >
                    <div class="bg-gray-50 px-3 py-2 text-gray-600">{{ entry.key }}</div>
                    <div class="px-3 py-2 text-gray-800 whitespace-pre-wrap break-all">{{ entry.value }}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </GlassModal>
    <Transition name="fade">
      <div
        v-if="backupNoticeVisible"
        class="fixed left-1/2 top-16 z-50 flex -translate-x-1/2 items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-800 shadow-lg"
      >
        <span>今日备份已生成：饮食派数据_{{ todayStr() }}.json</span>
        <button class="font-semibold underline" @click="downloadBackupManually">若未自动下载，点此下载</button>
        <button class="ml-1 text-emerald-500 hover:text-emerald-700" @click="dismissBackupNotice">✕</button>
      </div>
    </Transition>
  </div>
</template>
