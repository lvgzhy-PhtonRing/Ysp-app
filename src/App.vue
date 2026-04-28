<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import AppSidebar from './components/AppSidebar.vue'
import GlassModal from './components/GlassModal.vue'
import HomeModule from './modules/home/HomeModule.vue'
import InventoryModule from './modules/inventory/InventoryModule.vue'
import InventoryAgingModule from './modules/inventory/InventoryAgingModule.vue'
import PurchaseModule from './modules/purchase/PurchaseModule.vue'
import SalesModule from './modules/sales/SalesModule.vue'
import FinanceModule from './modules/finance/FinanceModule.vue'
import PaytonModule from './modules/payton/PaytonModule.vue'
import RushCarPrototypeModule from './modules/rushcar/RushCarPrototypeModule.vue'
import {
  addOperationLog,
  clearCloudSession,
  clearOperationLogs,
  exportData,
  loadData,
  loadFromLocalStorage,
  loadUiStateFromLocalStorage,
  registerCloudSyncHandler,
  saveToLocalStorage,
  setCloudLoadError,
  setCloudLoadSuccess,
  setCloudSession,
  setCloudSettings,
  setHistorySuppressed,
  setCloudSyncSuppressed,
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

const tabs = [
  { id: 'home', name: '数据透视' },
  { id: 'inventory', name: '库存管理' },
  { id: 'sales', name: '销售记账' },
  { id: 'purchase', name: '采购管理' },
  { id: 'finance', name: '公共收支' },
  { id: 'rushcar', name: '美淘记录' },
  { id: 'payton', name: "Payton's基金" },
]

const currentTab = ref('home')
const fileInputRef = ref(null)
const showLogsModal = ref(false)
const showLogDetailModal = ref(false)
const selectedLog = ref(null)
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
  purchase_add: { label: '采购新增', color: 'text-yellow-600', icon: 'fa-solid fa-plus', pillClass: 'bg-yellow-100 text-yellow-700' },
  purchase_transfer: { label: '采购转运', color: 'text-amber-600', icon: 'fa-solid fa-truck', pillClass: 'bg-amber-100 text-amber-700' },
  purchase_transfer_delete: { label: '采购转运', color: 'text-amber-600', icon: 'fa-solid fa-truck-ramp-box', pillClass: 'bg-amber-100 text-amber-700' },
  purchase_edit: { label: '采购编辑', color: 'text-blue-600', icon: 'fa-solid fa-pen', pillClass: 'bg-blue-100 text-blue-700' },
  purchase_delete: { label: '采购删除', color: 'text-red-600', icon: 'fa-solid fa-trash', pillClass: 'bg-red-100 text-red-700' },
  purchase_to_inventory: { label: '采购入库', color: 'text-green-600', icon: 'fa-solid fa-box', pillClass: 'bg-green-100 text-green-700' },
  purchase_batch_to_inventory: { label: '采购入库', color: 'text-green-600', icon: 'fa-solid fa-boxes-stacked', pillClass: 'bg-green-100 text-green-700' },
  purchase_group_edit: { label: '购买组编辑', color: 'text-blue-600', icon: 'fa-solid fa-diagram-project', pillClass: 'bg-blue-100 text-blue-700' },
  inventory_manual_add: { label: '库存新增', color: 'text-blue-600', icon: 'fa-solid fa-bolt', pillClass: 'bg-blue-100 text-blue-700' },
  inventory_edit: { label: '库存编辑', color: 'text-blue-600', icon: 'fa-solid fa-pen', pillClass: 'bg-blue-100 text-blue-700' },
  inventory_unlist: { label: '库存下架', color: 'text-amber-600', icon: 'fa-solid fa-arrow-down', pillClass: 'bg-amber-100 text-amber-700' },
  inventory_delete: { label: '库存删除', color: 'text-red-600', icon: 'fa-solid fa-trash', pillClass: 'bg-red-100 text-red-700' },
  inventory_long_term: { label: '库存长线', color: 'text-purple-600', icon: 'fa-solid fa-infinity', pillClass: 'bg-purple-100 text-purple-700' },
  inventory_sales_sync: { label: '库存销售同步', color: 'text-green-600', icon: 'fa-solid fa-arrows-rotate', pillClass: 'bg-green-100 text-green-700' },
  sales_submit: { label: '销售新增', color: 'text-green-600', icon: 'fa-solid fa-cash-register', pillClass: 'bg-green-100 text-green-700' },
  sales_edit: { label: '销售编辑', color: 'text-blue-600', icon: 'fa-solid fa-pen', pillClass: 'bg-blue-100 text-blue-700' },
  sales_rollback: { label: '销售回滚', color: 'text-red-600', icon: 'fa-solid fa-rotate-left', pillClass: 'bg-red-100 text-red-700' },
  finance_add_record: { label: '收支新增', color: 'text-indigo-600', icon: 'fa-solid fa-receipt', pillClass: 'bg-indigo-100 text-indigo-700' },
  finance_delete_record: { label: '收支删除', color: 'text-red-600', icon: 'fa-solid fa-trash', pillClass: 'bg-red-100 text-red-700' },
  finance_add_loan: { label: '借贷新增', color: 'text-yellow-600', icon: 'fa-solid fa-hand-holding-dollar', pillClass: 'bg-yellow-100 text-yellow-700' },
  finance_update_record: { label: '收支编辑', color: 'text-blue-600', icon: 'fa-solid fa-pen', pillClass: 'bg-blue-100 text-blue-700' },
  finance_update_loan: { label: '借贷编辑', color: 'text-blue-600', icon: 'fa-solid fa-pen', pillClass: 'bg-blue-100 text-blue-700' },
  finance_repaid: { label: '借贷归还', color: 'text-gray-600', icon: 'fa-solid fa-check', pillClass: 'bg-gray-100 text-gray-700' },
  finance_delete_loan: { label: '借贷删除', color: 'text-red-600', icon: 'fa-solid fa-trash', pillClass: 'bg-red-100 text-red-700' },
  payton: { label: "Payton's", color: 'text-teal-600', icon: 'fa-solid fa-wallet', pillClass: 'bg-teal-100 text-teal-700' },
  payton_add_record: { label: "Payton's新增", color: 'text-teal-600', icon: 'fa-solid fa-wallet', pillClass: 'bg-teal-100 text-teal-700' },
  payton_edit_record: { label: "Payton's编辑", color: 'text-blue-600', icon: 'fa-solid fa-pen', pillClass: 'bg-blue-100 text-blue-700' },
  payton_delete_record: { label: "Payton's删除", color: 'text-red-600', icon: 'fa-solid fa-trash', pillClass: 'bg-red-100 text-red-700' },
  payton_add_car: { label: "Payton's新增小车", color: 'text-green-600', icon: 'fa-solid fa-car', pillClass: 'bg-green-100 text-green-700' },
  payton_buy_car: { label: "Payton's买车", color: 'text-green-600', icon: 'fa-solid fa-car-side', pillClass: 'bg-green-100 text-green-700' },
  payton_sell_car: { label: "Payton's卖车", color: 'text-purple-600', icon: 'fa-solid fa-coins', pillClass: 'bg-purple-100 text-purple-700' },
  payton_move_keep: { label: "Payton's转自留", color: 'text-indigo-600', icon: 'fa-solid fa-box-archive', pillClass: 'bg-indigo-100 text-indigo-700' },
  payton_move_sell: { label: "Payton's移出售", color: 'text-orange-600', icon: 'fa-solid fa-arrow-right-arrow-left', pillClass: 'bg-orange-100 text-orange-700' },
  purchase_transfer_edit: { label: '采购转运编辑', color: 'text-blue-600', icon: 'fa-solid fa-pen-to-square', pillClass: 'bg-blue-100 text-blue-700' },
  sales_unlist: { label: '销售下架', color: 'text-amber-600', icon: 'fa-solid fa-arrow-down', pillClass: 'bg-amber-100 text-amber-700' },
  home_calc: { label: '计算器', color: 'text-blue-600', icon: 'fa-solid fa-calculator', pillClass: 'bg-blue-100 text-blue-700' },
}

function getLogMeta(type) {
  return (
    logTypeMeta[type] || {
      label: formatLogKey(type),
      color: 'text-gray-500',
      icon: 'fa-solid fa-circle-info',
      pillClass: 'bg-gray-100 text-gray-700',
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
}

function formatLogDetailValue(value) {
  if (value === null || value === undefined || value === '') return '-'
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value, null, 2)
    } catch (_) {
      return String(value)
    }
  }
  return String(value)
}

function getLogDetailEntries(detail) {
  if (!detail || typeof detail !== 'object') return []
  return Object.entries(detail).filter(([key]) => key !== 'changes')
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
    payton: "Payton's",
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
    saveToLocalStorage()
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
    applyCloudDataToStore(result.payload)
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
    applyCloudDataToStore(result.payload, { trackHistory: false })
    setCloudLoadSuccess(result.updatedAt)
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
      @select="currentTab = $event"
      @import="triggerImport"
      @export="handleExport"
      @cloud="openCloudSettings"
      @logs="showLogsModal = true"
    />

    <main :class="['flex-1 overflow-y-auto p-8', currentTab === 'inventory-aging' ? 'bg-sky-50/60' : '']">
      <div class="mx-auto max-w-7xl space-y-6 pb-8">
        <HomeModule v-if="currentTab === 'home'" />
        <InventoryModule v-else-if="currentTab === 'inventory'" @open-aging="currentTab = 'inventory-aging'" />
        <InventoryAgingModule v-else-if="currentTab === 'inventory-aging'" @back="currentTab = 'inventory'" />
        <SalesModule v-else-if="currentTab === 'sales'" />
        <PurchaseModule v-else-if="currentTab === 'purchase'" />
        <FinanceModule v-else-if="currentTab === 'finance'" />
        <RushCarPrototypeModule v-else-if="currentTab === 'rushcar'" :source-data="store" />
        <PaytonModule v-else-if="currentTab === 'payton'" />

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
          class="p-3 rounded-lg bg-gray-50 hover:bg-gray-100 cursor-pointer"
          @click="openLogDetail(log)"
        >
          <div class="flex justify-between items-start">
            <div class="flex items-start gap-2">
              <span class="inline-block px-2 py-0.5 rounded text-xs font-medium shrink-0" :class="getLogMeta(log.type).pillClass">
                {{ getLogMeta(log.type).label }}
              </span>
              <div>
                <span class="text-sm text-gray-800">{{ log.message }}</span>
                <div v-if="log.detail && Object.keys(log.detail).length > 0" class="mt-1 text-xs text-gray-400">
                  <span v-if="log.detail.qty">数量: {{ log.detail.qty }}</span>
                  <span v-if="log.detail.price" class="ml-2">单价: {{ log.detail.price }}</span>
                  <span v-if="log.detail.cost" class="ml-2">成本: {{ log.detail.cost }}</span>
                  <span v-if="log.detail.profit" class="ml-2">利润: {{ log.detail.profit }}</span>
                  <span v-if="log.detail.sid" class="ml-2">SID: {{ log.detail.sid }}</span>
                  <span v-if="log.detail.amount" class="ml-2">金额: {{ log.detail.amount }}</span>
                  <span v-if="log.detail.account" class="ml-2">账户: {{ log.detail.account }}</span>
                  <span v-if="log.detail.changedFields?.length" class="ml-2 text-indigo-500">修改字段: {{ log.detail.changedFields.length }}</span>
                </div>
                <div class="mt-1 text-[11px] text-blue-500">点击查看详情</div>
              </div>
            </div>
            <span class="text-xs text-gray-400 whitespace-nowrap ml-2">{{ new Date(log.time).toLocaleString() }}</span>
          </div>
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
        <div>
          <div class="text-xs text-gray-500 mb-2">原始明细 JSON</div>
          <pre class="bg-gray-50 border border-gray-200 rounded-lg p-3 text-xs text-gray-700 whitespace-pre-wrap break-all max-h-56 overflow-auto m-0">{{ getLogRawJson(selectedLog?.detail) }}</pre>
        </div>
      </div>
      <div class="px-5 py-4 border-t border-gray-100 flex justify-end">
        <button class="btn btn-outline" @click="showLogDetailModal = false">关闭</button>
      </div>
    </GlassModal>
  </div>
</template>
