<script setup>
import { computed, reactive, ref } from 'vue'
import { state } from '../../data/store'
import {
  addPaytonExpense, addPaytonLoanEvent, addPaytonTransfer,
  createPaytonLoan, deletePaytonExpense, deletePaytonLoanEvent, deletePaytonTransfer,
  getPaytonFund, updatePaytonExpense, updatePaytonTransfer,
} from './usePaytonFinance'

const tabs = ['零花收支', '买车支出', '贷款清单', '零钱↔投资互转']
const activeTab = ref(tabs[0])
const owner = computed(() => state.ownerRegistry.payton || {})
const loans = computed(() => owner.value.loans || [])
const transfers = computed(() => owner.value.accountTransfers || [])
const records = computed(() => state.financeRecords.filter((record) => record.owner === 'payton').sort((a, b) => String(b.date).localeCompare(String(a.date))))
const expenseItems = computed(() => [...new Set(records.value.map((record) => String(record.item || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'zh-CN')))
const now = new Date()
const purchaseMonth = ref(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`)
const carPurchases = computed(() => state.items
  .map((item, sourceIndex) => ({ item, sourceIndex }))
  .filter(({ item }) => item?.owner === 'payton' && item?.status !== 'purchase' && String(item?.inventoryDetails?.inStockDate || '').slice(0, 7) === purchaseMonth.value)
  .map(({ item, sourceIndex }) => ({
    sourceIndex,
    ...item,
    purchaseDate: item.inventoryDetails.inStockDate,
    purchaseCost: item.purchaseDetails?.preTransferCost == null ? null : Number(item.purchaseDetails.preTransferCost),
    transferCost: item.purchaseDetails?.transferCost == null ? null : Number(item.purchaseDetails.transferCost),
    totalCost: Number(item.cost || 0),
  }))
  .sort((a, b) => String(b.purchaseDate).localeCompare(String(a.purchaseDate))))
const carPurchaseSummary = computed(() => carPurchases.value.reduce((summary, item) => {
  const account = item.isLongTerm ? 'self' : 'invest'
  summary[account].count += 1
  summary[account].amount += item.totalCost
  summary.total.count += 1
  summary.total.amount += item.totalCost
  return summary
}, { self: { count: 0, amount: 0 }, invest: { count: 0, amount: 0 }, total: { count: 0, amount: 0 } }))
const loanTotal = computed(() => loans.value.reduce((sum, loan) => sum + (loan.status === 'active' ? Number(loan.remaining || 0) : 0), 0))
const balanceCards = computed(() => [
  { label: '零钱', value: owner.value.pocketBalance },
  { label: '投资账户', value: owner.value.investBalance },
  { label: '贷款剩余', value: loanTotal.value },
  { label: "Payton's 基金", value: getPaytonFund() },
])
const expenseForm = reactive({ type: 'expense', date: new Date().toISOString().slice(0, 10), item: '', amount: 0, note: '' })
const loanForm = reactive({ name: '', amount: 0, date: new Date().toISOString().slice(0, 10), dueDate: '', note: '' })
const loanEventForm = reactive({ type: 'repay', amount: 0, date: new Date().toISOString().slice(0, 10), note: '' })
const transferForm = reactive({ fromAccount: 'pocket', toAccount: 'invest', amount: 0, date: new Date().toISOString().slice(0, 10), note: '' })
const transferDirection = ref('pocket-to-invest')
const editingTransferId = ref(null)
const editTransferDirection = ref('pocket-to-invest')
const editTransferForm = reactive({ fromAccount: 'pocket', toAccount: 'invest', amount: 0, date: '', note: '' })
const editingRecordId = ref(null)
const showLoanForm = ref(false)
const showRepayForm = ref(false)
const selectedLoanId = ref('')
const showLoanDetailId = ref('')
const editExpenseForm = reactive({ type: 'expense', date: '', item: '', amount: 0, note: '' })

function submitExpense() {
  if (!expenseForm.item.trim() || Number(expenseForm.amount) <= 0) return
  addPaytonExpense({ ...expenseForm })
  expenseForm.item = ''; expenseForm.amount = 0; expenseForm.note = ''
}
function toggleExpenseType(form) {
  form.type = form.type === 'expense' ? 'income' : 'expense'
}
function editRecord(record) {
  editingRecordId.value = record.id
  Object.assign(editExpenseForm, { type: record.type, date: record.date || '', item: record.item || '', amount: Number(record.amount || 0), note: record.note || '' })
}
function saveExpenseEdit() {
  if (!String(editExpenseForm.item).trim() || !Number.isFinite(Number(editExpenseForm.amount)) || Number(editExpenseForm.amount) < 0) return
  updatePaytonExpense(editingRecordId.value, { ...editExpenseForm, item: String(editExpenseForm.item).trim(), amount: Number(editExpenseForm.amount) })
  editingRecordId.value = null
}
function submitLoan() {
  if (!loanForm.name.trim() || Number(loanForm.amount) <= 0) return
  createPaytonLoan({ ...loanForm })
  loanForm.name = ''; loanForm.amount = 0; loanForm.dueDate = ''; loanForm.note = ''
  showLoanForm.value = false
}
function addLoanEvent(loan) {
  if (Number(loanEventForm.amount) <= 0) return
  addPaytonLoanEvent(loan.id, { ...loanEventForm })
  loanEventForm.amount = 0; loanEventForm.note = ''
  showRepayForm.value = false
}
function monthsRemaining(loan) {
  if (!loan.dueDate) return null
  const due = new Date(`${loan.dueDate}T00:00:00`)
  const now = new Date()
  return Math.max(0, (due.getFullYear() - now.getFullYear()) * 12 + due.getMonth() - now.getMonth() + (due.getDate() >= now.getDate() ? 0 : -1))
}
function totalLoanMonths(loan) {
  if (!loan.startDate || !loan.dueDate) return null
  const start = new Date(`${loan.startDate}T00:00:00`)
  const due = new Date(`${loan.dueDate}T00:00:00`)
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(due.getTime())) return null
  return Math.max(0, (due.getFullYear() - start.getFullYear()) * 12 + due.getMonth() - start.getMonth() + (due.getDate() >= start.getDate() ? 0 : -1))
}
function loanProgress(loan) {
  const totalMonths = totalLoanMonths(loan)
  const remainingMonths = monthsRemaining(loan)
  if (totalMonths === null || totalMonths <= 0 || remainingMonths === null) return null
  return Math.min(100, Math.max(0, remainingMonths / totalMonths * 100))
}
function submitTransfer() {
  if (Number(transferForm.amount) <= 0) return
  addPaytonTransfer({ ...transferForm })
  transferForm.amount = 0; transferForm.note = ''
}
function selectTransferDirection(direction) {
  transferDirection.value = direction
  transferForm.fromAccount = direction === 'pocket-to-invest' ? 'pocket' : 'invest'
  transferForm.toAccount = direction === 'pocket-to-invest' ? 'invest' : 'pocket'
}
function selectEditTransferDirection(direction) {
  editTransferDirection.value = direction
  editTransferForm.fromAccount = direction === 'pocket-to-invest' ? 'pocket' : 'invest'
  editTransferForm.toAccount = direction === 'pocket-to-invest' ? 'invest' : 'pocket'
}
function editTransfer(transfer) {
  editingTransferId.value = transfer.id
  editTransferDirection.value = transfer.fromAccount === 'pocket' ? 'pocket-to-invest' : 'invest-to-pocket'
  Object.assign(editTransferForm, {
    fromAccount: transfer.fromAccount,
    toAccount: transfer.toAccount,
    amount: Number(transfer.amount || 0),
    date: transfer.date || '',
    note: transfer.note || '',
  })
}
function saveTransferEdit() {
  if (!Number.isFinite(Number(editTransferForm.amount)) || Number(editTransferForm.amount) <= 0) return
  updatePaytonTransfer(editingTransferId.value, { ...editTransferForm, amount: Number(editTransferForm.amount) })
  editingTransferId.value = null
}
</script>

<template>
  <div class="space-y-4">
    <div>
      <div class="flex items-baseline gap-3">
        <h2 class="text-3xl leading-10 font-extrabold">皮蛋金库</h2>
        <span class="text-base text-gray-400 font-light">Payton Treasury</span>
      </div>
    </div>

    <div class="grid grid-cols-2 xl:grid-cols-4 gap-4">
      <div v-for="card in balanceCards" :key="card.label" class="apple-card">
        <div class="text-sm text-gray-500">{{ card.label }}</div>
        <div class="mt-2 text-2xl font-bold">¥{{ Number(card.value || 0).toFixed(2) }}</div>
      </div>
    </div>

    <div class="apple-card p-2 flex gap-2">
      <button v-for="tab in tabs" :key="tab" class="rounded-lg px-4 py-2 text-sm font-semibold" :class="activeTab === tab ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-100'" @click="activeTab = tab">{{ tab }}</button>
    </div>

    <section v-if="activeTab === '零花收支'" class="apple-card space-y-4">
      <div class="flex flex-wrap gap-3 items-end">
        <div class="text-sm"><span class="mb-1 block">类型</span><button type="button" class="rounded-full px-3 py-1.5 font-semibold transition-colors whitespace-nowrap focus-visible:outline focus-visible:outline-2" :class="expenseForm.type === 'expense' ? 'bg-red-100 text-red-800 focus-visible:outline-red-500' : 'bg-green-100 text-green-800 focus-visible:outline-green-500'" :aria-label="`当前为${expenseForm.type === 'expense' ? '支出' : '收入'}，点击切换`" :aria-pressed="expenseForm.type === 'income'" @click="toggleExpenseType(expenseForm)">{{ expenseForm.type === 'expense' ? '支出' : '收入' }} <span class="text-xs opacity-70">· 点击切换</span></button></div>
        <label class="text-sm">日期<input v-model="expenseForm.date" type="date" class="apple-input mt-1 block" /></label>
        <label class="text-sm">项目<input v-model="expenseForm.item" list="payton-expense-items" class="apple-input mt-1 block" /></label>
        <label class="text-sm">金额<input v-model.number="expenseForm.amount" type="number" min="0" step="0.01" class="apple-input mt-1 block" /></label>
        <label class="text-sm">备注<input v-model="expenseForm.note" class="apple-input mt-1 block" /></label>
        <button class="btn btn-primary" @click="submitExpense">新增记录</button>
      </div>
      <div v-for="record in records" :key="record.id" class="border-t py-3 grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 items-center text-sm">
        <div class="min-w-0"><div class="flex flex-wrap items-center gap-2"><span class="font-semibold truncate">{{ record.item }}</span><span class="text-xs rounded-full px-2 py-0.5" :class="record.type === 'income' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'">{{ record.type === 'income' ? '收入' : '支出' }}</span></div><div class="text-xs text-gray-400 mt-1">{{ record.date || '未填写日期' }}<span v-if="record.note"> · {{ record.note }}</span></div></div>
        <div class="flex items-center gap-3"><span class="font-semibold tabular-nums whitespace-nowrap" :class="record.type === 'income' ? 'text-green-600' : 'text-red-600'">{{ record.type === 'income' ? '+' : '−' }}¥{{ Number(record.amount).toFixed(2) }}</span><button class="text-blue-600" @click="editRecord(record)">编辑</button><button class="text-red-500" @click="deletePaytonExpense(record.id)">删除</button></div>
      </div>
      <div v-if="!records.length" class="py-8 text-center text-gray-400">暂无零花收支</div>
    </section>

    <section v-else-if="activeTab === '买车支出'" class="apple-card space-y-4">
      <div class="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 class="text-lg font-bold">买车支出</h3>
          <p class="mt-1 text-xs text-gray-400">只读采购入库记录；金额按商品入库成本统计，修改请到采购管理操作。</p>
        </div>
        <label class="text-sm">入库月份<input v-model="purchaseMonth" type="month" class="apple-input mt-1 block" /></label>
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div class="rounded-xl bg-gray-50 p-4"><div class="text-sm text-gray-500">当月买车支出 · {{ carPurchaseSummary.total.count }} 辆</div><div class="mt-1 text-xl font-bold">¥{{ carPurchaseSummary.total.amount.toFixed(2) }}</div></div>
        <div class="rounded-xl bg-purple-50 p-4"><div class="text-sm text-purple-700">自留 · {{ carPurchaseSummary.self.count }} 辆</div><div class="mt-1 text-xl font-bold text-purple-800">¥{{ carPurchaseSummary.self.amount.toFixed(2) }}</div></div>
        <div class="rounded-xl bg-blue-50 p-4"><div class="text-sm text-blue-700">投资 · {{ carPurchaseSummary.invest.count }} 辆</div><div class="mt-1 text-xl font-bold text-blue-800">¥{{ carPurchaseSummary.invest.amount.toFixed(2) }}</div></div>
      </div>
      <div v-for="item in carPurchases" :key="item.sourceIndex" class="border-t pt-4 grid grid-cols-[1fr_auto] gap-3 items-center text-sm">
        <div class="min-w-0">
          <div class="flex flex-wrap items-center gap-2"><span class="font-semibold">{{ item.name || '未命名商品' }}</span><span class="rounded-full px-2 py-0.5 text-xs" :class="item.isLongTerm ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'">{{ item.isLongTerm ? '自留' : '投资' }}</span></div>
          <div class="mt-1 text-xs text-gray-400">SID {{ item.sid || '—' }} · 入库 {{ item.purchaseDate }}</div>
          <div class="mt-1 text-xs text-gray-500">采购 {{ item.purchaseCost === null ? '—' : '¥' + item.purchaseCost.toFixed(2) }} · 转运 {{ item.transferCost === null ? '—' : '¥' + item.transferCost.toFixed(2) }}</div>
        </div>
        <div class="text-right"><div class="text-xs text-gray-400">入库成本</div><div class="font-semibold tabular-nums">¥{{ item.totalCost.toFixed(2) }}</div></div>
      </div>
      <div v-if="!carPurchases.length" class="py-8 text-center text-gray-400">该月没有买车入库记录</div>
    </section>

    <section v-else-if="activeTab === '贷款清单'" class="apple-card space-y-4">
      <div class="flex justify-end gap-2">
        <button class="btn btn-outline" @click="showRepayForm = true">归还贷款</button>
        <button class="btn btn-primary" @click="showLoanForm = true">新增贷款</button>
      </div>
      <article v-for="loan in loans" :key="loan.id" class="rounded-2xl border border-gray-100 bg-white p-5 flex items-center gap-5 cursor-pointer" @click="showLoanDetailId = loan.id">
        <div class="w-20 h-20 rounded-full flex flex-col items-center justify-center shrink-0" :style="{ background: `conic-gradient(#059669 ${loanProgress(loan) ?? 0}%, #e5e7eb 0)` }"><div class="w-[calc(100%-10px)] h-[calc(100%-10px)] rounded-full bg-white flex flex-col items-center justify-center"><span class="font-bold">{{ loanProgress(loan) === null ? '—' : loanProgress(loan).toFixed(0) + '%' }}</span><span class="text-xs text-gray-400">剩余</span></div></div>
        <div class="min-w-0 flex-1"><div class="text-gray-400">{{ loan.name }} <span v-if="totalLoanMonths(loan) !== null">· 剩余{{ monthsRemaining(loan) }} / {{ totalLoanMonths(loan) }}个月</span><span v-else-if="monthsRemaining(loan) !== null">· 剩余{{ monthsRemaining(loan) }}个月</span><span v-if="loan.dueDate">· {{ loan.dueDate }}到期</span></div><div class="text-3xl font-bold mt-1">¥{{ Number(loan.remaining || 0).toFixed(2) }}</div><div class="text-sm text-gray-400">总额 ¥{{ Number(loan.amount || 0).toFixed(2) }}</div></div>
        <div class="flex gap-3" @click.stop><button class="text-blue-600" title="查看贷款详情" @click="showLoanDetailId = loan.id">详情</button></div>
      </article>
      <div v-if="!loans.length" class="py-8 text-center text-gray-400">暂无贷款</div>
      <div v-if="showLoanForm" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 glass-modal" @click.self="showLoanForm = false"><div class="apple-card w-full max-w-lg space-y-4"><h3 class="text-xl font-bold">新增贷款</h3><div class="grid grid-cols-2 gap-3"><label class="text-sm">贷款名称<input v-model="loanForm.name" class="apple-input mt-1 block w-full" /></label><label class="text-sm">金额<input v-model.number="loanForm.amount" type="number" min="0" step="0.01" class="apple-input mt-1 block w-full" /></label><label class="text-sm">开始日<input v-model="loanForm.date" type="date" class="apple-input mt-1 block w-full" /></label><label class="text-sm">到期日<input v-model="loanForm.dueDate" type="date" class="apple-input mt-1 block w-full" /></label><label class="text-sm col-span-2">备注<input v-model="loanForm.note" class="apple-input mt-1 block w-full" /></label></div><div class="flex justify-end gap-2"><button class="btn btn-outline" @click="showLoanForm = false">取消</button><button class="btn btn-primary" @click="submitLoan">新增贷款</button></div></div></div>
      <div v-if="showRepayForm" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 glass-modal" @click.self="showRepayForm = false"><div class="apple-card w-full max-w-lg space-y-4"><h3 class="text-xl font-bold">归还贷款</h3><label class="text-sm">选择贷款<select v-model="selectedLoanId" class="apple-select mt-1 block w-full"><option value="">请选择</option><option v-for="loan in loans.filter(x => x.status === 'active')" :key="loan.id" :value="loan.id">{{ loan.name }} · 剩余 ¥{{ Number(loan.remaining).toFixed(2) }}</option></select></label><div class="grid grid-cols-2 gap-3"><label class="text-sm">还款金额<input v-model.number="loanEventForm.amount" type="number" min="0" step="0.01" class="apple-input mt-1 block w-full" /></label><label class="text-sm">日期<input v-model="loanEventForm.date" type="date" class="apple-input mt-1 block w-full" /></label><label class="text-sm col-span-2">备注<input v-model="loanEventForm.note" class="apple-input mt-1 block w-full" /></label></div><div class="flex justify-end gap-2"><button class="btn btn-outline" @click="showRepayForm = false">取消</button><button class="btn btn-primary" :disabled="!selectedLoanId" @click="addLoanEvent(loans.find(x => x.id === selectedLoanId))">确认归还</button></div></div></div>
      <div v-if="showLoanDetailId" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 glass-modal" @click.self="showLoanDetailId = ''"><div v-if="loans.find(x => x.id === showLoanDetailId)" class="apple-card w-full max-w-2xl max-h-[85vh] overflow-y-auto space-y-4"><div class="flex justify-between"><h3 class="text-xl font-bold">{{ loans.find(x => x.id === showLoanDetailId).name }} · 贷款详情</h3><button @click="showLoanDetailId = ''">关闭</button></div><p class="text-gray-500">开始 {{ loans.find(x => x.id === showLoanDetailId).startDate }} · 到期 {{ loans.find(x => x.id === showLoanDetailId).dueDate || '未设' }} · 备注 {{ loans.find(x => x.id === showLoanDetailId).note || '—' }}</p><div v-for="event in loans.find(x => x.id === showLoanDetailId).events || []" :key="event.id" class="flex justify-between border-t py-2 text-sm"><span>{{ event.date }} · {{ event.type === 'borrow' ? '借款' : '还款' }} · {{ event.note }}</span><span>¥{{ Number(event.amount).toFixed(2) }} <button class="ml-2 text-red-500" @click="deletePaytonLoanEvent(showLoanDetailId, event.id)">撤销</button></span></div></div></div>
    </section>

    <section v-else class="apple-card space-y-4">
      <div class="space-y-3">
        <div class="text-sm font-medium">选择互转方向</div>
        <div role="group" aria-label="互转方向" class="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <button type="button" class="rounded-xl border px-4 py-3 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500" :class="transferDirection === 'pocket-to-invest' ? 'border-blue-500 bg-blue-50 text-blue-900' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'" :aria-pressed="transferDirection === 'pocket-to-invest'" @click="selectTransferDirection('pocket-to-invest')"><span class="font-semibold">零钱 → 投资</span><span class="mt-1 block text-xs opacity-75">从零钱转入投资账户</span></button>
          <button type="button" class="rounded-xl border px-4 py-3 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500" :class="transferDirection === 'invest-to-pocket' ? 'border-blue-500 bg-blue-50 text-blue-900' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'" :aria-pressed="transferDirection === 'invest-to-pocket'" @click="selectTransferDirection('invest-to-pocket')"><span class="font-semibold">投资 → 零钱</span><span class="mt-1 block text-xs opacity-75">从投资账户转入零钱</span></button>
        </div>
      </div>
      <div class="flex flex-wrap gap-3 items-end">
        <label class="text-sm">金额<input v-model.number="transferForm.amount" type="number" min="0" step="0.01" class="apple-input mt-1 block" /></label>
        <label class="text-sm">日期<input v-model="transferForm.date" type="date" class="apple-input mt-1 block" /></label>
        <label class="text-sm flex-1 min-w-48">备注<input v-model="transferForm.note" class="apple-input mt-1 block w-full" placeholder="可填写互转原因" /></label>
        <button class="btn btn-primary" @click="submitTransfer">确认互转</button>
      </div>
      <p v-if="Number(transferForm.amount) > 0" class="text-sm text-gray-500">¥{{ Number(transferForm.amount).toFixed(2) }} 将从{{ transferForm.fromAccount === 'pocket' ? '零钱' : '投资账户' }}扣除，转入{{ transferForm.toAccount === 'pocket' ? '零钱' : '投资账户' }}。</p>
      <div v-for="transfer in transfers" :key="transfer.id" class="flex justify-between border-t py-3 text-sm">
        <div class="min-w-0"><div>{{ transfer.date }} · {{ transfer.fromAccount === 'pocket' ? '零钱' : '投资' }} → {{ transfer.toAccount === 'pocket' ? '零钱' : '投资' }} · ¥{{ Number(transfer.amount).toFixed(2) }}</div><div v-if="transfer.note" class="mt-1 text-xs text-gray-400">备注：{{ transfer.note }}</div></div>
        <span class="shrink-0"><button class="mr-3 text-blue-600" @click="editTransfer(transfer)">编辑</button><button class="text-red-500" @click="deletePaytonTransfer(transfer.id)">删除</button></span>
      </div>
    </section>

    <div v-if="editingRecordId !== null" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 glass-modal" @click.self="editingRecordId = null">
      <div class="apple-card w-full max-w-xl space-y-4" role="dialog" aria-modal="true" aria-labelledby="edit-expense-title">
        <div class="flex items-center justify-between"><h3 id="edit-expense-title" class="text-xl font-bold">编辑零花收支</h3><button class="text-gray-400 hover:text-gray-700" aria-label="关闭" @click="editingRecordId = null">✕</button></div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div class="text-sm"><span class="mb-1 block">类型</span><button type="button" class="rounded-full px-3 py-1.5 font-semibold transition-colors whitespace-nowrap focus-visible:outline focus-visible:outline-2" :class="editExpenseForm.type === 'expense' ? 'bg-red-100 text-red-800 focus-visible:outline-red-500' : 'bg-green-100 text-green-800 focus-visible:outline-green-500'" :aria-label="`当前为${editExpenseForm.type === 'expense' ? '支出' : '收入'}，点击切换`" :aria-pressed="editExpenseForm.type === 'income'" @click="toggleExpenseType(editExpenseForm)">{{ editExpenseForm.type === 'expense' ? '支出' : '收入' }} <span class="text-xs opacity-70">· 点击切换</span></button></div>
          <label class="text-sm">日期<input v-model="editExpenseForm.date" type="date" class="apple-input mt-1 block w-full" /></label>
          <label class="text-sm">项目<input v-model="editExpenseForm.item" list="payton-expense-items" class="apple-input mt-1 block w-full" /></label>
          <label class="text-sm">金额<input v-model.number="editExpenseForm.amount" type="number" min="0" step="0.01" class="apple-input mt-1 block w-full" /></label>
          <label class="text-sm sm:col-span-2">备注<input v-model="editExpenseForm.note" class="apple-input mt-1 block w-full" /></label>
        </div>
        <div class="flex justify-end gap-2"><button class="btn btn-outline" @click="editingRecordId = null">取消</button><button class="btn btn-primary" @click="saveExpenseEdit">保存修改</button></div>
      </div>
    </div>
    <div v-if="editingTransferId !== null" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 glass-modal" @click.self="editingTransferId = null">
      <div class="apple-card w-full max-w-xl space-y-4" role="dialog" aria-modal="true" aria-labelledby="edit-transfer-title">
        <div class="flex items-center justify-between"><h3 id="edit-transfer-title" class="text-xl font-bold">编辑零钱↔投资互转</h3><button class="text-gray-400 hover:text-gray-700" aria-label="关闭" @click="editingTransferId = null">✕</button></div>
        <div class="space-y-2"><div class="text-sm font-medium">互转方向</div><div role="group" aria-label="编辑互转方向" class="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <button type="button" class="rounded-xl border px-4 py-3 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500" :class="editTransferDirection === 'pocket-to-invest' ? 'border-blue-500 bg-blue-50 text-blue-900' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'" :aria-pressed="editTransferDirection === 'pocket-to-invest'" @click="selectEditTransferDirection('pocket-to-invest')"><span class="font-semibold">零钱 → 投资</span><span class="mt-1 block text-xs opacity-75">从零钱转入投资账户</span></button>
          <button type="button" class="rounded-xl border px-4 py-3 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500" :class="editTransferDirection === 'invest-to-pocket' ? 'border-blue-500 bg-blue-50 text-blue-900' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'" :aria-pressed="editTransferDirection === 'invest-to-pocket'" @click="selectEditTransferDirection('invest-to-pocket')"><span class="font-semibold">投资 → 零钱</span><span class="mt-1 block text-xs opacity-75">从投资账户转入零钱</span></button>
        </div></div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3"><label class="text-sm">金额<input v-model.number="editTransferForm.amount" type="number" min="0" step="0.01" class="apple-input mt-1 block w-full" /></label><label class="text-sm">日期<input v-model="editTransferForm.date" type="date" class="apple-input mt-1 block w-full" /></label><label class="text-sm sm:col-span-2">备注<input v-model="editTransferForm.note" class="apple-input mt-1 block w-full" placeholder="可填写互转原因" /></label></div>
        <div class="flex justify-end gap-2"><button class="btn btn-outline" @click="editingTransferId = null">取消</button><button class="btn btn-primary" @click="saveTransferEdit">保存修改</button></div>
      </div>
    </div>
    <datalist id="payton-expense-items"><option v-for="item in expenseItems" :key="item" :value="item" /></datalist>
  </div>
</template>
