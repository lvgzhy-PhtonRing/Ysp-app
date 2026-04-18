<script setup>
import { computed, ref } from 'vue'
import GlassModal from '../../components/GlassModal.vue'
import { addOperationLog, saveToLocalStorage, state as store } from '../../data/store'
import {
  getBatchReturnStats,
  getLast3MonthsStats,
  getMonthStats,
  getPurchaseStatus,
  searchItems,
} from './useHomeInsights'

const now = computed(() => new Date())
const todayDate = computed(() => now.value.toISOString().slice(0, 10))

const soldItems = computed(() => store.items.filter((i) => i?.status === 'sold'))
const inventoryItems = computed(() => store.items.filter((i) => i?.status === 'inventory'))

const monthStats = computed(() => getMonthStats(store.items, now.value))
const last3MonthsStats = computed(() => getLast3MonthsStats(store.items, now.value))
const purchaseStats = computed(() => getPurchaseStatus(store.items))

const inventoryValue = computed(() => inventoryItems.value.reduce((s, i) => s + Number(i?.cost || 0), 0))
const inventoryCount = computed(() => inventoryItems.value.length)
const longTermItems = computed(() =>
  inventoryItems.value.filter((i) => i?.status === 'inventory' && i?.isLongTerm === true),
)
const longTermValue = computed(() => longTermItems.value.reduce((s, i) => s + Number(i?.cost || 0), 0))
const longTermCount = computed(() => longTermItems.value.length)

const totalActualProfit = computed(() =>
  soldItems.value.reduce((s, i) => s + Number(i?.saleDetails?.profit || 0), 0),
)
const soldCost = computed(() => soldItems.value.reduce((s, i) => s + Number(i?.cost || 0), 0))
const totalProfitMargin = computed(() => (soldCost.value > 0 ? totalActualProfit.value / soldCost.value : 0))

const financeLoanBalance = computed(() =>
  store.loanRecords.reduce((sum, l) => {
    const repaid = typeof l?.isRepaid === 'boolean' ? l.isRepaid : !!l?.repaid
    if (repaid) return sum
    if (l?.type === 'borrow') return sum + Number(l?.amount || 0)
    if (l?.type === 'lend') return sum - Number(l?.amount || 0)
    return sum
  }, 0),
)

const financePublicExpense = computed(() =>
  store.financeRecords
    .filter((r) => r?.type === 'expense')
    .reduce((s, r) => s + Number(r?.amount || 0), 0),
)

const paytonYebBalance = computed(() => Number(store.paytonAccounts?.yeb?.balance || 0))

const alipayBalance = computed(() => {
  return (
    Number(store.calc.debt || 0) +
    financeLoanBalance.value +
    totalActualProfit.value -
    inventoryValue.value -
    financePublicExpense.value -
    Number(store.calc.unconfirmed || 0) +
    paytonYebBalance.value -
    purchaseStats.value.totalCost
  )
})

const searchKeyword = ref('')
const searchResults = computed(() => searchItems(store.items, searchKeyword.value))
const totalSearchCount = computed(() => searchResults.value.reduce((sum, item) => sum + Number(item?._groupCount || 1), 0))
const mergedGroupCount = computed(() => searchResults.value.length)
const batchReturnStats = computed(() => getBatchReturnStats(store.items))
const selectedItem = ref(null)
const showItemDetailModal = ref(false)
const batchStatsCollapsed = ref(true)

function fmtMoney(v) {
  return Number(v || 0).toFixed(2)
}

function fmtNum(v) {
  return Number(v || 0).toFixed(2)
}

function persistCalc(field) {
  saveToLocalStorage()
  addOperationLog('home_calc', `更新支付宝计算参数: ${field}`, { field, value: store.calc[field] })
}

function returnRateStyle(rate) {
  if (Number(rate) >= 100) return { color: '#16a34a' }
  if (Number(rate) >= 50) return { color: '#9ca3af' }
  return { color: '#d1d5db' }
}

function showItemDetail(item) {
  if (item?._isMerged && Array.isArray(item?._groupItems) && item._groupItems.length > 0) {
    selectedItem.value = {
      ...item._groupItems[0],
      _isMerged: true,
      _groupCount: item._groupCount,
      _groupTotalCost: item._groupTotalCost,
      _groupItems: item._groupItems,
    }
  } else {
    selectedItem.value = item
  }
  showItemDetailModal.value = true
}

function statusText(status) {
  if (status === 'inventory') return '库存'
  if (status === 'sold') return '已售'
  if (status === 'purchase') return '采购中'
  return status || '-'
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex justify-between items-end">
      <div class="flex items-baseline gap-3">
        <h2 class="text-3xl font-extrabold">数据透视</h2>
        <span class="text-base text-gray-400 font-light">Data Insights</span>
      </div>
      <div class="text-sm text-gray-400">当前日期: {{ todayDate }}</div>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div class="apple-card">
        <h3 class="text-lg font-semibold mb-4 text-gray-800">本月数据</h3>
        <div class="grid grid-cols-2 gap-4">
          <div class="bg-gray-50 p-4 rounded-xl border-l-4 border-primary">
            <div class="text-xs text-gray-500 mb-1">月销售额</div>
            <div class="text-2xl font-bold text-gray-800">{{ fmtMoney(monthStats.revenue) }}</div>
          </div>
          <div class="bg-gray-50 p-4 rounded-xl border-l-4 border-warning">
            <div class="text-xs text-gray-500 mb-1">对应投入成本</div>
            <div class="text-2xl font-bold text-gray-800">{{ fmtMoney(monthStats.cost) }}</div>
          </div>
        </div>
        <div class="mt-4 bg-gray-50 p-4 rounded-xl border-l-4 border-gray-400">
          <div class="text-xs text-gray-500 mb-1">月利润</div>
          <div class="text-3xl font-bold" :class="monthStats.profit >= 0 ? 'text-gray-700' : 'text-danger'">
            {{ fmtMoney(monthStats.profit) }}
          </div>
        </div>
      </div>

      <div class="apple-card">
        <h3 class="text-lg font-semibold mb-4 text-gray-800">近三个月销售数据</h3>
        <div class="overflow-x-auto">
          <table class="apple-table text-sm">
            <thead>
              <tr>
                <th>月份</th><th class="text-right">件数</th><th class="text-right">回款</th>
                <th class="text-right">成本</th><th class="text-right">利润</th><th class="text-right">利润率</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="m in last3MonthsStats" :key="m.year + '-' + m.month">
                <td>{{ m.year }}/{{ m.month }}</td>
                <td class="text-right">{{ m.count }}</td>
                <td class="text-right">{{ fmtMoney(m.revenue) }}</td>
                <td class="text-right">{{ fmtMoney(m.cost) }}</td>
                <td class="text-right" :class="m.profit >= 0 ? 'text-gray-700' : 'text-danger'">{{ fmtMoney(m.profit) }}</td>
                <td class="text-right">{{ m.cost > 0 ? fmtNum((m.profit / m.cost) * 100) + '%' : '-' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <div class="apple-card">
      <div class="flex items-center justify-between bg-gradient-to-r from-yellow-100 via-yellow-50 to-orange-50 p-4 rounded-xl border border-yellow-300">
        <div class="flex items-baseline gap-2">
          <div class="text-5xl font-extrabold text-warning drop-shadow-sm">{{ fmtMoney(purchaseStats.inProgressAmount) }}</div>
          <div class="text-sm text-yellow-800 font-medium">采购中金额（含转运费）</div>
        </div>
        <div class="flex gap-6">
          <div class="text-center">
            <div class="text-3xl font-bold text-warning">{{ purchaseStats.count }}</div>
            <div class="text-xs text-gray-600">采购中(件)</div>
          </div>
          <div class="text-center">
            <div class="text-3xl font-bold text-gray-700">{{ purchaseStats.pendingCount }}</div>
            <div class="text-xs text-gray-600">待转运(件)</div>
          </div>
        </div>
      </div>
      <div class="mt-3 flex gap-6 text-sm text-gray-500">
        <div>累计采购: <span class="font-medium text-warning">{{ fmtMoney(purchaseStats.purchaseAmount) }}</span></div>
        <div>累计转运: <span class="font-medium text-teal">{{ fmtMoney(purchaseStats.transferAmount) }}</span></div>
      </div>
    </div>

    <div class="apple-card bg-gradient-to-br from-blue-50 to-white border-2 border-blue-100 shadow-lg p-8 md:p-10">
      <div class="grid grid-cols-3 gap-4 md:gap-6">
        <div class="flex flex-col justify-center text-center p-4 bg-white rounded-lg shadow-sm border border-gray-100 h-40">
          <div class="text-sm text-gray-500 mb-2 font-medium">库存总货值</div>
          <div class="text-5xl md:text-6xl font-extrabold text-primary tracking-tighter">{{ fmtMoney(inventoryValue) }}</div>
          <div class="text-lg text-gray-400 mt-1">库存 {{ inventoryCount }} 件</div>
        </div>
        <div class="flex flex-col justify-center text-center p-4 bg-white rounded-lg shadow-sm border border-gray-100 h-40">
          <div class="text-sm text-gray-500 mb-2 font-medium">上架短线货值</div>
          <div class="text-5xl md:text-6xl font-extrabold text-purple-600 tracking-tighter">{{ fmtMoney(inventoryValue - longTermValue) }}</div>
          <div class="text-lg text-gray-400 mt-1">库存 {{ inventoryCount - longTermCount }} 件</div>
        </div>
        <div class="flex flex-col justify-center text-center p-4 bg-white rounded-lg shadow-sm border border-gray-100 h-40">
          <div class="text-sm text-gray-500 mb-2 font-medium">总实盈利润</div>
          <div class="text-5xl md:text-6xl font-extrabold tracking-tighter" :class="totalActualProfit >= 0 ? 'text-success' : 'text-danger'">{{ fmtMoney(totalActualProfit) }}</div>
          <div class="text-lg text-gray-400 mt-1">利润率 {{ fmtNum(totalProfitMargin * 100) }}%</div>
        </div>
      </div>
    </div>

    <div class="apple-card bg-gradient-to-br from-white to-gray-50 border-blue-100">
      <h3 class="text-lg font-semibold mb-4 text-blue-800"><i class="fa-brands fa-alipay text-blue-500 mr-2 text-xl"></i>支付宝余额计算器</h3>
      <div class="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        <div>
          <label class="text-xs text-gray-500">挖财总负债</label>
          <input type="number" v-model.number="store.calc.debt" class="apple-input mt-1" @change="persistCalc('debt')" />
        </div>
        <div><label class="text-xs text-gray-500">借贷余额</label><div class="mt-2 text-lg font-bold text-gray-700">{{ fmtMoney(financeLoanBalance) }}</div></div>
        <div><label class="text-xs text-gray-500">公共支出</label><div class="mt-2 text-lg font-bold text-gray-700">{{ fmtMoney(financePublicExpense) }}</div></div>
        <div>
          <label class="text-xs text-gray-500">未确认交易</label>
          <input type="number" v-model.number="store.calc.unconfirmed" class="apple-input mt-1" @change="persistCalc('unconfirmed')" />
        </div>
        <div><label class="text-xs text-gray-500">Payton's基金</label><div class="mt-2 text-lg font-bold text-gray-600">{{ fmtMoney(paytonYebBalance) }}</div></div>
      </div>
      <div class="flex items-center justify-between bg-white p-4 rounded-xl shadow-sm border border-blue-50">
        <div class="text-sm font-medium text-gray-700">应有支付宝余额</div>
        <div class="text-2xl font-bold text-primary">{{ fmtMoney(alipayBalance) }}</div>
      </div>
    </div>

    <div class="apple-card">
      <h3 class="text-lg font-semibold mb-4 text-gray-800"><i class="fa-solid fa-magnifying-glass text-blue-500 mr-2"></i>商品查询器</h3>
      <div class="mb-4"><input type="text" v-model="searchKeyword" placeholder="输入SID/名称/品牌搜索（不区分大小写）" class="apple-input" /></div>
      <div v-if="searchResults.length > 0" class="mt-4">
        <div class="text-sm text-gray-500 mb-2">找到 {{ totalSearchCount }} 条记录（合并后 {{ mergedGroupCount }} 组）：</div>
        <div class="space-y-2 max-h-[920px] overflow-y-auto">
          <div v-for="(item, idx) in searchResults" :key="idx" @click="showItemDetail(item)" class="p-3 bg-gray-50 rounded-lg hover:bg-gray-100 cursor-pointer flex justify-between items-center">
            <div>
              <div class="font-medium text-sm">{{ item.name }}</div>
              <div class="text-xs text-gray-500">
                SID: {{ item.sid }}
                <template v-if="item._isMerged"> | 数量: x{{ item._groupCount }} | 单件: {{ fmtMoney(item.cost) }} | 合计: {{ fmtMoney(item._groupTotalCost) }}</template>
                <template v-else> | 成本: {{ fmtMoney(item.cost) }}</template>
              </div>
              <div v-if="item._searchMatchTypes?.length" class="mt-1 flex flex-wrap gap-1">
                <span
                  v-for="tag in item._searchMatchTypes"
                  :key="tag"
                  class="text-[10px] px-2 py-0.5 rounded-full bg-blue-100 text-blue-700"
                >
                  {{ tag }}
                </span>
              </div>
            </div>
            <span :class="{'bg-green-100 text-green-700': item.status === 'inventory', 'bg-blue-100 text-blue-700': item.status === 'purchase', 'bg-gray-100 text-gray-600': item.status === 'sold'}" class="text-xs px-2 py-1 rounded">
              {{ statusText(item.status) }}
            </span>
          </div>
        </div>
      </div>
    </div>

    <div class="apple-card">
      <h3 class="text-lg font-semibold mb-4 text-gray-800 cursor-pointer select-none" @click="batchStatsCollapsed = !batchStatsCollapsed"><i class="fa-solid fa-chart-line text-blue-500 mr-2"></i>各批次回款统计 <span class="text-xs text-gray-400">{{ batchStatsCollapsed ? '▼' : '▲' }}</span></h3>
      <div class="overflow-x-auto" v-show="!batchStatsCollapsed">
        <table class="apple-table text-sm w-full">
          <thead><tr><th>批次</th><th class="text-right">总成本</th><th class="text-right">回款</th><th class="text-right">回款比例</th></tr></thead>
          <tbody>
            <template v-for="b in batchReturnStats" :key="b.category + b.batch">
              <tr v-if="b.isSummary" class="bg-blue-50 font-bold border-t-2 border-blue-200"><td class="text-blue-700">汇总</td><td class="text-right text-blue-700">{{ fmtMoney(b.totalCost) }}</td><td class="text-right text-blue-700">{{ fmtMoney(b.revenue) }}</td><td class="text-right text-blue-700">{{ fmtNum(b.rate) }}%</td></tr>
              <tr v-else-if="b.isCategory" class="bg-gray-100 font-bold"><td style="color:#9ca3af">{{ b.category }}</td><td class="text-right" style="color:#9ca3af">{{ fmtMoney(b.totalCost) }}</td><td class="text-right" style="color:#9ca3af">{{ fmtMoney(b.revenue) }}</td><td class="text-right" :style="returnRateStyle(b.rate)">{{ fmtNum(b.rate) }}%</td></tr>
              <tr v-else><td class="pl-6" style="color:#9ca3af">{{ b.batch }}</td><td class="text-right" style="color:#9ca3af">{{ fmtMoney(b.totalCost) }}</td><td class="text-right" style="color:#9ca3af">{{ fmtMoney(b.revenue) }}</td><td class="text-right font-medium" :style="returnRateStyle(b.rate)">{{ fmtNum(b.rate) }}%</td></tr>
            </template>
          </tbody>
        </table>
      </div>
    </div>

    <GlassModal v-model="showItemDetailModal" panel-class="w-full max-w-2xl p-5">
      <div class="mb-4 text-lg font-semibold">商品详情</div>
      <div v-if="selectedItem" class="space-y-3 text-sm">
        <div class="grid grid-cols-2 gap-4">
          <div><span class="text-gray-500">SID：</span>{{ selectedItem.sid || '-' }}</div>
          <div><span class="text-gray-500">名称：</span>{{ selectedItem.name || '-' }}</div>
          <div><span class="text-gray-500">品牌：</span>{{ selectedItem.brand || '-' }}</div>
          <div><span class="text-gray-500">大类/批次：</span>{{ selectedItem.category || '-' }} / {{ selectedItem.batch || '-' }}</div>
          <div><span class="text-gray-500">状态：</span>{{ statusText(selectedItem.status) }}</div>
          <div><span class="text-gray-500">成本：</span><span class="font-medium text-warning">{{ fmtMoney(selectedItem.cost) }}</span></div>
        </div>

        <div v-if="selectedItem._isMerged" class="bg-indigo-50 p-3 rounded-lg border border-indigo-100">
          <div class="font-medium text-indigo-700 mb-2">合并组信息</div>
          <div class="text-xs text-gray-600 mb-2">当前展示为合并记录：共 {{ selectedItem._groupCount }} 条，合计成本 {{ fmtMoney(selectedItem._groupTotalCost) }}</div>
          <div class="max-h-40 overflow-y-auto border border-indigo-100 rounded bg-white">
            <div v-for="(gi, gidx) in selectedItem._groupItems" :key="gi.id || gidx" class="px-3 py-2 border-b last:border-b-0 text-xs text-gray-600">
              #{{ gidx + 1 }} | ID: {{ gi.id }} | 成本: {{ fmtMoney(gi.cost) }} | 转运批次: {{ gi.purchaseDetails?.transferBatch || '-' }}
            </div>
          </div>
        </div>

        <div v-if="selectedItem.purchaseDetails && (selectedItem.purchaseDetails.date || selectedItem.purchaseDetails.website || selectedItem.purchaseDetails.originalPrice)" class="bg-blue-50 p-3 rounded-lg border border-blue-100">
          <div class="font-medium text-blue-700 mb-2">采购信息</div>
          <div class="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs">
            <div v-if="selectedItem.purchaseDetails.date"><span class="text-gray-500">采购日期：</span>{{ selectedItem.purchaseDetails.date }}</div>
            <div v-if="selectedItem.purchaseDetails.website"><span class="text-gray-500">官网：</span>{{ selectedItem.purchaseDetails.website }}</div>
            <div v-if="selectedItem.purchaseDetails.websiteAccount"><span class="text-gray-500">官网账号：</span>{{ selectedItem.purchaseDetails.websiteAccount }}</div>
            <div v-if="selectedItem.purchaseDetails.originalPrice"><span class="text-gray-500">官网原价：</span>{{ fmtMoney(selectedItem.purchaseDetails.originalPrice) }}</div>
            <div v-if="selectedItem.purchaseDetails.domesticShipping"><span class="text-gray-500">国内运费：</span>{{ fmtMoney(selectedItem.purchaseDetails.domesticShipping) }}</div>
            <div v-if="selectedItem.purchaseDetails.fee"><span class="text-gray-500">手续费：</span>{{ fmtMoney(selectedItem.purchaseDetails.fee) }}</div>
            <div v-if="selectedItem.purchaseDetails.exchangeRate"><span class="text-gray-500">汇率：</span>{{ Number(selectedItem.purchaseDetails.exchangeRate).toFixed(4) }}</div>
            <div v-if="selectedItem.purchaseDetails.preTransferCost"><span class="text-gray-500">转运前成本：</span>{{ fmtMoney(selectedItem.purchaseDetails.preTransferCost) }}</div>
            <div v-if="selectedItem.purchaseDetails.transferCost"><span class="text-gray-500">转运费：</span>{{ fmtMoney(selectedItem.purchaseDetails.transferCost) }}</div>
            <div v-if="selectedItem.purchaseDetails.transferBatch"><span class="text-gray-500">转运批次：</span>{{ selectedItem.purchaseDetails.transferBatch }}</div>
            <div v-if="selectedItem.purchaseDetails.totalRMB" class="col-span-full"><span class="text-gray-500">总人民币：</span><span class="font-bold text-orange-600">{{ fmtMoney(selectedItem.purchaseDetails.totalRMB) }}</span></div>
            <div v-if="selectedItem.purchaseDetails.paymentAccount"><span class="text-gray-500">付款账号：</span>{{ selectedItem.purchaseDetails.paymentAccount }}</div>
            <div v-if="selectedItem.purchaseDetails.paymentBatch"><span class="text-gray-500">付款批次：</span>{{ selectedItem.purchaseDetails.paymentBatch }}</div>
          </div>
        </div>

        <div v-if="selectedItem.saleDetails" class="bg-green-50 p-3 rounded-lg border border-green-100">
          <div class="font-medium text-green-700 mb-2">销售信息</div>
          <div class="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
            <div><span class="text-gray-500">销售日期：</span>{{ selectedItem.saleDetails.date || '-' }}</div>
            <div><span class="text-gray-500">售价：</span>{{ fmtMoney(selectedItem.saleDetails.price) }}</div>
            <div><span class="text-gray-500">运费：</span>{{ fmtMoney(selectedItem.saleDetails.express || 0) }}</div>
            <div><span class="text-gray-500">利润：</span><span :class="Number(selectedItem.saleDetails.profit) >= 0 ? 'text-green-600' : 'text-red-600'">{{ fmtMoney(selectedItem.saleDetails.profit) }}</span></div>
          </div>
        </div>
      </div>
      <div class="mt-4 flex justify-end">
        <button class="btn btn-outline" @click="showItemDetailModal = false">关闭</button>
      </div>
    </GlassModal>
  </div>
</template>
