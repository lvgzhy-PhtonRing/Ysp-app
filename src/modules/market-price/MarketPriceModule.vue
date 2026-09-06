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
  getLinkedItems,
  updateMarketPrice,
} from './useMarketPrice'

// ===== 数据 =====
const allItems = computed(() => getMarketPriceItems())
const globalStats = computed(() => getGlobalStats(allItems.value))
const brandStats = computed(() => getBrandStats(allItems.value))

const searchKeyword = ref('')
const brandFilter = ref('')
const sortMode = ref('brand') // 'brand' | 'change' | 'value' | 'profit'

// ===== 品牌折叠状态 =====
const collapsedBrands = ref(new Set())

function toggleBrand(brand) {
  const s = new Set(collapsedBrands.value)
  if (s.has(brand)) s.delete(brand); else s.add(brand)
  collapsedBrands.value = s
}

// ===== 按名称合并逻辑 =====
function mergeItemsByName(items) {
  const map = new Map()
  for (const item of items) {
    const key = item?.name || ''
    if (!map.has(key)) {
      map.set(key, {
        name: item.name,
        brand: item.brand,
        sid: item.sid,
        cost: item.cost,
        batch: item.batch,
        category: item.category,
        isLongTerm: item.isLongTerm,
        id: item.id,
        isDefect: item.isDefect,
        isManual: item.isManual,
        // 保存所有原始 item 引用（用于展开明细）
        rawItems: [item],
        qty: 1,
        totalCost: Number(item?.cost || 0),
        avgCost: Number(item?.cost || 0),
        mergedPrice: getCurrentPrice(item),
        // 保留 marketPrices 用于历史时间线（取第一条有市价的）
        marketPrices: item.marketPrices ? [...item.marketPrices] : [],
      })
      continue
    }
    const g = map.get(key)
    g.qty += 1
    g.rawItems.push(item)
    g.totalCost += Number(item?.cost || 0)
    g.avgCost = g.totalCost / g.qty
    if (!g.mergedPrice && getCurrentPrice(item)) {
      g.mergedPrice = getCurrentPrice(item)
      g.marketPrices = item.marketPrices ? [...item.marketPrices] : []
    }
  }
  return Array.from(map.values())
}

function getMergedChangeRate(item) {
  const price = item.mergedPrice
  const cost = item.avgCost || 0
  if (price == null || cost === 0) return null
  return (price - cost) / cost
}

/** 该款总盈亏金额：市价×件数 − 总成本（未标价返回 null） */
function getMergedProfit(item) {
  if (!isMergedPriced(item)) return null
  return item.mergedPrice * item.qty - item.totalCost
}

function isMergedPriced(item) {
  return item.mergedPrice != null
}

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

// ===== 品牌组内排序 =====
function sortGroupItems(items, mode) {
  const list = [...items]
  if (mode === 'change') {
    return list.sort((a, b) => (getMergedChangeRate(b) || 0) - (getMergedChangeRate(a) || 0))
  }
  if (mode === 'value') {
    return list.sort((a, b) => ((b.mergedPrice || 0) * b.qty) - ((a.mergedPrice || 0) * a.qty))
  }
  if (mode === 'profit') {
    return list.sort((a, b) => (getMergedProfit(b) || 0) - (getMergedProfit(a) || 0))
  }
  // 默认按名称
  return list.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'zh-CN'))
}

const sortedGroups = computed(() => {
  const groups = groupByBrand(filteredItems.value)
  const entries = Array.from(groups.entries()).map(([brand, items]) => {
    const merged = mergeItemsByName(items)
    // 品牌组内按当前排序模式排列（不跨组）
    const sorted = sortGroupItems(merged, sortMode.value)
    const priced = sorted.filter(i => i.mergedPrice != null)
    const totalValue = priced.reduce((s, i) => s + (i.mergedPrice || 0) * i.qty, 0)
    const totalCost = sorted.reduce((s, i) => s + i.totalCost, 0)
    const changeRate = totalCost > 0 ? (totalValue - totalCost) / totalCost : 0
    return { brand, items: sorted, totalValue, totalCost, changeRate, pricedCount: priced.length, rawCount: items.length }
  })

  if (sortMode.value === 'brand') {
    entries.sort((a, b) => a.brand.localeCompare(b.brand, 'zh-CN'))
  } else if (sortMode.value === 'change') {
    entries.sort((a, b) => b.changeRate - a.changeRate)
  } else if (sortMode.value === 'value') {
    entries.sort((a, b) => b.totalValue - a.totalValue)
  } else if (sortMode.value === 'profit') {
    entries.sort((a, b) => (b.totalValue - b.totalCost) - (a.totalValue - a.totalCost))
  }
  return entries
})

const brandOptions = computed(() => {
  const brands = new Set(allItems.value.map(i => i?.brand).filter(Boolean))
  return Array.from(brands).sort()
})

const rankings = computed(() => {
  // 基于合并后商品（按名称）计算涨跌幅排行
  const merged = mergeItemsByName(allItems.value)
  const withRate = merged
    .filter(i => isMergedPriced(i))
    .map(i => ({ item: i, rate: getMergedChangeRate(i) || 0 }))
  const gainers = [...withRate].sort((a, b) => b.rate - a.rate).slice(0, 10)
  const losers = [...withRate].sort((a, b) => a.rate - b.rate).slice(0, 10)
  return { gainers, losers }
})

// ===== 弹窗状态 =====
const showPriceModal = ref(false)
const editingItem = ref(null)
const newPrice = ref(0)
const linkedCount = ref(0)
const errorMsg = ref('')

function openPriceModal(item) {
  editingItem.value = item
  newPrice.value = item.mergedPrice || 0
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

// ===== 合并明细展开 =====
const expandedMergeName = ref(null)

function toggleMergeDetail(name) {
  expandedMergeName.value = expandedMergeName.value === name ? null : name
}

function formatTime(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  return d.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function formatPrice(v) {
  return v != null ? '¥' + Number(v).toFixed(2) : '—'
}

function formatPriceAvg(v) {
  return v != null ? '¥' + Number(v).toFixed(2) : '—'
}

function formatRate(v) {
  if (v === null || v === undefined) return '—'
  const sign = v > 0 ? '+' : ''
  return sign + (v * 100).toFixed(1) + '%'
}

function formatProfit(v) {
  if (v === null || v === undefined) return '—'
  const sign = v > 0 ? '+' : ''
  return sign + Number(v).toFixed(2)
}

/** 表格列内金额：不带货币符号，节约横向空间 */
function formatAmount(v) {
  return v != null ? Number(v).toFixed(2) : '—'
}
</script>

<template>
  <div class="space-y-6">
    <!-- ===== 空状态 ===== -->
    <div v-if="allItems.length === 0" class="apple-card p-12 text-center">
      <i class="fa-solid fa-chart-line text-4xl text-gray-300 mb-4"></i>
      <div class="text-gray-500 text-base">暂无长线库存货品</div>
      <div class="text-gray-400 text-sm mt-2">请先在库存管理中将货品标记为长线</div>
    </div>

    <template v-else>
      <!-- ===== 页面标题 ===== -->
      <div class="flex items-center justify-between">
        <div class="flex items-baseline gap-3">
          <h2 class="text-3xl font-extrabold">市场价格</h2>
          <span class="text-base text-gray-400 font-light">Market Price</span>
        </div>
        <div class="text-xs text-gray-400">
          <i class="fa-regular fa-clock mr-1"></i>{{ new Date().toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) }}
        </div>
      </div>

      <!-- ===== 1. 统计摘要卡片 ===== -->
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div class="bg-gray-50 p-4 rounded-xl border-l-4 border-primary">
          <div class="text-xs text-gray-500 mb-1">总市值</div>
          <div class="text-2xl font-bold text-gray-800">{{ formatPrice(globalStats.totalValue) }}</div>
          <div class="text-xs text-gray-500 mt-1">基于最新市场价格</div>
        </div>
        <div class="bg-gray-50 p-4 rounded-xl border-l-4 border-gray-400">
          <div class="text-xs text-gray-500 mb-1">长线货品</div>
          <div class="text-2xl font-bold text-gray-800">{{ globalStats.totalCount }} <span class="text-sm font-normal text-gray-500">件</span></div>
          <div class="text-xs text-gray-500 mt-1">已标价 {{ globalStats.pricedCount }} · 未标价 {{ globalStats.unPricedCount }}</div>
        </div>
        <div class="bg-gray-50 p-4 rounded-xl border-l-4 border-red-500">
          <div class="text-xs text-gray-500 mb-1">整体盈亏</div>
          <div class="text-2xl font-bold" :class="globalStats.totalProfit >= 0 ? 'text-red-600' : 'text-green-600'">
            {{ globalStats.totalProfit >= 0 ? '+' : '' }}{{ formatPrice(globalStats.totalProfit) }}
          </div>
          <div class="text-xs text-gray-500 mt-1">
            盈利 {{ globalStats.profitCount }} · 亏损 {{ globalStats.lossCount }}，原库存货值 {{ formatAmount(globalStats.totalCost) }}
          </div>
        </div>
        <div class="bg-gray-50 p-4 rounded-xl border-l-4 border-purple-500">
          <div class="text-xs text-gray-500 mb-1">整体收益率</div>
          <div class="text-2xl font-bold text-gray-800">{{ formatRate(globalStats.totalRate) }}</div>
          <div class="text-xs text-gray-500 mt-1">加权平均</div>
        </div>
      </div>

      <!-- ===== 2. 品牌统计卡片 ===== -->
      <div class="apple-card border-l-4 border-l-gray-400 py-2">
        <div class="flex gap-3 overflow-x-auto pb-1" style="scrollbar-width:thin;">
          <div
            v-for="bs in brandStats"
            :key="bs.brand"
            class="shrink-0 bg-gray-50 rounded-xl px-4 py-3.5 min-w-[150px] hover:bg-gray-100 transition-colors cursor-default"
          >
            <div class="text-xs font-semibold text-gray-700 mb-0.5">{{ bs.brand }}</div>
            <div class="flex justify-between items-baseline">
              <span class="text-base font-bold text-gray-800">{{ formatPrice(bs.totalValue) }}</span>
              <span :class="['text-sm font-semibold', bs.changeRate >= 0 ? 'text-red-600' : 'text-green-600']">
                {{ formatRate(bs.changeRate) }}
              </span>
            </div>
            <div class="text-[10px] text-gray-400">{{ bs.pricedCount }}/{{ bs.totalCount }} 件已标价</div>
          </div>
        </div>
      </div>

      <!-- ===== 3. 筛选栏 ===== -->
      <div class="apple-card overflow-visible p-4 flex flex-wrap items-center gap-3">
        <select v-model="brandFilter" class="apple-select py-1.5 w-36">
          <option value="">全部品牌</option>
          <option v-for="b in brandOptions" :key="b" :value="b">{{ b }}</option>
        </select>
        <input
          v-model="searchKeyword"
          class="apple-input py-1.5 w-64"
          placeholder="搜索货品名称..."
        />
        <div class="flex flex-wrap gap-2 ml-auto">
          <button
            class="px-3 py-1 text-xs rounded-full transition"
            :class="sortMode === 'brand' ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'"
            @click="sortMode = 'brand'"
          >按品牌</button>
          <button
            class="px-3 py-1 text-xs rounded-full transition"
            :class="sortMode === 'change' ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'"
            @click="sortMode = 'change'"
          >按涨跌幅</button>
          <button
            class="px-3 py-1 text-xs rounded-full transition"
            :class="sortMode === 'value' ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'"
            @click="sortMode = 'value'"
          >按市值</button>
          <button
            class="px-3 py-1 text-xs rounded-full transition"
            :class="sortMode === 'profit' ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'"
            @click="sortMode = 'profit'"
          >按盈亏数</button>
        </div>
      </div>

      <!-- ===== 4. 按品牌分组列表 ===== -->
      <div class="apple-card p-0 overflow-hidden">
        <table class="apple-table w-full table-fixed">
          <thead>
            <tr>
              <th>货品</th>
              <th class="text-right w-28">平均成本</th>
              <th class="text-right w-28">最新市价</th>
              <th class="text-right w-36 pr-12">涨跌幅</th>
              <th class="w-20">状态</th>
              <th class="text-right w-24 pl-2 pr-6">盈亏数</th>
              <th class="w-44">&nbsp;&nbsp;&nbsp;&nbsp;操作</th>
            </tr>
          </thead>
          <tbody>
            <template v-for="group in sortedGroups" :key="group.brand">
              <!-- 分组标题行（可点击折叠） -->
              <tr class="group-header-row cursor-pointer select-none" @click="toggleBrand(group.brand)">
                <td colspan="7">
                  <i :class="['mr-2 text-gray-500', collapsedBrands.has(group.brand) ? 'fa-solid fa-chevron-right' : 'fa-solid fa-chevron-down']"></i>
                  {{ group.brand }}
                  <span class="ml-3 text-xs font-normal text-gray-500">
                    {{ group.rawCount }} 件 · {{ group.items.length }} 款 · 总货值 {{ formatAmount(group.totalCost) }} · 预期市价 {{ formatAmount(group.totalValue) }} ·
                    <span :class="group.changeRate >= 0 ? 'text-red-600' : 'text-green-600'">
                      {{ formatRate(group.changeRate) }}
                    </span>
                    ·
                    <span :class="group.totalValue - group.totalCost >= 0 ? 'text-red-600' : 'text-green-600'">
                      {{ formatProfit(group.totalValue - group.totalCost) }}
                    </span>
                  </span>
                </td>
              </tr>
              <!-- 合并货品行 + 展开明细 -->
              <template v-for="item in group.items" :key="item.name">
                <tr
                  v-if="!collapsedBrands.has(group.brand)"
                  class="border-b border-gray-100"
                >
                <td>
                  <div class="flex items-center gap-2">
                    <span
                      class="font-semibold text-gray-800 text-sm cursor-pointer hover:text-blue-600"
                      @click="toggleMergeDetail(item.name)"
                      :title="item.rawItems?.length > 1 ? '点击查看 ' + item.rawItems.length + ' 件明细' : ''"
                    >{{ item.name }}</span>
                    <span v-if="item.qty > 1" class="inline-flex items-center justify-center min-w-[22px] h-5 px-1.5 text-[11px] font-bold text-white bg-primary rounded-full">{{ item.qty }}x</span>
                  </div>
                  <div v-if="item.qty > 1" class="text-[11px] text-gray-400 mt-0.5">
                    总成本 {{ formatPrice(item.totalCost) }}
                  </div>
                </td>
                <td class="text-right font-mono text-gray-600 tabular-nums">{{ formatAmount(item.avgCost) }}</td>
                <td class="text-right">
                  <span v-if="isMergedPriced(item)" class="text-sm font-bold font-mono tabular-nums" :class="getMergedChangeRate(item) >= 0 ? 'text-red-600' : 'text-green-600'">
                    {{ formatAmount(item.mergedPrice) }}
                  </span>
                  <span v-else class="text-sm text-gray-400">—</span>
                </td>
                <td class="text-right">
                  <template v-if="isMergedPriced(item)">
                    <div class="flex items-center justify-end gap-2">
                      <div class="w-12 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                        <div
                          class="h-full rounded-full transition-all"
                          :class="getMergedChangeRate(item) >= 0 ? 'bg-red-500' : 'bg-green-500'"
                          :style="{ width: Math.min(Math.abs(getMergedChangeRate(item)) * 100, 100) + '%' }"
                        ></div>
                      </div>
                      <span :class="['text-sm font-bold font-mono tabular-nums', getMergedChangeRate(item) >= 0 ? 'text-red-600' : 'text-green-600']">
                        {{ formatRate(getMergedChangeRate(item)) }}
                      </span>
                    </div>
                  </template>
                  <span v-else class="text-sm text-gray-400">—</span>
                </td>
                <td>
                  <span
                    v-if="isMergedPriced(item)"
                    :class="['inline-block text-xs font-medium px-2 py-0.5 rounded-full', getMergedChangeRate(item) > 0 ? 'bg-red-100 text-red-700' : getMergedChangeRate(item) < 0 ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600']"
                  >
                    {{ getMergedChangeRate(item) > 0 ? '盈利' : getMergedChangeRate(item) < 0 ? '亏损' : '持平' }}
                  </span>
                  <span v-else class="inline-block text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">未标价</span>
                </td>
                <td class="text-right font-mono tabular-nums px-2 whitespace-nowrap">
                  <span
                    v-if="isMergedPriced(item)"
                    class="text-sm font-bold"
                    :class="getMergedProfit(item) > 0 ? 'text-red-600' : getMergedProfit(item) < 0 ? 'text-green-600' : 'text-gray-600'"
                  >{{ formatProfit(getMergedProfit(item)) }}</span>
                  <span v-else class="text-sm text-gray-400">—</span>
                </td>
                <td>
                  <div class="flex items-center gap-1">
                    <button class="btn btn-outline btn-sm !text-xs !px-3" @click="openPriceModal(item)">
                      <i class="fa-solid fa-pen mr-1"></i>{{ isMergedPriced(item) ? '更新' : '标价' }}
                    </button>
                    <button
                      v-if="isMergedPriced(item)"
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
              <!-- 合并明细展开行 -->
              <tr v-for="(raw, ri) in (expandedMergeName === item.name ? (item.rawItems || []) : [])" :key="'raw-' + (raw.id || ri)" v-if="!collapsedBrands.has(group.brand)" class="bg-gray-50/40 border-b border-gray-100">
                <td colspan="7" class="px-4 py-2 pl-14">
                  <div class="flex items-center gap-4 text-xs text-gray-600">
                    <span class="font-mono text-gray-400">{{ raw.sid }}</span>
                    <span>成本: {{ formatPrice(raw.cost) }}</span>
                    <span v-if="raw.batch">批次: {{ raw.batch }}</span>
                    <span v-if="raw.isDefect" class="text-amber-600">品相问题</span>
                  </div>
                </td>
              </tr>
              <!-- 历史时间线（展开行，折叠时隐藏） -->
              <tr v-for="hitem in [(expandedItemId && (item.id || item.sid) === expandedItemId) ? item : null].filter(Boolean)" :key="'h-' + (hitem?.id || hitem?.sid)" v-if="!collapsedBrands.has(group.brand)" class="bg-gray-50/80">
                <td colspan="7" class="px-4 py-3 pl-12">
                  <div class="text-xs font-semibold text-gray-600 mb-2">
                    <i class="fa-solid fa-clock-rotate-left mr-1.5"></i>市场价格历史 · {{ hitem?.name }}
                  </div>
                  <div class="relative pl-5" v-if="hitem?.marketPrices?.length">
                    <div class="absolute left-1 top-1.5 bottom-1.5 w-0.5 bg-gray-300"></div>
                    <div
                      v-for="(mp, mi) in hitem.marketPrices"
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
                      <span v-if="mi > 0 && hitem.marketPrices[mi - 1]" class="text-xs" :class="mp.price > hitem.marketPrices[mi - 1].price ? 'text-red-500' : 'text-green-500'">
                        {{ mp.price > hitem.marketPrices[mi - 1].price ? '↑' : '↓' }}{{ formatPrice(Math.abs(hitem.marketPrices[mi - 1].price - mp.price)) }}
                      </span>
                      <span v-if="mi === hitem.marketPrices.length - 1 && mi > 0" class="text-xs text-gray-400">首次标价</span>
                    </div>
                  </div>
                  <div v-else class="text-xs text-gray-400 pl-4">暂无历史记录</div>
                </td>
              </tr>
              </template>
            </template>
            <!-- 搜索结果为空 -->
            <tr v-if="sortedGroups.length === 0">
              <td colspan="7" class="px-4 py-8 text-center text-gray-400">
                <i class="fa-solid fa-search text-lg mb-2 block"></i>
                没有匹配的货品
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- ===== 5. 涨跌幅排行榜 ===== -->
      <div class="grid grid-cols-2 gap-4">
        <!-- 涨幅 TOP 10 -->
        <div class="apple-card p-4">
          <h3 class="text-sm font-semibold text-gray-700 mb-3">涨幅 TOP 10</h3>
          <div v-if="rankings.gainers.length > 0" class="space-y-1">
            <div
              v-for="(r, ri) in rankings.gainers"
              :key="ri"
              class="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-gray-50"
            >
              <span class="w-4 text-xs text-gray-400 text-right shrink-0">{{ ri + 1 }}</span>
              <div class="flex-1 min-w-0">
                <div class="text-sm font-medium truncate">{{ r.item.name }}</div>
                <div class="text-[11px] text-gray-400">{{ r.item.brand }} <span v-if="r.item.qty > 1" class="text-gray-300">· {{ r.item.qty }}件</span></div>
              </div>
              <span class="text-sm font-bold text-red-600">{{ formatRate(r.rate) }}</span>
            </div>
          </div>
          <div v-else class="text-xs text-gray-400 py-4 text-center">暂无数据</div>
        </div>
        <!-- 跌幅 TOP 10 -->
        <div class="apple-card p-4">
          <h3 class="text-sm font-semibold text-gray-700 mb-3">跌幅 TOP 10</h3>
          <div v-if="rankings.losers.length > 0" class="space-y-1">
            <div
              v-for="(r, ri) in rankings.losers"
              :key="ri"
              class="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-gray-50"
            >
              <span class="w-4 text-xs text-gray-400 text-right shrink-0">{{ ri + 1 }}</span>
              <div class="flex-1 min-w-0">
                <div class="text-sm font-medium truncate">{{ r.item.name }}</div>
                <div class="text-[11px] text-gray-400">{{ r.item.brand }} <span v-if="r.item.qty > 1" class="text-gray-300">· {{ r.item.qty }}件</span></div>
              </div>
              <span class="text-sm font-bold text-green-600">{{ formatRate(r.rate) }}</span>
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
        <div class="text-lg font-bold font-mono">{{ isMergedPriced(editingItem) ? formatPrice(editingItem.mergedPrice) : '未标价' }}</div>
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
