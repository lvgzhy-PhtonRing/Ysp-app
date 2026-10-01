<script setup>
const props = defineProps({
  tabs: {
    type: Array,
    default: () => [],
  },
  currentTab: {
    type: String,
    required: true,
  },
  version: {
    type: String,
    default: '',
  },
  cloudUnhealthy: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['select', 'import', 'export', 'cloud', 'logs'])

// 分组配置
const tabGroups = [
  { name: '数据', tabs: ['home'] },
  { name: '库存', tabs: ['inventory', 'aging', 'market-price'] },
  { name: '销售', tabs: ['sales', 'sales-analysis'] },
  { name: '采购', tabs: ['purchase', 'rushcar'] },
  { name: '公共收支', tabs: ['finance'] },
]

const iconMap = {
  home: 'fa-solid fa-chart-pie',
  inventory: 'fa-solid fa-boxes-stacked',
  aging: 'fa-solid fa-hourglass-half',
  'market-price': 'fa-solid fa-chart-line',
  sales: 'fa-solid fa-cash-register',
  'sales-analysis': 'fa-solid fa-chart-column',
  purchase: 'fa-solid fa-truck',
  rushcar: 'fa-solid fa-car-side',
  finance: 'fa-solid fa-wallet',
}

function isTabDisabled(tab) {
  return Boolean(tab?.disabled)
}

function getTabStyle(tab, currentTab) {
  if (isTabDisabled(tab)) {
    return 'color:#9ca3af;background:#f8fafc;cursor:not-allowed;'
  }
  if (currentTab === tab.id) return 'background:#eff6ff;color:#0066cc;'
  return 'color:#4b5563;'
}

function handleSelect(tab) {
  if (isTabDisabled(tab)) return
  emit('select', tab.id)
}

function getGroupTabs(group) {
  return props.tabs.filter(t => group.tabs.includes(t.id))
}
</script>

<template>
  <aside class="z-10 flex h-screen w-64 shrink-0 flex-col border-r border-gray-200 bg-white relative">
    <div class="flex-1">
      <div class="h-24 border-b border-gray-100 px-6 py-5">
        <div class="font-bold text-xl tracking-wide text-gray-800">PhtonRing在哪儿</div>
        <div class="mt-1 text-xs text-gray-400">v{{ version }}</div>
      </div>

      <nav class="space-y-4 p-4">
        <div v-for="(group, idx) in tabGroups" :key="group.name" class="mb-6">
          <div class="flex gap-3">
            <!-- 分组色块 -->
            <div class="w-1 self-stretch bg-gray-200 rounded-full"></div>
            <!-- 组内 tabs -->
            <div class="flex-1 space-y-1">
              <button
                v-for="tab in getGroupTabs(group)"
                :key="tab.id"
                class="w-full text-left px-4 py-3 rounded-xl transition-all text-base font-bold flex items-center gap-3"
                :style="getTabStyle(tab, currentTab)"
                :disabled="isTabDisabled(tab)"
                @click="handleSelect(tab)"
              >
                <i :class="(iconMap[tab.id] || 'fa-solid fa-circle') + ' w-5 text-center'" />
                {{ tab.name }}
              </button>
            </div>
          </div>
        </div>
      </nav>
    </div>

    <div class="border-t border-gray-100 p-4 space-y-2">
      <button
        class="w-full text-left px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 rounded-lg"
        @click="emit('export')"
      >
        <i class="fa-solid fa-download mr-2" />导出备份
      </button>
      <button
        class="w-full text-left px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 rounded-lg cursor-pointer"
        @click="emit('import')"
      >
        <i class="fa-solid fa-upload mr-2" />导入数据
      </button>
      <button
        class="w-full text-left px-4 py-2 text-sm text-gray-500 hover:bg-gray-50 rounded-lg flex items-center gap-2"
        @click="emit('cloud')"
      >
        <i class="fa-solid fa-database" />
        <span class="flex-1">云端同步</span>
        <i v-if="cloudUnhealthy" class="fa-solid fa-circle text-amber-400 text-[8px] animate-pulse" title="云端未连接" />
      </button>
      <button
        class="w-full text-left px-4 py-2 text-sm text-gray-500 hover:bg-gray-50 rounded-lg"
        @click="emit('logs')"
      >
        <i class="fa-solid fa-clock-rotate-left mr-2" />操作日志
      </button>
    </div>
  </aside>
</template>
