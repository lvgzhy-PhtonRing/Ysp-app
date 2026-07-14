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
  const sign = v > 0 ? '+' : ''
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
                v-for="item in [group.items.find(i => (i.id || i.sid) === expandedItemId)].filter(Boolean)"
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
