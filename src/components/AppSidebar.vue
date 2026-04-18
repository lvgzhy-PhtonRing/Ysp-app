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
})

const emit = defineEmits(['select', 'import', 'export', 'webdav', 'cloud', 'logs'])

const iconMap = {
  home: 'fa-solid fa-chart-pie',
  inventory: 'fa-solid fa-boxes-stacked',
  sales: 'fa-solid fa-cash-register',
  purchase: 'fa-solid fa-truck',
  finance: 'fa-solid fa-wallet',
}
</script>

<template>
  <aside class="z-10 flex h-screen w-64 shrink-0 flex-col border-r border-gray-200 bg-white relative">
    <div class="flex-1">
      <div class="h-24 border-b border-gray-100 px-6 py-5">
        <div class="font-bold text-xl tracking-wide text-gray-800">PhtonRing在哪儿</div>
        <div class="mt-1 text-xs text-gray-400">v{{ version }}</div>
      </div>

      <nav class="space-y-2 p-4">
        <button
          v-for="tab in tabs"
          :key="tab.id"
          class="w-full text-left px-4 py-3 rounded-xl transition-all text-base font-bold flex items-center gap-3"
          :style="
            currentTab === tab.id
              ? tab.id === 'payton'
                ? 'background:#dbeafe;color:#1d4ed8;'
                : 'background:#eff6ff;color:#0066cc;'
              : tab.id === 'payton'
              ? 'color:#2563eb;'
              : 'color:#4b5563;'
          "
          @click="emit('select', tab.id)"
        >
          <i v-if="tab.id !== 'payton'" :class="(iconMap[tab.id] || 'fa-solid fa-circle') + ' w-5 text-center'" />
          {{ tab.name }}
        </button>
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
        class="w-full text-left px-4 py-2 text-sm text-gray-500 hover:bg-gray-50 rounded-lg"
        @click="emit('webdav')"
      >
        <i class="fa-solid fa-cloud mr-2" />WebDAV
      </button>
      <button
        class="w-full text-left px-4 py-2 text-sm text-gray-500 hover:bg-gray-50 rounded-lg"
        @click="emit('cloud')"
      >
        <i class="fa-solid fa-database mr-2" />云端同步
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
