<script setup>
import { computed, ref } from 'vue'
import GlassModal from '../../components/GlassModal.vue'
import { parseCarArchiveText, readCarArchive, saveCarArchiveOnce } from '../../data/carHistoryArchive'
import { state, setCloudSession } from '../../data/store'
import { syncCarArchive } from '../../services/carArchiveCloud'

const open = ref(false)
const archive = ref(null)
const error = ref('')
const message = ref('')
const busy = ref(false)
const tab = ref('cars')
const keyword = ref('')
const tabs = [ ['cars', '车辆'], ['pocket', '零钱流水'], ['invest', '投资流水'], ['loans', '贷款'], ['transfers', '互转'], ['prices', '预期价格'], ['logs', '操作日志'] ]

async function show() {
  error.value = ''
  try { archive.value = readCarArchive() } catch (e) { error.value = `本机档案读取失败：${e.message}` }
  open.value = true
  if (state.cloudSettings.enabled && state.cloudSession?.accessToken) await sync()
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
    message.value = '档案已保存到本机；可使用“同步独立档案”保存到云端。'
    if (state.cloudSettings.enabled && state.cloudSession?.accessToken) await sync()
  } catch (e) { error.value = `档案未导入：${e.message}` }
}

async function sync() {
  busy.value = true; error.value = ''; message.value = ''
  try {
    const local = readCarArchive()
    const cloud = await syncCarArchive(state.cloudSettings, state.cloudSession, local, setCloudSession)
    archive.value = saveCarArchiveOnce(cloud)
    message.value = '独立档案已与云端核对一致。'
  } catch (e) { error.value = e.message } finally { busy.value = false }
}

const rows = computed(() => {
  const d = archive.value?.data
  if (!d) return []
  const sources = { cars: d.cars, pocket: d.accounts.pocket.transactions, invest: d.accounts.invest.transactions,
    loans: d.accounts.invest.loans, transfers: d.transferPairs,
    prices: Object.entries(d.expectedPrices).map(([name, value]) => ({ name, ...value })), logs: d.operationLogs }
  const q = keyword.value.trim().toLowerCase()
  return (sources[tab.value] || []).filter(row => !q || JSON.stringify(row).toLowerCase().includes(q))
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
        <button class="btn btn-outline btn-sm" :disabled="busy" @click="sync">{{ busy ? '正在同步…' : '同步独立档案' }}</button>
        <span v-if="archive" class="text-xs text-gray-500">{{ archive.sourceFile }} · 档案日期 {{ archive.archiveDate || '未注明' }}</span>
      </div>
      <p v-if="error" class="mt-3 text-sm text-red-600">{{ error }}</p><p v-if="message" class="mt-3 text-sm text-green-700">{{ message }}</p>
      <p v-if="!archive" class="mt-5 text-sm text-gray-500">选择停用时的 car 备份，或登录后从云端恢复独立档案。</p>
      <template v-else>
        <div class="mt-4 flex flex-wrap gap-2"><button v-for="item in tabs" :key="item[0]" class="rounded-full px-3 py-1 text-sm" :class="tab === item[0] ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'" @click="tab = item[0]">{{ item[1] }}</button></div>
        <input v-model="keyword" class="apple-input mt-3" placeholder="搜索名称、SID、日期或其它内容" />
        <p class="text-xs text-gray-500 mt-2">共 {{ rows.length }} 条</p>
        <div class="mt-2 space-y-2">
          <article v-for="(row, index) in rows" :key="index" class="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-sm">
            <template v-if="tab === 'cars'"><div class="font-semibold">{{ row.name }} <span class="font-normal text-gray-500">{{ row.sid }}</span></div><div class="mt-1 text-xs text-gray-600">{{ row.brand }} · {{ category(row.category) }} · {{ row.isSold ? '已售' : '未售' }} · 购入 {{ row.buyDate || '—' }} {{ money(row.buyPrice) }}<span v-if="row.isSold"> · 售出 {{ row.soldDate || '—' }} {{ money(row.sellPrice) }}</span></div><div v-if="row.note" class="text-xs text-gray-500">{{ row.note }}</div></template>
            <template v-else-if="tab === 'pocket' || tab === 'invest'"><div>{{ row.date }} · {{ category(row.type) }} · {{ money(row.amount) }} · {{ row.note || row.category || '—' }}</div><div class="text-xs text-gray-500">{{ row.carSid || '' }}</div></template>
            <template v-else-if="tab === 'loans'"><div>{{ row.name }} · {{ category(row.status) }} · 剩余 {{ money(row.remaining) }} / {{ money(row.amount) }}</div><div class="text-xs text-gray-500">{{ row.startDate || '—' }} 至 {{ row.dueDate || '—' }} · {{ row.note || '' }}</div></template>
            <template v-else-if="tab === 'transfers'"><div>{{ row.date }} · {{ category(row.fromAccount) }} → {{ category(row.toAccount) }} · {{ money(row.amount) }} · {{ row.note || '' }}</div></template>
            <template v-else-if="tab === 'prices'"><div>{{ row.name }} · {{ money(row.value) }} · {{ row.date || '—' }}</div></template>
            <template v-else><div>{{ row.time }} · {{ row.message || row.type }}</div></template>
            <details class="mt-1 text-xs text-gray-500"><summary class="cursor-pointer">原始详情</summary><pre class="whitespace-pre-wrap break-all mt-1">{{ JSON.stringify(row, null, 2) }}</pre></details>
          </article>
        </div>
      </template>
    </GlassModal>
  </div>
</template>
