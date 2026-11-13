<script setup>
import { computed, ref } from 'vue'
import GlassModal from '../../components/GlassModal.vue'
import { markCarArchiveCloudSynced, parseCarArchiveText, readCarArchive, saveCarArchiveOnce } from '../../data/carHistoryArchive'
import { state, setCloudSession } from '../../data/store'
import { syncCarArchive } from '../../services/carArchiveCloud'

const open = ref(false)
const archive = ref(null)
const error = ref('')
const message = ref('')
const busy = ref(false)
const tab = ref('dashboard')
const dailyTab = ref('transactions')
const investTab = ref('garage')
const detailTab = ref('transfers')
const keyword = ref('')
const tabs = [ ['dashboard', "Payton's 数据"], ['daily', '日常消费'], ['invest', '投资小车'] ]

async function show() {
  error.value = ''
  try { archive.value = readCarArchive() } catch (e) { error.value = `本机档案读取失败：${e.message}` }
  open.value = true
  if (!archive.value?.cloudSyncedAt && state.cloudSettings.enabled && state.cloudSession?.accessToken) await sync()
}

async function importFile(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file) return
  error.value = ''; message.value = ''
  try {
    const data = parseCarArchiveText(await file.text())
    const date = file.name.match(/\d{4}-\d{2}-\d{2}/)?.[0] || ''
    archive.value = saveCarArchiveOnce({ sourceFile: file.name, archiveDate: date, importedAt: new Date().toISOString(), data })
    message.value = '档案已保存到本机。'
    if (state.cloudSettings.enabled && state.cloudSession?.accessToken) await sync()
  } catch (e) { error.value = `档案未导入：${e.message}` }
}

async function sync() {
  busy.value = true; error.value = ''; message.value = ''
  try {
    const local = readCarArchive()
    const cloud = await syncCarArchive(state.cloudSettings, state.cloudSession, local, setCloudSession)
    archive.value = saveCarArchiveOnce(cloud)
    archive.value = markCarArchiveCloudSynced()
    message.value = '档案已固化并同步到云端。'
  } catch (e) { error.value = e.message } finally { busy.value = false }
}

const rows = computed(() => {
  const d = archive.value?.data
  if (!d) return []
  const sources = { daily: d.accounts.pocket.transactions,
    keepGarage: d.cars.filter(car => car.category === 'keep'),
    transactions: d.accounts.invest.transactions, garage: d.cars.filter(car => car.category === 'invest'),
    loans: d.accounts.invest.loans, transfers: d.transferPairs,
    prices: Object.entries(d.expectedPrices).map(([name, value]) => ({ name, ...value })), logs: d.operationLogs }
  const source = tab.value === 'invest' ? investTab : tab.value === 'daily' ? (dailyTab === 'garage' ? 'keepGarage' : dailyTab) : tab.value === 'dashboard' ? detailTab : tab.value
  const q = keyword.value.trim().toLowerCase()
  return (sources[source] || []).filter(row => !q || JSON.stringify(row).toLowerCase().includes(q))
})
const metrics = computed(() => {
  const d = archive.value?.data
  if (!d) return { pocket: 0, invest: 0, debt: 0, fund: 0, investmentValue: 0, investmentExpected: 0, investmentCount: 0, keepValue: 0, keepExpected: 0, keepCount: 0 }
  const balance = txns => txns.reduce((sum, row) => sum + (row.type === 'income' ? 1 : row.type === 'expense' ? -1 : 0) * Number(row.amount || 0), 0)
  const pocket = balance(d.accounts.pocket.transactions), invest = balance(d.accounts.invest.transactions)
  const debt = d.accounts.invest.loans.filter(loan => loan.status === 'active').reduce((sum, loan) => sum + Number(loan.remaining || 0), 0)
  const active = d.cars.filter(car => !car.isSold)
  const investment = active.filter(car => car.category === 'invest'), keep = active.filter(car => car.category === 'keep')
  const value = list => list.reduce((sum, car) => sum + Number(car.buyPrice || 0), 0)
  const expected = list => list.reduce((sum, car) => sum + Number(car.expectedValue ?? car.buyPrice ?? 0), 0)
  return { pocket, invest, debt, fund: pocket + invest - debt, investmentValue: value(investment), investmentExpected: expected(investment), investmentCount: investment.length, keepValue: value(keep), keepExpected: expected(keep), keepCount: keep.length }
})
function category(value) { return ({ invest: '投资', keep: '自留', income: '收入', expense: '支出', active: '进行中', repaid: '已还清' })[value] || value || '—' }
function money(value) { return value == null ? '—' : `¥${Number(value).toFixed(2)}` }
</script>

<template>
  <div class="order-6 text-right px-2 pt-2">
    <button class="text-xs text-gray-400 hover:text-gray-600 underline" @click="show">car 历史档案</button>
    <GlassModal v-model="open" panel-class="w-full max-w-5xl p-5 max-h-[90vh] overflow-y-auto">
      <div class="flex flex-wrap justify-between items-start gap-3">
        <div><h3 class="text-xl font-bold text-gray-800">car 停用时历史档案</h3><p class="text-xs text-gray-500 mt-1">只读快照；与当前库存、销售和资金独立。</p></div>
        <button class="btn btn-outline btn-sm" @click="open = false">关闭</button>
      </div>
      <div class="mt-4 flex flex-wrap items-center gap-3">
        <label v-if="!archive" class="btn btn-outline btn-sm cursor-pointer">选择 car 备份<input type="file" accept=".json,application/json" class="hidden" @change="importFile"></label>
        <button v-if="!archive?.cloudSyncedAt" class="btn btn-outline btn-sm" :disabled="busy" @click="sync">{{ busy ? '正在同步…' : '首次同步到云端' }}</button>
        <span v-if="archive" class="text-xs text-gray-500">{{ archive.sourceFile }} · 档案日期 {{ archive.archiveDate || '未注明' }}<span v-if="archive.cloudSyncedAt"> · 已固化并同步</span></span>
      </div>
      <p v-if="error" class="mt-3 text-sm text-red-600">{{ error }}</p><p v-if="message" class="mt-3 text-sm text-green-700">{{ message }}</p>
      <p v-if="!archive" class="mt-5 text-sm text-gray-500">选择停用时的 car 备份，或登录后从云端恢复独立档案。</p>
      <template v-else>
        <div class="mt-4 flex flex-wrap gap-2"><button v-for="item in tabs" :key="item[0]" class="rounded-full px-3 py-1 text-sm" :class="tab === item[0] ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'" @click="tab = item[0]">{{ item[1] }}</button></div>
        <template v-if="tab === 'dashboard'">
          <div class="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div class="rounded-xl bg-gray-50 p-4"><div class="text-xs text-gray-500">零钱余额</div><div class="mt-1 text-xl font-bold">{{ money(metrics.pocket) }}</div></div>
            <div class="rounded-xl bg-gray-50 p-4"><div class="text-xs text-gray-500">投资账户余额</div><div class="mt-1 text-xl font-bold">{{ money(metrics.invest) }}</div></div>
            <div class="rounded-xl bg-gray-50 p-4"><div class="text-xs text-gray-500">投资车（{{ metrics.investmentCount }} 辆）</div><div class="mt-1 text-xl font-bold">{{ money(metrics.investmentValue) }}</div><div class="text-xs text-gray-500">预期 {{ money(metrics.investmentExpected) }}</div></div>
            <div class="rounded-xl bg-gray-50 p-4"><div class="text-xs text-gray-500">自留车（{{ metrics.keepCount }} 辆）</div><div class="mt-1 text-xl font-bold">{{ money(metrics.keepValue) }}</div><div class="text-xs text-gray-500">预期 {{ money(metrics.keepExpected) }}</div></div>
          </div>
          <div class="mt-3 rounded-xl border border-purple-100 bg-purple-50 p-4">
            <div class="flex justify-between font-semibold"><span>Payton's 基金</span><span>{{ money(metrics.fund) }}</span></div>
            <div class="mt-2 text-xs text-gray-600">零钱 {{ money(metrics.pocket) }} + 投资 {{ money(metrics.invest) }} − 贷款剩余 {{ money(metrics.debt) }} = 基金 {{ money(metrics.fund) }}</div>
          </div>
          <div class="mt-4">
            <h4 class="font-semibold">贷款</h4>
            <div v-if="!archive.data.accounts.invest.loans.length" class="mt-2 text-sm text-gray-500">没有贷款记录</div>
            <article v-for="loan in archive.data.accounts.invest.loans" :key="loan.id" class="mt-2 rounded-lg bg-gray-50 px-3 py-2 text-sm">
              <div class="font-medium">{{ loan.name || '贷款' }} · {{ category(loan.status) }} · 剩余 {{ money(loan.remaining) }}</div><div class="text-xs text-gray-500">{{ loan.startDate || '—' }} 至 {{ loan.dueDate || '—' }} · {{ loan.note || '' }}</div>
            </article>
          </div>
          <details class="mt-4 rounded-lg border border-gray-100 p-3">
            <summary class="cursor-pointer text-sm font-semibold">更多历史明细</summary>
            <div class="mt-3 flex flex-wrap gap-2"><button v-for="item in [['transfers','账户互转'],['prices','预期价格'],['logs','操作日志']]" :key="item[0]" class="rounded-full px-3 py-1 text-xs" :class="detailTab === item[0] ? 'bg-gray-700 text-white' : 'bg-gray-100 text-gray-600'" @click.prevent="detailTab = item[0]">{{ item[1] }}</button></div>
            <input v-model="keyword" class="apple-input mt-3" placeholder="搜索日期或内容" />
            <div class="mt-2 space-y-2"><article v-for="(row,index) in rows" :key="index" class="rounded-lg bg-gray-50 px-3 py-2 text-xs"><template v-if="detailTab==='transfers'">{{ row.date }} · {{ category(row.fromAccount) }} → {{ category(row.toAccount) }} · {{ money(row.amount) }} · {{ row.note }}</template><template v-else-if="detailTab==='prices'">{{ row.name }} · {{ money(row.value) }} · {{ row.date || '—' }}</template><template v-else>{{ row.time }} · {{ row.message || row.type }}</template><details class="mt-1"><summary class="cursor-pointer text-gray-500">原始详情</summary><pre class="whitespace-pre-wrap break-all">{{ JSON.stringify(row,null,2) }}</pre></details></article></div>
          </details>
        </template>
        <template v-else>
          <div v-if="tab === 'daily'" class="mt-4 flex gap-2"><button v-for="item in [['transactions','收支明细'],['garage','自留车库']]" :key="item[0]" class="rounded-full px-3 py-1 text-sm" :class="dailyTab === item[0] ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'" @click="dailyTab = item[0]">{{ item[1] }}</button></div>
          <div v-if="tab === 'invest'" class="mt-4 flex gap-2"><button v-for="item in [['garage','投资车库'],['transactions','投资明细']]" :key="item[0]" class="rounded-full px-3 py-1 text-sm" :class="investTab === item[0] ? 'bg-purple-600 text-white' : 'bg-gray-100 text-gray-600'" @click="investTab = item[0]">{{ item[1] }}</button></div>
          <input v-model="keyword" class="apple-input mt-3" :placeholder="tab === 'daily' ? (dailyTab === 'garage' ? '搜索自留车名称或 SID' : '搜索日常收支') : (investTab === 'garage' ? '搜索投资车名称或 SID' : '搜索投资账户明细')" />
          <p class="text-xs text-gray-500 mt-2">共 {{ rows.length }} 条</p>
          <div class="mt-2 space-y-2">
            <article v-for="(row,index) in rows" :key="index" class="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-sm">
              <template v-if="(tab === 'invest' && investTab === 'garage') || (tab === 'daily' && dailyTab === 'garage')"><div class="font-semibold">{{ row.name }} <span class="font-normal text-gray-500">{{ row.sid }}</span></div><div class="mt-1 text-xs text-gray-600">{{ row.brand }} · {{ row.isSold ? '已售' : '未售' }} · 购入 {{ row.buyDate || '—' }} {{ money(row.buyPrice) }}<span v-if="row.isSold"> · 售出 {{ row.soldDate || '—' }} {{ money(row.sellPrice) }}</span> · 预期 {{ money(row.expectedValue) }}</div><div v-if="row.note" class="text-xs text-gray-500">{{ row.note }}</div></template>
              <template v-else><div>{{ row.date }} · {{ category(row.type) }} · {{ money(row.amount) }} · {{ row.note || row.category || '—' }}</div><div class="text-xs text-gray-500">{{ row.carSid || '' }}</div></template>
              <details class="mt-1 text-xs text-gray-500"><summary class="cursor-pointer">原始详情</summary><pre class="whitespace-pre-wrap break-all mt-1">{{ JSON.stringify(row, null, 2) }}</pre></details>
            </article>
          </div>
          <p v-if="!rows.length" class="mt-4 rounded-lg bg-gray-50 p-4 text-center text-sm text-gray-500">{{ keyword ? '没有找到匹配记录，请检查搜索内容。' : '此分类没有历史记录。' }}</p>
        </template>
      </template>
    </GlassModal>
  </div>
</template>
