<script setup>
import { onMounted, onUnmounted, ref } from 'vue'
import AppSidebar from './components/AppSidebar.vue'
import RushCarPrototypeModule from './modules/rushcar/RushCarPrototypeModule.vue'

const tabs = [
  { id: 'home', name: '数据透视', disabled: true },
  { id: 'inventory', name: '库存管理', disabled: true },
  { id: 'sales', name: '销售记账', disabled: true },
  { id: 'purchase', name: '采购管理', disabled: true },
  { id: 'finance', name: '公共收支', disabled: true },
  { id: 'payton', name: "Payton's基金", disabled: true },
  { id: 'rushcar', name: '美淘记录' },
]

const currentTab = ref('rushcar')
const sourceData = ref({})

const banner = ref({
  type: 'loading',
  text: '正在加载原型测试数据...',
})

let refreshTimer = null

async function loadSeedData() {
  const base = (import.meta.env.BASE_URL || '/').replace(/\/$/, '')
  const candidates = [`${base}/a.json`, './a.json', '/a.json']

  for (const url of candidates) {
    try {
      const res = await fetch(url + '?t=' + Date.now(), { cache: 'no-store' })
      if (!res.ok) continue
      const json = await res.json()
      sourceData.value = {
        ...json,
        sourceLoadedFrom: url,
      }
      banner.value = {
        type: 'success',
        text: '测试数据加载成功：' + url,
      }
      return
    } catch {
      // continue to next candidate
    }
  }

  banner.value = {
    type: 'error',
    text: '未读取到 a.json，页面仍可预览结构。请确保 public/a.json 存在。',
  }
}

onMounted(() => {
  loadSeedData()
  refreshTimer = setInterval(() => {
    loadSeedData()
  }, 60000)
})

onUnmounted(() => {
  if (refreshTimer) clearInterval(refreshTimer)
})
</script>

<template>
  <div class="flex h-screen overflow-hidden bg-appbg text-gray-800" v-cloak>
    <AppSidebar
      :tabs="tabs"
      :current-tab="currentTab"
      version="3.0.1-prototype"
      @select="currentTab = $event"
      @import="() => {}"
      @export="() => {}"
      @cloud="() => {}"
      @logs="() => {}"
    />

    <main class="flex-1 overflow-y-auto p-8">
      <div class="mx-auto max-w-7xl space-y-5 pb-8">
        <div
          class="rounded-xl px-4 py-3 text-sm"
          :class="
            banner.type === 'success'
              ? 'bg-green-50 text-green-700 border border-green-100'
              : banner.type === 'error'
                ? 'bg-red-50 text-red-700 border border-red-100'
                : 'bg-blue-50 text-blue-700 border border-blue-100'
          "
        >
          {{ banner.text }}
        </div>

        <RushCarPrototypeModule v-if="currentTab === 'rushcar'" :source-data="sourceData" />
      </div>
    </main>
  </div>
</template>
