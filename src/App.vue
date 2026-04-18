<script setup>
import { computed, onMounted, ref } from 'vue'
import AppSidebar from './components/AppSidebar.vue'
import GlassModal from './components/GlassModal.vue'
import HomeModule from './modules/home/HomeModule.vue'
import InventoryModule from './modules/inventory/InventoryModule.vue'
import InventoryAgingModule from './modules/inventory/InventoryAgingModule.vue'
import PurchaseModule from './modules/purchase/PurchaseModule.vue'
import SalesModule from './modules/sales/SalesModule.vue'
import FinanceModule from './modules/finance/FinanceModule.vue'
import PaytonModule from './modules/payton/PaytonModule.vue'
import {
  addOperationLog,
  clearOperationLogs,
  exportData,
  loadData,
  loadFromLocalStorage,
  loadUiStateFromLocalStorage,
  saveToLocalStorage,
  saveUiStateToLocalStorage,
  state as store,
} from './data/store'

const tabs = [
  { id: 'home', name: '数据透视' },
  { id: 'inventory', name: '库存管理' },
  { id: 'sales', name: '销售记账' },
  { id: 'purchase', name: '采购管理' },
  { id: 'finance', name: '公共收支' },
  { id: 'payton', name: "Payton's基金" },
]

const currentTab = ref('home')
const fileInputRef = ref(null)
const showWebdavSettings = ref(false)
const showLogsModal = ref(false)
const showLogDetailModal = ref(false)
const selectedLog = ref(null)
const logTypeMeta = {
  app_import: { label: '系统导入', color: 'text-teal-600', icon: 'fa-solid fa-upload', pillClass: 'bg-teal-100 text-teal-700' },
  app_export: { label: '系统导出', color: 'text-blue-600', icon: 'fa-solid fa-download', pillClass: 'bg-blue-100 text-blue-700' },
  webdav_settings: { label: 'WebDAV', color: 'text-indigo-600', icon: 'fa-solid fa-cloud', pillClass: 'bg-indigo-100 text-indigo-700' },
  webdav_upload: { label: 'WebDAV', color: 'text-indigo-600', icon: 'fa-solid fa-cloud-arrow-up', pillClass: 'bg-indigo-100 text-indigo-700' },
  webdav_download: { label: 'WebDAV', color: 'text-indigo-600', icon: 'fa-solid fa-cloud-arrow-down', pillClass: 'bg-indigo-100 text-indigo-700' },
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
    webdav: 'WebDAV',
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

const webdavForm = ref({
  url: '',
  username: '',
  password: '',
  enabled: false,
})

function getToday() {
  return new Date().toISOString().slice(0, 10)
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

function openWebdavSettings() {
  webdavForm.value = {
    url: store.webdavSettings.url || '',
    username: store.webdavSettings.username || '',
    password: store.webdavSettings.password || '',
    enabled: !!store.webdavSettings.enabled,
  }
  showWebdavSettings.value = true
}

function saveWebdavSettings() {
  Object.assign(store.webdavSettings, webdavForm.value)
  saveUiStateToLocalStorage()
  addOperationLog('webdav_settings', '更新WebDAV配置', {
    url: webdavForm.value.url,
    enabled: webdavForm.value.enabled,
  })
  showWebdavSettings.value = false
}

async function uploadToWebdav() {
  if (!webdavForm.value.url) {
    alert('请先配置WebDAV地址')
    return
  }
  try {
    const data = exportData()
    const filename = `饮食派数据_${getToday()}.json`
    const target = `${webdavForm.value.url}/${filename}`
    const auth = btoa(`${webdavForm.value.username || ''}:${webdavForm.value.password || ''}`)
    const res = await fetch(target, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${auth}`,
      },
      body: JSON.stringify(data),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    addOperationLog('webdav_upload', 'WebDAV上传成功', { file: filename })
    alert('数据上传成功')
  } catch (err) {
    alert(`上传失败: ${err.message}`)
  }
}

async function downloadFromWebdav() {
  if (!webdavForm.value.url) {
    alert('请先配置WebDAV地址')
    return
  }
  try {
    const filename = `饮食派数据_${getToday()}.json`
    const target = `${webdavForm.value.url}/${filename}`
    const auth = btoa(`${webdavForm.value.username || ''}:${webdavForm.value.password || ''}`)
    const res = await fetch(target, {
      method: 'GET',
      headers: {
        Authorization: `Basic ${auth}`,
      },
    })
    if (!res.ok) throw new Error('文件不存在')
    const data = await res.json()
    if (!confirm('确定要下载并覆盖当前数据吗？')) return
    loadData(data)
    saveToLocalStorage()
    addOperationLog('webdav_download', 'WebDAV下载成功', { file: filename })
    alert('数据下载成功')
  } catch (err) {
    alert(`下载失败: ${err.message}`)
  }
}

onMounted(async () => {
  loadFromLocalStorage()
  loadUiStateFromLocalStorage()
  if (store.items.length === 0) {
    try {
      const basePath = import.meta.env.BASE_URL || '/'
      const res = await fetch(`${basePath}a.json`)
      if (res.ok) {
        const json = await res.json()
        loadData(json)
      }
    } catch (_) {
      // ignore
    }
  }
})
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
      @webdav="openWebdavSettings"
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
        <PaytonModule v-else-if="currentTab === 'payton'" />

        <div
          v-else
          class="apple-card p-8 text-sm text-gray-500"
        >
          {{ tabs.find((t) => t.id === currentTab)?.name }} 模块 UI 开发中…
        </div>
      </div>
    </main>

    <GlassModal v-model="showWebdavSettings" panel-class="w-full max-w-md p-6 relative" :close-on-overlay="true">
      <div class="mb-6 text-xl font-bold">WebDAV同步设置</div>
      <div class="space-y-4">
        <div>
          <label class="block text-sm mb-1 text-gray-600">WebDAV地址</label>
          <input v-model="webdavForm.url" class="apple-input" placeholder="https://dav.jianguoyun.com/dav/" />
        </div>
        <div>
          <label class="block text-sm mb-1 text-gray-600">用户名</label>
          <input v-model="webdavForm.username" class="apple-input" placeholder="WebDAV用户名" />
        </div>
        <div>
          <label class="block text-sm mb-1 text-gray-600">密码</label>
          <input v-model="webdavForm.password" class="apple-input" type="password" placeholder="应用密码" />
        </div>
      </div>
      <div class="mt-8 flex justify-end gap-3">
        <button class="btn btn-outline" @click="showWebdavSettings = false">取消</button>
        <button class="btn btn-primary" @click="saveWebdavSettings">保存设置</button>
      </div>
      <div class="mt-3 flex gap-3">
        <button class="btn btn-outline flex-1" :disabled="!webdavForm.url" @click="uploadToWebdav">上传数据</button>
        <button class="btn btn-outline flex-1" :disabled="!webdavForm.url" @click="downloadFromWebdav">下载数据</button>
      </div>
    </GlassModal>

    <GlassModal v-model="showLogsModal" panel-class="w-full max-w-2xl relative max-h-[80vh] flex flex-col p-0" :close-on-overlay="true">
      <div class="px-4 py-4 border-b border-gray-100 flex items-center justify-between">
        <h3 class="text-xl font-bold">操作日志 <span class="text-sm font-normal text-gray-500">(近7天)</span></h3>
        <button class="btn btn-outline btn-sm" @click="clearOperationLogs">清空日志</button>
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
