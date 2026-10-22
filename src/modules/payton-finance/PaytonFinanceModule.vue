<script setup>
import { computed, reactive, ref } from 'vue'
import { state } from '../../data/store'
import {
  addMonthlyAllowance, addPaytonExpense, addPaytonLoanEvent, addPaytonTransfer,
  createPaytonLoan, deletePaytonExpense, deletePaytonLoanEvent, deletePaytonTransfer,
  getPaytonFund, updatePaytonExpense, updatePaytonTransfer,
} from './usePaytonFinance'

const tabs = ['零花收支', '贷款清单', '零钱↔投资互转']
const activeTab = ref(tabs[0])
const owner = computed(() => state.ownerRegistry.payton || {})
const loans = computed(() => owner.value.loans || [])
const transfers = computed(() => owner.value.accountTransfers || [])
const records = computed(() => state.financeRecords.filter((record) => record.owner === 'payton').sort((a, b) => String(b.date).localeCompare(String(a.date))))
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

function submitExpense() {
  if (!expenseForm.item.trim() || Number(expenseForm.amount) <= 0) return
  addPaytonExpense({ ...expenseForm })
  expenseForm.item = ''; expenseForm.amount = 0; expenseForm.note = ''
}
function editRecord(record) {
  const amount = Number(prompt('请输入新金额', String(record.amount)))
  if (Number.isFinite(amount) && amount >= 0) updatePaytonExpense(record.id, { amount })
}
function submitLoan() {
  if (!loanForm.name.trim() || Number(loanForm.amount) <= 0) return
  createPaytonLoan({ ...loanForm })
  loanForm.name = ''; loanForm.amount = 0; loanForm.dueDate = ''; loanForm.note = ''
}
function addLoanEvent(loan) {
  if (Number(loanEventForm.amount) <= 0) return
  addPaytonLoanEvent(loan.id, { ...loanEventForm })
  loanEventForm.amount = 0; loanEventForm.note = ''
}
function submitTransfer() {
  if (Number(transferForm.amount) <= 0) return
  addPaytonTransfer({ ...transferForm })
  transferForm.amount = 0; transferForm.note = ''
}
function editTransfer(transfer) {
  const amount = Number(prompt('请输入新金额', String(transfer.amount)))
  if (Number.isFinite(amount) && amount > 0) updatePaytonTransfer(transfer.id, { amount })
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
        <label class="text-sm">类型<select v-model="expenseForm.type" class="apple-select mt-1 block"><option value="expense">支出</option><option value="income">收入</option></select></label>
        <label class="text-sm">日期<input v-model="expenseForm.date" type="date" class="apple-input mt-1 block" /></label>
        <label class="text-sm">项目<input v-model="expenseForm.item" class="apple-input mt-1 block" /></label>
        <label class="text-sm">金额<input v-model.number="expenseForm.amount" type="number" min="0" step="0.01" class="apple-input mt-1 block" /></label>
        <label class="text-sm">备注<input v-model="expenseForm.note" class="apple-input mt-1 block" /></label>
        <button class="btn btn-primary" @click="submitExpense">新增记录</button>
        <button class="btn btn-outline" @click="addMonthlyAllowance(expenseForm.date)">存入本月零花 ¥{{ owner.monthlyAllowance || 200 }}</button>
      </div>
      <div v-for="record in records" :key="record.id" class="flex items-center justify-between border-t py-3 text-sm">
        <div><span class="font-medium">{{ record.item }}</span><span class="ml-3 text-gray-400">{{ record.date }} · {{ record.note }}</span></div>
        <div class="flex items-center gap-3"><span :class="record.type === 'income' ? 'text-green-600' : 'text-red-600'">{{ record.type === 'income' ? '+' : '−' }}¥{{ Number(record.amount).toFixed(2) }}</span><button class="text-blue-600" @click="editRecord(record)">编辑</button><button class="text-red-500" @click="deletePaytonExpense(record.id)">删除</button></div>
      </div>
      <div v-if="!records.length" class="py-8 text-center text-gray-400">暂无零花收支</div>
    </section>

    <section v-else-if="activeTab === '贷款清单'" class="apple-card space-y-4">
      <div class="flex flex-wrap gap-3 items-end">
        <label class="text-sm">贷款名称<input v-model="loanForm.name" class="apple-input mt-1 block" /></label>
        <label class="text-sm">金额<input v-model.number="loanForm.amount" type="number" min="0" step="0.01" class="apple-input mt-1 block" /></label>
        <label class="text-sm">开始日<input v-model="loanForm.date" type="date" class="apple-input mt-1 block" /></label>
        <label class="text-sm">到期日<input v-model="loanForm.dueDate" type="date" class="apple-input mt-1 block" /></label>
        <button class="btn btn-primary" @click="submitLoan">新增借款</button>
      </div>
      <article v-for="loan in loans" :key="loan.id" class="border-t py-4 space-y-2">
        <div class="flex justify-between"><div class="font-semibold">{{ loan.name }} <span class="text-xs text-gray-400">{{ loan.startDate }} — {{ loan.dueDate || '未设到期日' }}</span></div><div>剩余 ¥{{ Number(loan.remaining || 0).toFixed(2) }}</div></div>
        <div class="flex flex-wrap items-end gap-3">
          <select v-model="loanEventForm.type" class="apple-select"><option value="repay">还款</option><option value="borrow">追加借款</option></select>
          <input v-model.number="loanEventForm.amount" type="number" min="0" step="0.01" placeholder="金额" class="apple-input w-32" />
          <input v-model="loanEventForm.date" type="date" class="apple-input" />
          <input v-model="loanEventForm.note" placeholder="备注" class="apple-input" />
          <button class="btn btn-outline" @click="addLoanEvent(loan)">记一笔</button>
        </div>
        <div v-for="event in loan.events || []" :key="event.id" class="text-xs text-gray-500">{{ event.date }} · {{ event.type === 'borrow' ? '借款' : '还款' }} ¥{{ Number(event.amount).toFixed(2) }} · {{ event.note }} <button class="ml-2 text-red-500" @click="deletePaytonLoanEvent(loan.id, event.id)">撤销</button></div>
      </article>
      <div v-if="!loans.length" class="py-8 text-center text-gray-400">暂无贷款</div>
    </section>

    <section v-else class="apple-card space-y-4">
      <div class="flex flex-wrap gap-3 items-end">
        <label class="text-sm">转出<select v-model="transferForm.fromAccount" class="apple-select mt-1 block"><option value="pocket">零钱</option><option value="invest">投资</option></select></label>
        <label class="text-sm">转入<select v-model="transferForm.toAccount" class="apple-select mt-1 block"><option value="invest">投资</option><option value="pocket">零钱</option></select></label>
        <label class="text-sm">金额<input v-model.number="transferForm.amount" type="number" min="0" step="0.01" class="apple-input mt-1 block" /></label>
        <label class="text-sm">日期<input v-model="transferForm.date" type="date" class="apple-input mt-1 block" /></label>
        <button class="btn btn-primary" @click="submitTransfer">确认互转</button>
      </div>
      <div v-for="transfer in transfers" :key="transfer.id" class="flex justify-between border-t py-3 text-sm">
        <span>{{ transfer.date }} · {{ transfer.fromAccount === 'pocket' ? '零钱' : '投资' }} → {{ transfer.toAccount === 'pocket' ? '零钱' : '投资' }} · ¥{{ Number(transfer.amount).toFixed(2) }}</span>
        <span><button class="mr-3 text-blue-600" @click="editTransfer(transfer)">编辑金额</button><button class="text-red-500" @click="deletePaytonTransfer(transfer.id)">删除</button></span>
      </div>
    </section>
  </div>
</template>
