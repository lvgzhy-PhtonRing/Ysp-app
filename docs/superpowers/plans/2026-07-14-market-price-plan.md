# 市场价格模块 — 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新建"市场价格"板块，为长线货品添加带时间戳的市场价格历史记录，支持联动、统计和涨跌幅排行。

**Architecture:** 在 `store.items` 每个 item 上追加 `marketPrices: [{price, timestamp}]` 数组，新增独立模块 `src/modules/market-price/` 包含 Vue 组件和业务逻辑 composable，通过侧边栏第 7 板块入口访问。

**Tech Stack:** Vue 3 (Composition API, `<script setup>`), Tailwind CSS, FontAwesome, localStorage 持久化

**Spec:** `docs/superpowers/specs/2026-07-14-market-price-design.md`

---

## 文件结构

### 新建文件

| 文件 | 职责 |
|------|------|
| `src/modules/market-price/index.js` | 模块入口标记 |
| `src/modules/market-price/MarketPriceModule.vue` | 主页面组件 — 布局、表格、弹窗、排行 |
| `src/modules/market-price/useMarketPrice.js` | 业务逻辑 — 过滤、统计、分组、更新、联动 |
| `src/modules/market-price/useMarketPrice.test.js` | 单元测试 |

### 修改文件

| 文件 | 修改内容 |
|------|---------|
| `src/App.vue` | tabs 追加第 7 项、import MarketPriceModule、模板追加 v-else-if、logTypeMeta 追加 market_price_update |
| `src/components/AppSidebar.vue` | iconMap 追加 `'market-price': 'fa-solid fa-chart-line'` |
| `src/data/store.js` | FIELD_LABEL_MAP 追加 `marketPrices: '市场价格'` |

---

### Task 1：创建模块骨架 + 数据层 useMarketPrice.js

**Files:**
- Create: `src/modules/market-price/index.js`
- Create: `src/modules/market-price/useMarketPrice.js`

- [ ] **Step 1: 创建 index.js 入口标记**

```js
// market-price 模块入口：长线货品市场价格管理与分析
```

- [ ] **Step 2: 编写 useMarketPrice.js — 工具函数**

```js
// 市场价格模块逻辑层（无 UI）
import { addOperationLog, saveToLocalStorage, state as store } from '../../data/store'

const MAX_PRICE_HISTORY = 100

/**
 * 获取当前市价（最新一条）
 */
export function getCurrentPrice(item) {
  if (!item?.marketPrices || !Array.isArray(item.marketPrices) || item.marketPrices.length === 0) return null
  return item.marketPrices[0].price
}

/**
 * 获取涨跌幅 (当前市价 - 成本) / 成本
 */
export function getChangeRate(item) {
  const price = getCurrentPrice(item)
  const cost = Number(item?.cost || 0)
  if (price === null || cost === 0) return null
  return (price - cost) / cost
}

/**
 * 判断是否已标价
 */
export function isPriced(item) {
  return Array.isArray(item?.marketPrices) && item.marketPrices.length > 0
}

/**
 * 获取所有应参与市场价格计算的长线货品（isLongTerm===true）
 */
export function getMarketPriceItems() {
  return store.items.filter(i => i?.isLongTerm === true)
}

/**
 * 按 brand 分组，返回 Map<brand, items[]>
 */
export function groupByBrand(items) {
  const map = new Map()
  for (const item of items) {
    const brand = item?.brand || '(未分类)'
    if (!map.has(brand)) map.set(brand, [])
    map.get(brand).push(item)
  }
  return map
}

/**
 * 计算品牌统计
 * returns [{ brand, totalValue, totalCost, changeRate, pricedCount, totalCount }]
 */
export function getBrandStats(items) {
  const groups = groupByBrand(items)
  const result = []
  for (const [brand, brandItems] of groups) {
    const priced = brandItems.filter(isPriced)
    const totalValue = priced.reduce((s, i) => s + (getCurrentPrice(i) || 0), 0)
    const totalCost = priced.reduce((s, i) => s + Number(i.cost || 0), 0)
    const changeRate = totalCost > 0 ? (totalValue - totalCost) / totalCost : 0
    result.push({
      brand,
      totalValue,
      totalCost,
      changeRate,
      pricedCount: priced.length,
      totalCount: brandItems.length,
    })
  }
  // 按涨跌幅降序
  result.sort((a, b) => b.changeRate - a.changeRate)
  return result
}

/**
 * 计算全局统计
 */
export function getGlobalStats(items) {
  const priced = items.filter(isPriced)
  const totalValue = priced.reduce((s, i) => s + (getCurrentPrice(i) || 0), 0)
  const totalCost = priced.reduce((s, i) => s + Number(i.cost || 0), 0)
  const profitCount = priced.filter(i => (getChangeRate(i) || 0) > 0).length
  const lossCount = priced.filter(i => (getChangeRate(i) || 0) < 0).length
  return {
    totalValue,
    totalCount: items.length,
    pricedCount: priced.length,
    unPricedCount: items.length - priced.length,
    totalProfit: totalValue - totalCost,
    totalRate: totalCost > 0 ? (totalValue - totalCost) / totalCost : 0,
    profitCount,
    lossCount,
  }
}

/**
 * 获取涨跌幅排行 TOP N
 */
export function getTopChanges(items, n = 5) {
  const priced = items.filter(isPriced)
  const withRate = priced.map(i => ({ item: i, rate: getChangeRate(i) || 0 }))
  const gainers = [...withRate].sort((a, b) => b.rate - a.rate).slice(0, n)
  const losers = [...withRate].sort((a, b) => a.rate - b.rate).slice(0, n)
  return { gainers, losers }
}

/**
 * 查找与指定 item 同 name+brand 的长线货品（包括自身）
 */
export function getLinkedItems(item) {
  return store.items.filter(i =>
    i?.isLongTerm === true &&
    i?.name === item.name &&
    i?.brand === item.brand
  )
}

/**
 * 更新市场价格：为 item 及其所有联动货品追加一条价格记录
 * @param {object} item - 触发更新的货品
 * @param {number} newPrice - 新市场价格
 * @returns {{ updatedCount: number }} 更新的货品数
 */
export function updateMarketPrice(item, newPrice) {
  const price = Number(newPrice)
  if (!Number.isFinite(price) || price < 0) {
    throw new Error('市场价格必须为有效正数')
  }

  const linked = getLinkedItems(item)
  const now = new Date().toISOString()

  for (const target of linked) {
    if (!Array.isArray(target.marketPrices)) {
      target.marketPrices = []
    }
    target.marketPrices.unshift({ price, timestamp: now })
    // 截断至 MAX_PRICE_HISTORY 条
    if (target.marketPrices.length > MAX_PRICE_HISTORY) {
      target.marketPrices.length = MAX_PRICE_HISTORY
    }
  }

  saveToLocalStorage()
  addOperationLog('market_price_update', `更新市场价格: ${item.name} ¥${price.toFixed(0)}`, {
    sid: item.sid,
    name: item.name,
    brand: item.brand,
    price: price,
    linkedCount: linked.length,
  })

  return { updatedCount: linked.length }
}
```

- [ ] **Step 3: 运行测试（暂无，先确保无语法错误）**

Run: `node -e "require('fs').readFileSync('src/modules/market-price/useMarketPrice.js','utf8')"` （确认文件存在）

---

### Task 2：编写 MarketPriceModule.vue — 主页面

**Files:**
- Create: `src/modules/market-price/MarketPriceModule.vue`

这是最核心的任务。组件包含以下区域：

1. **4 张统计摘要卡片** (总市值/件数/盈利/收益率)
2. **品牌统计条** (横向滚动)
3. **筛选栏** (搜索框 + 品牌筛选 + 排序切换)
4. **按品牌分组列表** (分组标题行 + 货品行)
5. **价格历史时间线** (点击展开)
6. **涨跌幅排行** (TOP 5 涨幅 + TOP 5 跌幅)
7. **价格输入弹窗** (使用 GlassModal)
8. **空状态处理**

- [ ] **Step 1: 编写 MarketPriceModule.vue 完整组件**

```vue
<script setup>
import { computed, ref } from 'vue'
import GlassModal from '../../components/GlassModal.vue'
import {
  getCurrentPrice,
  getChangeRate,
  isPriced,
  getMarketPriceItems,
  groupByBrand,
  getBrandStats,
  getGlobalStats,
  getTopChanges,
  getLinkedItems,
  updateMarketPrice,
} from './useMarketPrice'

// ===== 数据 =====
const allItems = computed(() => getMarketPriceItems())
const globalStats = computed(() => getGlobalStats(allItems.value))
const brandStats = computed(() => getBrandStats(allItems.value))

const searchKeyword = ref('')
const brandFilter = ref('')
const sortMode = ref('brand') // 'brand' | 'change' | 'value'

const filteredItems = computed(() => {
  let list = allItems.value
  if (searchKeyword.value) {
    const kw = searchKeyword.value.toLowerCase()
    list = list.filter(i => (i?.name || '').toLowerCase().includes(kw))
  }
  if (brandFilter.value) {
    list = list.filter(i => i?.brand === brandFilter.value)
  }
  return list
})

const sortedGroups = computed(() => {
  const groups = groupByBrand(filteredItems.value)
  const entries = Array.from(groups.entries()).map(([brand, items]) => {
    const priced = items.filter(isPriced)
    const totalValue = priced.reduce((s, i) => s + (getCurrentPrice(i) || 0), 0)
    const totalCost = priced.reduce((s, i) => s + Number(i.cost || 0), 0)
    const changeRate = totalCost > 0 ? (totalValue - totalCost) / totalCost : 0
    return { brand, items, totalValue, changeRate, pricedCount: priced.length }
  })

  if (sortMode.value === 'change') {
    entries.sort((a, b) => b.changeRate - a.changeRate)
  } else if (sortMode.value === 'value') {
    entries.sort((a, b) => b.totalValue - a.totalValue)
  }
  // 'brand' 模式按品牌名排序
  return entries
})

const brandOptions = computed(() => {
  const brands = new Set(allItems.value.map(i => i?.brand).filter(Boolean))
  return Array.from(brands).sort()
})

const rankings = computed(() => getTopChanges(allItems.value, 5))

// ===== 弹窗状态 =====
const showPriceModal = ref(false)
const editingItem = ref(null)
const newPrice = ref(0)
const linkedCount = ref(0)
const errorMsg = ref('')

function openPriceModal(item) {
  editingItem.value = item
  newPrice.value = getCurrentPrice(item) || 0
  linkedCount.value = getLinkedItems(item).length
  errorMsg.value = ''
  showPriceModal.value = true
}

function confirmPrice() {
  if (!editingItem.value) return
  const price = Number(newPrice.value)
  if (!Number.isFinite(price) || price < 0) {
    errorMsg.value = '请输入有效价格'
    return
  }
  try {
    updateMarketPrice(editingItem.value, price)
    showPriceModal.value = false
  } catch (e) {
    errorMsg.value = e.message
  }
}

// ===== 历史展开 =====
const expandedItemId = ref(null)

function toggleHistory(item) {
  const id = item?.sid || item?.id
  expandedItemId.value = expandedItemId.value === id ? null : id
}

function formatTime(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  return d.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function formatPrice(v) {
  return v != null ? '¥' + Number(v).toFixed(0) : '—'
}

function formatRate(v) {
  if (v === null || v === undefined) return '—'
  const sign = v >= 0 ? '+' : ''
  return sign + (v * 100).toFixed(1) + '%'
}
</script>

<template>
  <div>
    <!-- ===== 空状态 ===== -->
    <div v-if="allItems.length === 0" class="apple-card p-12 text-center">
      <i class="fa-solid fa-chart-line text-4xl text-gray-300 mb-4"></i>
      <div class="text-gray-500 text-base">暂无长线库存货品</div>
      <div class="text-gray-400 text-sm mt-2">请先在库存管理中将货品标记为长线</div>
    </div>

    <template v-else>
      <!-- ===== 1. 统计摘要卡片 ===== -->
      <div class="grid grid-cols-4 gap-4 mb-5">
        <div class="apple-card px-5 py-4">
          <div class="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1 flex items-center gap-1.5">
            <i class="fa-solid fa-coins text-blue-500"></i> 总市值
          </div>
          <div class="text-2xl font-bold text-blue-600">{{ formatPrice(globalStats.totalValue) }}</div>
          <div class="text-[11px] text-gray-400 mt-0.5">基于最新市场价格</div>
        </div>
        <div class="apple-card px-5 py-4">
          <div class="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1 flex items-center gap-1.5">
            <i class="fa-solid fa-cube text-gray-500"></i> 长线货品
          </div>
          <div class="text-2xl font-bold text-gray-700">{{ globalStats.totalCount }} <span class="text-sm font-normal text-gray-400">件</span></div>
          <div class="text-[11px] text-gray-400 mt-0.5">已标价 {{ globalStats.pricedCount }} · 未标价 {{ globalStats.unPricedCount }}</div>
        </div>
        <div class="apple-card px-5 py-4">
          <div class="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1 flex items-center gap-1.5">
            <i class="fa-solid fa-arrow-trend-up" :class="globalStats.totalProfit >= 0 ? 'text-green-500' : 'text-red-500'"></i> 整体盈亏
          </div>
          <div :class="['text-2xl font-bold', globalStats.totalProfit >= 0 ? 'text-green-600' : 'text-red-600']">
            {{ globalStats.totalProfit >= 0 ? '+' : '' }}{{ formatPrice(globalStats.totalProfit) }}
          </div>
          <div class="text-[11px] text-gray-400 mt-0.5">
            盈利 {{ globalStats.profitCount }} · 亏损 {{ globalStats.lossCount }}
          </div>
        </div>
        <div class="apple-card px-5 py-4">
          <div class="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1 flex items-center gap-1.5">
            <i class="fa-solid fa-percent text-gray-500"></i> 整体收益率
          </div>
          <div class="text-2xl font-bold text-gray-700">{{ formatRate(globalStats.totalRate) }}</div>
          <div class="text-[11px] text-gray-400 mt-0.5">加权平均</div>
        </div>
      </div>

      <!-- ===== 2. 品牌统计条 ===== -->
      <div v-if="brandStats.length > 0" class="flex gap-2.5 mb-5 overflow-x-auto pb-1" style="scrollbar-width:thin;">
        <div
          v-for="bs in brandStats"
          :key="bs.brand"
          class="shrink-0 bg-white border border-gray-200 rounded-xl px-4 py-2.5 min-w-[150px] hover:border-blue-200 transition-colors cursor-default"
        >
          <div class="text-xs font-semibold text-gray-700 mb-0.5">{{ bs.brand }}</div>
          <div class="flex justify-between items-baseline">
            <span class="text-base font-bold text-blue-600">{{ formatPrice(bs.totalValue) }}</span>
            <span :class="['text-sm font-semibold', bs.changeRate >= 0 ? 'text-green-600' : 'text-red-600']">
              {{ formatRate(bs.changeRate) }}
            </span>
          </div>
          <div class="text-[10px] text-gray-400">{{ bs.pricedCount }}/{{ bs.totalCount }} 件已标价</div>
        </div>
      </div>

      <!-- ===== 3. 筛选栏 ===== -->
      <div class="flex items-center gap-3 mb-4 flex-wrap">
        <div class="relative flex-1 max-w-xs">
          <i class="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs"></i>
          <input
            v-model="searchKeyword"
            class="apple-input pl-8 !py-2 !text-sm"
            placeholder="搜索货品名称..."
          />
        </div>
        <select v-model="brandFilter" class="apple-select !py-2 !text-sm !w-auto">
          <option value="">全部品牌</option>
          <option v-for="b in brandOptions" :key="b" :value="b">{{ b }}</option>
        </select>
        <div class="flex gap-1 ml-auto">
          <button
            :class="['px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors', sortMode === 'brand' ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50']"
            @click="sortMode = 'brand'"
          >按品牌</button>
          <button
            :class="['px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors', sortMode === 'change' ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50']"
            @click="sortMode = 'change'"
          >按涨跌幅</button>
          <button
            :class="['px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors', sortMode === 'value' ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50']"
            @click="sortMode = 'value'"
          >按市值</button>
        </div>
      </div>

      <!-- ===== 4. 按品牌分组列表 ===== -->
      <div class="apple-card overflow-hidden mb-5">
        <table class="w-full">
          <thead>
            <tr class="bg-gray-50 border-b border-gray-200">
              <th class="text-left px-4 py-2.5 text-xs font-semibold text-gray-500">货品</th>
              <th class="text-left px-4 py-2.5 text-xs font-semibold text-gray-500">成本</th>
              <th class="text-left px-4 py-2.5 text-xs font-semibold text-gray-500">最新市价</th>
              <th class="text-left px-4 py-2.5 text-xs font-semibold text-gray-500">涨跌幅</th>
              <th class="text-left px-4 py-2.5 text-xs font-semibold text-gray-500">状态</th>
              <th class="text-left px-4 py-2.5 text-xs font-semibold text-gray-500">操作</th>
            </tr>
          </thead>
          <tbody>
            <template v-for="group in sortedGroups" :key="group.brand">
              <!-- 分组标题行 -->
              <tr class="bg-blue-50/60 border-b border-blue-100">
                <td colspan="6" class="px-4 py-2 text-sm font-bold text-blue-800">
                  <i class="fa-solid fa-caret-down mr-1.5 text-blue-400"></i>
                  {{ group.brand }}
                  <span class="text-xs font-normal text-gray-500 ml-3">
                    {{ group.items.length }} 件 · 市值 {{ formatPrice(group.totalValue) }} ·
                    <span :class="group.changeRate >= 0 ? 'text-green-600' : 'text-red-600'">
                      {{ formatRate(group.changeRate) }}
                    </span>
                  </span>
                </td>
              </tr>
              <!-- 货品行 -->
              <tr
                v-for="item in group.items"
                :key="item.id || item.sid"
                class="border-b border-gray-100 hover:bg-gray-50/50 transition-colors"
              >
                <td class="px-4 py-3">
                  <div class="font-semibold text-gray-800 text-sm">{{ item.name }}</div>
                  <div class="text-[11px] text-gray-400" v-if="item.batch">批次: {{ item.batch }}</div>
                </td>
                <td class="px-4 py-3 text-sm font-mono text-gray-600">{{ formatPrice(item.cost) }}</td>
                <td class="px-4 py-3">
                  <span v-if="isPriced(item)" class="text-sm font-bold font-mono" :class="getChangeRate(item) >= 0 ? 'text-green-600' : 'text-red-600'">
                    {{ formatPrice(getCurrentPrice(item)) }}
                  </span>
                  <span v-else class="text-sm text-gray-400">—</span>
                </td>
                <td class="px-4 py-3">
                  <template v-if="isPriced(item)">
                    <div class="flex items-center gap-2">
                      <span :class="['text-sm font-bold font-mono', getChangeRate(item) >= 0 ? 'text-green-600' : 'text-red-600']">
                        {{ formatRate(getChangeRate(item)) }}
                      </span>
                      <div class="w-12 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                        <div
                          class="h-full rounded-full transition-all"
                          :class="getChangeRate(item) >= 0 ? 'bg-green-500' : 'bg-red-500'"
                          :style="{ width: Math.min(Math.abs(getChangeRate(item)) * 100, 100) + '%' }"
                        ></div>
                      </div>
                    </div>
                  </template>
                  <span v-else class="text-sm text-gray-400">—</span>
                </td>
                <td class="px-4 py-3">
                  <span
                    v-if="isPriced(item)"
                    :class="['inline-block text-xs font-medium px-2 py-0.5 rounded-full', getChangeRate(item) > 0 ? 'bg-green-100 text-green-700' : getChangeRate(item) < 0 ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600']"
                  >
                    {{ getChangeRate(item) > 0 ? '盈利' : getChangeRate(item) < 0 ? '亏损' : '持平' }}
                  </span>
                  <span v-else class="inline-block text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">未标价</span>
                </td>
                <td class="px-4 py-3">
                  <div class="flex items-center gap-1">
                    <button class="btn btn-outline btn-sm !text-xs !px-3" @click="openPriceModal(item)">
                      <i class="fa-solid fa-pen mr-1"></i>{{ isPriced(item) ? '更新' : '标价' }}
                    </button>
                    <button
                      v-if="isPriced(item)"
                      class="btn btn-outline btn-sm !text-xs !px-2 !border-transparent hover:!bg-gray-100"
                      @click="toggleHistory(item)"
                      :title="'查看价格历史'"
                    >
                      <i class="fa-solid fa-clock-rotate-left"></i>
                    </button>
                    <span
                      v-if="getLinkedItems(item).length > 1"
                      class="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded"
                      title="同名称+品牌货品将联动更新"
                    >
                      <i class="fa-solid fa-link"></i>
                    </span>
                  </div>
                </td>
              </tr>
              <!-- 历史时间线（展开行） -->
              <tr
                v-if="expandedItemId === (item.id || item.sid)"
                v-for="item in [group.items.find(i => (i.id || i.sid) === expandedItemId)]"
                :key="'h-' + (item?.id || item?.sid)"
                class="bg-gray-50/80"
              >
                <td colspan="6" class="px-4 py-3 pl-12">
                  <div class="text-xs font-semibold text-gray-600 mb-2">
                    <i class="fa-solid fa-clock-rotate-left mr-1.5"></i>市场价格历史 · {{ item?.name }}
                  </div>
                  <div class="relative pl-5" v-if="item?.marketPrices?.length">
                    <div class="absolute left-1 top-1.5 bottom-1.5 w-0.5 bg-gray-300"></div>
                    <div
                      v-for="(mp, mi) in item.marketPrices"
                      :key="mi"
                      class="relative pb-2 pl-4 text-sm flex items-center gap-3 last:pb-0"
                    >
                      <div
                        :class="['absolute -left-[18px] top-[7px] w-2.5 h-2.5 rounded-full border-2', mi === 0 ? 'bg-green-500 border-white' : 'bg-blue-500 border-gray-50/80']"
                      ></div>
                      <span class="font-bold font-mono" :class="mi === 0 ? 'text-green-600' : 'text-gray-700'">
                        {{ formatPrice(mp.price) }}
                      </span>
                      <span class="text-gray-400 text-xs">{{ formatTime(mp.timestamp) }}</span>
                      <span v-if="mi > 0 && item.marketPrices[mi - 1]" class="text-xs" :class="mp.price <= item.marketPrices[mi - 1].price ? 'text-green-500' : 'text-red-500'">
                        {{ mp.price <= item.marketPrices[mi - 1].price ? '↑' : '↓' }}{{ formatPrice(Math.abs(item.marketPrices[mi - 1].price - mp.price)) }}
                      </span>
                      <span v-if="mi === item.marketPrices.length - 1 && mi > 0" class="text-xs text-gray-400">首次标价</span>
                    </div>
                  </div>
                  <div v-else class="text-xs text-gray-400 pl-4">暂无历史记录</div>
                </td>
              </tr>
            </template>
            <!-- 搜索结果为空 -->
            <tr v-if="sortedGroups.length === 0">
              <td colspan="6" class="px-4 py-8 text-center text-gray-400">
                <i class="fa-solid fa-search text-lg mb-2 block"></i>
                没有匹配的货品
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- ===== 5. 涨跌幅排行榜 ===== -->
      <div class="grid grid-cols-2 gap-4 mb-5">
        <!-- 涨幅 TOP 5 -->
        <div class="apple-card p-4">
          <h3 class="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <i class="fa-solid fa-arrow-trend-up text-green-500"></i> 涨幅 TOP 5
            <span class="ml-auto text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded"><i class="fa-regular fa-clock mr-0.5"></i>近 30 天</span>
          </h3>
          <div v-if="rankings.gainers.length > 0" class="space-y-2">
            <div
              v-for="(r, ri) in rankings.gainers"
              :key="ri"
              class="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-gray-50"
            >
              <span
                :class="['w-5 h-5 flex items-center justify-center rounded-md text-[10px] font-bold shrink-0', ri === 0 ? 'bg-yellow-400 text-yellow-900' : ri === 1 ? 'bg-gray-200 text-gray-600' : ri === 2 ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-500']"
              >{{ ri + 1 }}</span>
              <div class="flex-1 min-w-0">
                <div class="text-sm font-semibold truncate">{{ r.item.name }}</div>
                <div class="text-[11px] text-gray-400">{{ r.item.brand }}</div>
              </div>
              <span class="text-sm font-bold text-green-600">{{ formatRate(r.rate) }}</span>
            </div>
          </div>
          <div v-else class="text-xs text-gray-400 py-4 text-center">暂无数据</div>
        </div>
        <!-- 跌幅 TOP 5 -->
        <div class="apple-card p-4">
          <h3 class="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
            <i class="fa-solid fa-arrow-trend-down text-red-500"></i> 跌幅 TOP 5
            <span class="ml-auto text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded"><i class="fa-regular fa-clock mr-0.5"></i>近 30 天</span>
          </h3>
          <div v-if="rankings.losers.length > 0" class="space-y-2">
            <div
              v-for="(r, ri) in rankings.losers"
              :key="ri"
              class="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-gray-50"
            >
              <span
                :class="['w-5 h-5 flex items-center justify-center rounded-md text-[10px] font-bold shrink-0', ri === 0 ? 'bg-yellow-400 text-yellow-900' : ri === 1 ? 'bg-gray-200 text-gray-600' : ri === 2 ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-500']"
              >{{ ri + 1 }}</span>
              <div class="flex-1 min-w-0">
                <div class="text-sm font-semibold truncate">{{ r.item.name }}</div>
                <div class="text-[11px] text-gray-400">{{ r.item.brand }}</div>
              </div>
              <span class="text-sm font-bold text-red-600">{{ formatRate(r.rate) }}</span>
            </div>
          </div>
          <div v-else class="text-xs text-gray-400 py-4 text-center">暂无数据</div>
        </div>
      </div>
    </template>

    <!-- ===== 价格输入弹窗 ===== -->
    <GlassModal v-model="showPriceModal" panel-class="w-full max-w-sm p-6 relative" :close-on-overlay="true">
      <div class="mb-4">
        <div class="text-lg font-bold">更新市场价格</div>
        <div class="text-sm text-gray-500 mt-1" v-if="editingItem">
          {{ editingItem.name }} · {{ editingItem.brand }}
        </div>
      </div>

      <div class="mb-4" v-if="editingItem">
        <div class="text-xs text-gray-500 mb-1">当前市价</div>
        <div class="text-lg font-bold font-mono">{{ isPriced(editingItem) ? formatPrice(getCurrentPrice(editingItem)) : '未标价' }}</div>
      </div>

      <div class="mb-3">
        <label class="text-sm font-medium text-gray-700 block mb-1">新价格 (¥)</label>
        <input
          v-model.number="newPrice"
          type="number"
          step="1"
          min="0"
          class="apple-input !text-lg !font-bold"
          placeholder="输入市场价格"
          @keyup.enter="confirmPrice"
        />
      </div>

      <div v-if="linkedCount > 1" class="mb-3 text-xs bg-blue-50 text-blue-700 px-3 py-2 rounded-lg">
        <i class="fa-solid fa-link mr-1"></i>将同时更新 <strong>{{ linkedCount }}</strong> 件同名称+品牌货品的市场价格
      </div>

      <div v-if="errorMsg" class="mb-3 text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">
        {{ errorMsg }}
      </div>

      <div class="flex justify-end gap-2 mt-4">
        <button class="btn btn-outline" @click="showPriceModal = false">取消</button>
        <button class="btn btn-primary" @click="confirmPrice">确认更新</button>
      </div>
    </GlassModal>
  </div>
</template>
```

- [ ] **Step 2: 验证文件创建成功**

Run: `ls -la src/modules/market-price/MarketPriceModule.vue` （确认文件存在，大小合理）

---

### Task 3：注册侧边栏 + 路由 + 日志类型

**Files:**
- Modify: `src/App.vue`
- Modify: `src/components/AppSidebar.vue`
- Modify: `src/data/store.js`

- [ ] **Step 1: AppSidebar.vue — 追加图标**

在 `iconMap` 对象中追加：

```js
const iconMap = {
  home: 'fa-solid fa-chart-pie',
  inventory: 'fa-solid fa-boxes-stacked',
  sales: 'fa-solid fa-cash-register',
  purchase: 'fa-solid fa-truck',
  finance: 'fa-solid fa-wallet',
  rushcar: 'fa-solid fa-car-side',
  'market-price': 'fa-solid fa-chart-line',  // ← 新增
}
```

- [ ] **Step 2: App.vue — 追加 tab 定义**

在 `tabs` 数组末尾追加：

```js
const tabs = [
  { id: 'home', name: '数据透视' },
  { id: 'inventory', name: '库存管理' },
  { id: 'sales', name: '销售记账' },
  { id: 'purchase', name: '采购管理' },
  { id: 'finance', name: '公共收支' },
  { id: 'rushcar', name: '美淘记录' },
  { id: 'market-price', name: '市场价格' },  // ← 新增第 7 项
]
```

- [ ] **Step 3: App.vue — import MarketPriceModule**

在现有 import 块中追加：

```js
import MarketPriceModule from './modules/market-price/MarketPriceModule.vue'
```

- [ ] **Step 4: App.vue — 模板追加条件渲染**

在模板中的模块切换区，在 RushCarPrototypeModule 之后追加：

```html
<MarketPriceModule v-else-if="currentTab === 'market-price'" />
```

- [ ] **Step 5: App.vue — logTypeMeta 追加新日志类型**

在 `logTypeMeta` 对象中追加：

```js
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
```

- [ ] **Step 6: store.js — FIELD_LABEL_MAP 追加**

在 `FIELD_LABEL_MAP` 中追加：

```js
marketPrices: '市场价格',
```

- [ ] **Step 7: 验证无编译错误**

Run: `npx vite build --logLevel error` 或 `npx vite --host 2>&1 | head -5`（确认无语法错误）

---

### Task 4：编写单元测试

**Files:**
- Create: `src/modules/market-price/useMarketPrice.test.js`

- [ ] **Step 1: 编写测试文件**

```js
import { describe, it, expect, beforeEach } from 'vitest'
import { state as store } from '../../data/store'

// 重置 store.items
function resetItems(items) {
  store.items.splice(0, store.items.length, ...items)
}

// 模拟 longTerm 货品
function makeItem(overrides = {}) {
  return {
    id: Date.now() + Math.random(),
    sid: 'TEST-001',
    name: '测试货品',
    brand: 'TestBrand',
    cost: 100,
    isLongTerm: true,
    marketPrices: [],
    ...overrides,
  }
}

describe('useMarketPrice', () => {
  let mod

  beforeEach(async () => {
    store.items.splice(0, store.items.length)
    // 动态 import 以确保每次测试拿到纯净引用
    mod = await import('./useMarketPrice')
  })

  describe('getCurrentPrice', () => {
    it('应返回最新市价', () => {
      const item = makeItem({ marketPrices: [{ price: 200, timestamp: '2026-07-14T00:00:00Z' }, { price: 150, timestamp: '2026-06-01T00:00:00Z' }] })
      expect(mod.getCurrentPrice(item)).toBe(200)
    })

    it('无价格记录应返回 null', () => {
      const item = makeItem({ marketPrices: [] })
      expect(mod.getCurrentPrice(item)).toBeNull()
    })

    it('无 marketPrices 字段应返回 null', () => {
      const item = makeItem()
      delete item.marketPrices
      expect(mod.getCurrentPrice(item)).toBeNull()
    })
  })

  describe('getChangeRate', () => {
    it('应正确计算涨跌幅', () => {
      const item = makeItem({ cost: 100, marketPrices: [{ price: 150, timestamp: '2026-07-14T00:00:00Z' }] })
      expect(mod.getChangeRate(item)).toBe(0.5)
    })

    it('亏损货品应返回负数', () => {
      const item = makeItem({ cost: 200, marketPrices: [{ price: 150, timestamp: '2026-07-14T00:00:00Z' }] })
      expect(mod.getChangeRate(item)).toBe(-0.25)
    })

    it('成本为 0 应返回 null', () => {
      const item = makeItem({ cost: 0, marketPrices: [{ price: 100, timestamp: '2026-07-14T00:00:00Z' }] })
      expect(mod.getChangeRate(item)).toBeNull()
    })
  })

  describe('isPriced', () => {
    it('有价格记录应返回 true', () => {
      const item = makeItem({ marketPrices: [{ price: 100, timestamp: '2026-07-14T00:00:00Z' }] })
      expect(mod.isPriced(item)).toBe(true)
    })

    it('无价格记录应返回 false', () => {
      const item = makeItem({ marketPrices: [] })
      expect(mod.isPriced(item)).toBe(false)
    })
  })

  describe('getMarketPriceItems', () => {
    it('应只返回 isLongTerm=true 的货品', () => {
      resetItems([
        makeItem({ id: '1', isLongTerm: true }),
        makeItem({ id: '2', isLongTerm: false }),
        makeItem({ id: '3', isLongTerm: true }),
      ])
      const result = mod.getMarketPriceItems()
      expect(result).toHaveLength(2)
      expect(result.map(i => i.id)).toEqual(['1', '3'])
    })
  })

  describe('groupByBrand', () => {
    it('应按品牌正确分组', () => {
      const items = [
        makeItem({ id: '1', brand: 'TLV' }),
        makeItem({ id: '2', brand: 'MINIGT' }),
        makeItem({ id: '3', brand: 'TLV' }),
      ]
      const map = mod.groupByBrand(items)
      expect(map.get('TLV')).toHaveLength(2)
      expect(map.get('MINIGT')).toHaveLength(1)
    })
  })

  describe('getBrandStats', () => {
    it('应正确计算品牌统计', () => {
      resetItems([
        makeItem({ id: '1', brand: 'TLV', cost: 100, marketPrices: [{ price: 150, timestamp: '2026-07-14T00:00:00Z' }] }),
        makeItem({ id: '2', brand: 'TLV', cost: 200, marketPrices: [{ price: 180, timestamp: '2026-07-14T00:00:00Z' }] }),
        makeItem({ id: '3', brand: 'TLV', cost: 50, marketPrices: [] }), // 未标价
      ])
      const stats = mod.getBrandStats(mod.getMarketPriceItems())
      expect(stats).toHaveLength(1)
      expect(stats[0].brand).toBe('TLV')
      expect(stats[0].totalValue).toBe(330)  // 150 + 180
      expect(stats[0].totalCost).toBe(300)   // 100 + 200
      expect(stats[0].pricedCount).toBe(2)
      expect(stats[0].totalCount).toBe(3)
    })
  })

  describe('getGlobalStats', () => {
    it('应正确计算全局统计', () => {
      resetItems([
        makeItem({ id: '1', cost: 100, marketPrices: [{ price: 150, timestamp: '2026-07-14T00:00:00Z' }] }),
        makeItem({ id: '2', cost: 200, marketPrices: [{ price: 180, timestamp: '2026-07-14T00:00:00Z' }] }),
        makeItem({ id: '3', cost: 50, marketPrices: [] }),
      ])
      const stats = mod.getGlobalStats(mod.getMarketPriceItems())
      expect(stats.totalCount).toBe(3)
      expect(stats.pricedCount).toBe(2)
      expect(stats.unPricedCount).toBe(1)
      expect(stats.totalValue).toBe(330)
      expect(stats.totalProfit).toBe(30)     // (150-100)+(180-200)
      expect(stats.profitCount).toBe(1)       // 150>100
      expect(stats.lossCount).toBe(1)         // 180<200
    })
  })

  describe('getTopChanges', () => {
    it('应正确返回涨幅和跌幅 TOP', () => {
      resetItems([
        makeItem({ id: '1', name: 'A', cost: 100, marketPrices: [{ price: 200, timestamp: '2026-07-14T00:00:00Z' }] }),
        makeItem({ id: '2', name: 'B', cost: 100, marketPrices: [{ price: 50, timestamp: '2026-07-14T00:00:00Z' }] }),
        makeItem({ id: '3', name: 'C', cost: 100, marketPrices: [{ price: 150, timestamp: '2026-07-14T00:00:00Z' }] }),
      ])
      const { gainers, losers } = mod.getTopChanges(mod.getMarketPriceItems(), 2)
      expect(gainers).toHaveLength(2)
      expect(gainers[0].item.name).toBe('A')
      expect(gainers[0].rate).toBe(1.0)
      expect(losers[0].item.name).toBe('B')
      expect(losers[0].rate).toBe(-0.5)
    })
  })

  describe('getLinkedItems', () => {
    it('应返回同 name+brand 的长线货品', () => {
      resetItems([
        makeItem({ id: '1', name: 'GT-R', brand: 'TLV', isLongTerm: true }),
        makeItem({ id: '2', name: 'GT-R', brand: 'TLV', isLongTerm: true }),
        makeItem({ id: '3', name: 'GT-R', brand: 'MINIGT', isLongTerm: true }),
        makeItem({ id: '4', name: 'Supra', brand: 'TLV', isLongTerm: true }),
        makeItem({ id: '5', name: 'GT-R', brand: 'TLV', isLongTerm: false }), // 短线
      ])
      const source = makeItem({ name: 'GT-R', brand: 'TLV', isLongTerm: true })
      const linked = mod.getLinkedItems(source)
      expect(linked).toHaveLength(2)
      expect(linked.map(i => i.id)).toEqual(['1', '2'])
    })
  })

  describe('updateMarketPrice', () => {
    it('应追加价格记录到所有联动货品', () => {
      resetItems([
        makeItem({ id: '1', name: 'GT-R', brand: 'TLV', cost: 100, marketPrices: [] }),
        makeItem({ id: '2', name: 'GT-R', brand: 'TLV', cost: 100, marketPrices: [] }),
      ])
      const source = store.items[0]
      const result = mod.updateMarketPrice(source, 250)
      expect(result.updatedCount).toBe(2)
      expect(store.items[0].marketPrices).toHaveLength(1)
      expect(store.items[0].marketPrices[0].price).toBe(250)
      expect(store.items[1].marketPrices).toHaveLength(1)
      expect(store.items[1].marketPrices[0].price).toBe(250)
    })

    it('价格记录超过 100 条应截断', () => {
      const oldPrices = Array.from({ length: 100 }, (_, i) => ({
        price: 100 + i,
        timestamp: new Date(2026, 0, i + 1).toISOString(),
      }))
      resetItems([
        makeItem({ id: '1', name: 'GT-R', brand: 'TLV', cost: 100, marketPrices: oldPrices }),
      ])
      mod.updateMarketPrice(store.items[0], 999)
      expect(store.items[0].marketPrices).toHaveLength(100)
      expect(store.items[0].marketPrices[0].price).toBe(999) // 最新在最前
    })
  })
})
```

- [ ] **Step 2: 运行测试**

Run: `npx vitest run src/modules/market-price/useMarketPrice.test.js`

Expected: All tests pass.

---

### Task 5：端到端验证

**Files:** (无修改)

- [ ] **Step 1: 启动 dev server 并确认**

Run: `npx vite --host` （后台启动）

- [ ] **Step 2: 在浏览器中验证**
   - 确认侧边栏出现"市场价格"第 7 板块
   - 点击切换到市场价格板块
   - 确认统计卡片显示
   - 确认货品列表按品牌分组
   - 点击"标价"输入价格
   - 确认联动提示显示正确件数
   - 确认价格更新后统计和排行刷新
   - 确认短线货品（isLongTerm≠true）不出现

---
