<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import {
  addFinanceRecord,
  addLoanRecord,
  deleteFinanceRecord,
  deleteLoanRecord,
  getFinanceStats,
  updateFinanceRecord,
  updateLoanRecord,
} from './useFinance'
import { state as store } from '../../data/store'

const showRecordModal = ref(false)
const showLoanModal = ref(false)
const isEditingRecord = ref(false)
const editingRecordId = ref(null)
const isEditingLoan = ref(false)
const editingLoanId = ref(null)
const financeViewMode = ref('records')
const collapsedLoanGroups = reactive({})
const financeViewModeStorageKey = 'ysp_ui_finance_view_mode'
const financeLoanCollapseStorageKey = 'ysp_ui_finance_loan_collapse'

const recordForm = reactive({
  type: 'expense',
  date: new Date().toISOString().slice(0, 10),
  item: '',
  amount: 0,
  note: '',
})

const loanForm = reactive({
  type: 'borrow',
  date: new Date().toISOString().slice(0, 10),
  counterparty: '',
  amount: 0,
  note: '',
})

const stats = computed(() => getFinanceStats(store.financeRecords, store.loanRecords))

const sortedFinanceRecords = computed(() =>
  [...store.financeRecords].sort((a, b) => String(b.date || '').localeCompare(String(a.date || ''))),
)

const sortedLoanRecords = computed(() =>
  [...store.loanRecords].sort((a, b) => String(b.date || '').localeCompare(String(a.date || ''))),
)

const loanSummary = computed(() => {
  const map = new Map()
  store.loanRecords.forEach((r) => {
    const cp = r.counterparty || '未知'
    if (!map.has(cp)) {
      map.set(cp, {
        counterparty: cp,
        borrowAmount: 0,
        repayAmount: 0,
        balance: 0,
        borrowCount: 0,
        repayCount: 0,
        progressPercent: 0,
      })
    }
    const s = map.get(cp)
    if (r.type === 'borrow') {
      s.borrowAmount += Number(r.amount || 0)
      s.borrowCount++
    } else if (r.type === 'lend') {
      s.repayAmount += Number(r.amount || 0)
      s.repayCount++
    }
  })
  return Array.from(map.values())
    .map((s) => {
      const balance = Math.max(0, Number(s.borrowAmount || 0) - Number(s.repayAmount || 0))
      const progressPercent = Number(s.borrowAmount || 0) > 0
        ? Math.min(100, Math.round((Number(s.repayAmount || 0) / Number(s.borrowAmount || 0)) * 100))
        : 100
      return {
        ...s,
        balance,
        progressPercent,
      }
    })
    .filter((s) => Number(s.borrowAmount || 0) > 0)
})

const groupedLoansByType = computed(() => {
  const groups = [
    {
      key: 'borrow',
      label: '借入记录',
      items: sortedLoanRecords.value.filter((l) => l.type === 'borrow'),
    },
    {
      key: 'repay',
      label: '还款记录',
      items: sortedLoanRecords.value.filter((l) => l.type === 'lend'),
    },
  ]
  return groups.filter((g) => g.items.length > 0)
})

function toggleLoanGroup(key) {
  collapsedLoanGroups[key] = !collapsedLoanGroups[key]
}

function resetFinanceViewState() {
  financeViewMode.value = 'records'
  Object.keys(collapsedLoanGroups).forEach((k) => {
    delete collapsedLoanGroups[k]
  })
  localStorage.removeItem(financeViewModeStorageKey)
  localStorage.removeItem(financeLoanCollapseStorageKey)
}

function fmtMoney(v) {
  return Number(v || 0).toFixed(2)
}

function openRecordModal() {
  isEditingRecord.value = false
  editingRecordId.value = null
  recordForm.type = 'expense'
  recordForm.date = new Date().toISOString().slice(0, 10)
  recordForm.item = ''
  recordForm.amount = 0
  recordForm.note = ''
  showRecordModal.value = true
}

function openEditRecord(record) {
  if (!record) return
  isEditingRecord.value = true
  editingRecordId.value = record.id
  recordForm.type = record.type || 'expense'
  recordForm.date = record.date || new Date().toISOString().slice(0, 10)
  recordForm.item = record.item || ''
  recordForm.amount = Number(record.amount || 0)
  recordForm.note = record.note || ''
  showRecordModal.value = true
}

function submitRecord() {
  if (isEditingRecord.value && editingRecordId.value != null) {
    updateFinanceRecord(editingRecordId.value, {
      type: recordForm.type,
      date: recordForm.date,
      item: recordForm.item,
      amount: Number(recordForm.amount || 0),
      note: recordForm.note,
    })
  } else {
    addFinanceRecord({
      type: recordForm.type,
      date: recordForm.date,
      item: recordForm.item,
      amount: Number(recordForm.amount || 0),
      note: recordForm.note,
    })
  }
  showRecordModal.value = false
}

function openLoanModal() {
  isEditingLoan.value = false
  editingLoanId.value = null
  loanForm.type = 'borrow'
  loanForm.date = new Date().toISOString().slice(0, 10)
  loanForm.counterparty = 'PT工作公费'
  loanForm.amount = 0
  loanForm.note = ''
  showLoanModal.value = true
}

function openEditLoan(loan) {
  if (!loan) return
  isEditingLoan.value = true
  editingLoanId.value = loan.id
  loanForm.type = loan.type || 'borrow'
  loanForm.date = loan.date || new Date().toISOString().slice(0, 10)
  loanForm.counterparty = loan.counterparty || 'PT工作公费'
  loanForm.amount = Number(loan.amount || 0)
  loanForm.note = loan.note || ''
  showLoanModal.value = true
}

function submitLoan() {
  if (isEditingLoan.value && editingLoanId.value != null) {
    updateLoanRecord(editingLoanId.value, {
      type: loanForm.type,
      date: loanForm.date,
      counterparty: loanForm.counterparty,
      amount: Number(loanForm.amount || 0),
      note: loanForm.note,
    })
  } else {
    addLoanRecord({
      type: loanForm.type,
      date: loanForm.date,
      counterparty: loanForm.counterparty,
      amount: Number(loanForm.amount || 0),
      note: loanForm.note,
    })
  }
  showLoanModal.value = false
}

function getCounterpartyStatus(counterparty) {
  const summary = loanSummary.value.find((s) => s.counterparty === (counterparty || '未知'))
  if (!summary) return { label: '-', className: 'bg-gray-100 text-gray-600' }
  if (summary.balance <= 0) return { label: '已还清', className: 'bg-green-100 text-green-700' }
  if (Number(summary.repayAmount || 0) > 0) return { label: '还款中', className: 'bg-blue-100 text-blue-700' }
  return { label: '未还', className: 'bg-yellow-100 text-yellow-700' }
}

function getLoanRepayStatus(loan) {
  if (loan.type !== 'borrow') return { label: '-', className: 'bg-gray-100 text-gray-600', repaid: 0, remaining: loan.amount, percent: 0 }
  
  const cp = loan.counterparty || '未知'
  const borrows = store.loanRecords
    .filter((r) => r.type === 'borrow' && r.counterparty === cp)
    .sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')))
  
  const repays = store.loanRecords
    .filter((r) => r.type === 'lend' && r.counterparty === cp)
    .sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')))
  
  const totalBorrow = borrows.reduce((sum, b) => sum + Number(b.amount || 0), 0)
  if (totalBorrow === 0) return { label: '-', className: 'bg-gray-100 text-gray-600', repaid: 0, remaining: loan.amount, percent: 0 }
  
  let remainingRepay = repays.reduce((sum, r) => sum + Number(r.amount || 0), 0)
  let repaid = 0
  let found = false
  
  for (const b of borrows) {
    if (b.id === loan.id) {
      const usedRepay = Math.min(Number(b.amount || 0), remainingRepay)
      repaid = usedRepay
      found = true
      break
    }
    const usedRepay = Math.min(Number(b.amount || 0), remainingRepay)
    remainingRepay -= usedRepay
  }
  
  const originalAmount = Number(loan.amount || 0)
  const remaining = Math.max(0, originalAmount - repaid)
  const percent = originalAmount > 0 ? Math.round((repaid / originalAmount) * 100) : 0
  
  if (remaining <= 0) return { label: '已还清', className: 'bg-green-100 text-green-700', repaid, remaining, percent }
  if (repaid > 0) return { label: `已还${percent}%`, className: 'bg-blue-100 text-blue-700', repaid, remaining, percent }
  return { label: '未还', className: 'bg-yellow-100 text-yellow-700', repaid, remaining, percent }
}

onMounted(() => {
  try {
    const viewModeRaw = localStorage.getItem(financeViewModeStorageKey)
    if (viewModeRaw && ['records', 'loans'].includes(viewModeRaw)) {
      financeViewMode.value = viewModeRaw
    }

    const collapsedRaw = localStorage.getItem(financeLoanCollapseStorageKey)
    if (collapsedRaw) Object.assign(collapsedLoanGroups, JSON.parse(collapsedRaw))
  } catch (_) {
    // ignore invalid cache
  }
})

watch(financeViewMode, (val) => {
  localStorage.setItem(financeViewModeStorageKey, val)
})

watch(
  collapsedLoanGroups,
  (val) => {
    localStorage.setItem(financeLoanCollapseStorageKey, JSON.stringify(val))
  },
  { deep: true },
)
</script>

<template>
  <div class="space-y-6">
    <div class="flex justify-between items-end mb-6">
      <div class="flex items-baseline gap-3">
        <h2 class="text-3xl font-extrabold">公共收支</h2>
        <span class="text-base text-gray-400 font-light">General Income &amp; Expenses</span>
      </div>
      <div class="flex gap-2">
        <button class="btn btn-yellow btn-sm" @click="openRecordModal"><i class="fa-solid fa-wallet"></i> 记收支</button>
        <button class="btn bg-gray-500 text-white btn-sm" @click="openLoanModal"><i class="fa-solid fa-hand-holding-dollar"></i> 记借贷</button>
      </div>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div class="bg-gray-50 p-4 rounded-xl border-l-4 border-yellow-500">
        <div class="text-xs text-gray-500 mb-1">公共支出</div>
        <div class="text-2xl font-bold text-yellow-600">{{ fmtMoney(stats.totalExpense - stats.totalIncome) }}</div>
        <div class="text-xs text-gray-400 mt-1">支出 - 收入</div>
      </div>
      <div class="bg-gray-50 p-4 rounded-xl border-l-4 border-gray-500">
        <div class="text-xs text-gray-500 mb-1">借贷余额</div>
        <div class="text-2xl font-bold text-gray-600">{{ fmtMoney(stats.totalBorrowed - stats.totalLent) }}</div>
        <div class="text-xs text-gray-400 mt-1">借入 - 归还</div>
      </div>
    </div>

    <div class="apple-card p-2">
      <div class="flex gap-2">
        <button class="flex-1 py-2 px-4 rounded-lg font-medium transition" :class="financeViewMode==='records' ? 'bg-yellow-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'" @click="financeViewMode='records'"><i class="fa-solid fa-list-ul mr-2"></i>资金流水</button>
        <button class="flex-1 py-2 px-4 rounded-lg font-medium transition" :class="financeViewMode==='loans' ? 'bg-gray-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'" @click="financeViewMode='loans'"><i class="fa-solid fa-exchange-alt mr-2"></i>借贷关系</button>
      </div>
    </div>

    <div v-if="financeViewMode==='records'" class="apple-card p-0 overflow-hidden">
      <div class="border-b border-gray-100 px-4 py-3 font-semibold flex items-center justify-between">
        <span>收支明细</span>
        <span class="text-sm text-gray-400 font-normal">共 {{ sortedFinanceRecords.length }} 笔记录</span>
      </div>
      <div v-if="sortedFinanceRecords.length === 0" class="p-6 text-sm text-gray-400">暂无收支记录</div>
      <div v-else class="overflow-x-auto">
        <table class="apple-table min-w-full text-sm">
          <thead>
            <tr>
              <th>日期</th>
              <th>类型</th>
              <th>项目</th>
              <th>金额</th>
              <th>备注</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="record in sortedFinanceRecords" :key="record.id">
              <td class="text-gray-600">{{ record.date }}</td>
              <td>
                <span :class="['px-2 py-1 rounded text-xs font-medium', record.type === 'income' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700']">
                  {{ record.type === 'income' ? '收入' : '支出' }}
                </span>
              </td>
              <td class="font-medium">{{ record.item }}</td>
              <td :class="['font-bold', record.type === 'income' ? 'text-success' : 'text-danger']">
                {{ record.type === 'income' ? '+' : '-' }}{{ fmtMoney(record.amount) }}
              </td>
              <td class="text-gray-500 text-sm">{{ record.note || '-' }}</td>
              <td>
                <div class="flex gap-2">
                  <button @click="openEditRecord(record)" class="text-xs text-primary hover:text-blue-700 font-medium">编辑</button>
                  <button @click="deleteFinanceRecord(record.id)" class="text-gray-400 hover:text-danger transition">
                    <i class="fa-solid fa-trash-can"></i>
                  </button>
                </div>
              </td>
            </tr>
            <tr v-if="sortedFinanceRecords.length === 0">
              <td colspan="6" class="text-center py-8 text-gray-400">
                <i class="fa-solid fa-inbox text-3xl mb-2 block"></i>
                暂无收支记录
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div v-if="financeViewMode==='loans'" class="apple-card p-0 overflow-hidden">
      <div class="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
        <h3 class="font-semibold text-gray-800">借贷明细</h3>
        <span class="text-xs text-gray-500">共 {{ sortedLoanRecords.length }} 笔记录</span>
      </div>
      <div class="overflow-x-auto">
        <table class="apple-table min-w-full text-sm">
          <thead>
            <tr>
              <th>日期</th>
              <th>类型</th>
              <th>借贷方</th>
              <th>金额</th>
              <th>状态</th>
              <th>备注</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="loan in sortedLoanRecords" :key="loan.id">
              <td class="text-gray-600">{{ loan.date }}</td>
              <td>
                <span :class="['px-2 py-1 rounded text-xs font-medium', loan.type === 'borrow' ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700']">
                  {{ loan.type === 'borrow' ? '借入' : '归还' }}
                </span>
              </td>
              <td class="font-medium">{{ loan.counterparty }}</td>
              <td :class="['font-bold', loan.type === 'borrow' ? 'text-warning' : 'text-primary']">
                {{ loan.type === 'borrow' ? '+' : '-' }}{{ fmtMoney(loan.amount) }}
              </td>
              <td>
                <span v-if="loan.type === 'borrow'" :class="['px-2 py-1 rounded text-xs', getLoanRepayStatus(loan).className]">{{ getLoanRepayStatus(loan).label }}</span>
                <span v-else class="px-2 py-1 rounded text-xs bg-gray-100 text-gray-600">还款记录</span>
              </td>
              <td class="text-gray-500 text-sm">{{ loan.note || '-' }}</td>
              <td>
                <div class="flex gap-2">
                  <button @click="openEditLoan(loan)" class="text-xs text-primary hover:text-blue-700 font-medium">编辑</button>
                  <button @click="deleteLoanRecord(loan.id)" class="text-gray-400 hover:text-danger transition"><i class="fa-solid fa-trash-can"></i></button>
                </div>
              </td>
            </tr>
            <tr v-if="sortedLoanRecords.length === 0">
              <td colspan="7" class="text-center py-8 text-gray-400">
                <i class="fa-solid fa-handshake text-3xl mb-2 block"></i>
                暂无借贷记录
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-if="loanSummary.length > 0" class="border-t border-gray-200 p-4 bg-gray-50">
        <h4 class="text-sm font-semibold text-gray-700 mb-3">按借贷方汇总</h4>
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div v-for="summary in loanSummary" :key="summary.counterparty" class="bg-white p-3 rounded-lg border border-gray-200">
            <div class="text-xs text-gray-500 mb-1">{{ summary.counterparty }}</div>
            <div class="text-lg font-bold" :class="summary.balance > 0 ? 'text-warning' : 'text-green-600'">未还 ¥{{ fmtMoney(summary.balance) }}</div>
            <div class="text-xs text-gray-400 mt-1">借入 {{ summary.borrowCount }} 笔 / 还款 {{ summary.repayCount }} 笔</div>
            <div class="mt-2">
              <div class="w-full h-2 rounded bg-gray-100 overflow-hidden">
                <div class="h-full bg-blue-500" :style="{ width: `${summary.progressPercent}%` }"></div>
              </div>
              <div class="text-[11px] text-gray-500 mt-1">已还 ¥{{ fmtMoney(summary.repayAmount) }} / 借入 ¥{{ fmtMoney(summary.borrowAmount) }}（{{ summary.progressPercent }}%）</div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 新增收支弹窗 -->
    <div v-if="showRecordModal" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 glass-modal">
      <div class="apple-card w-full max-w-md relative">
        <button class="absolute top-4 right-4 text-gray-400 hover:text-gray-800" @click="showRecordModal = false"><i class="fa-solid fa-xmark text-xl" /></button>
        <h3 class="text-xl font-bold mb-6">{{ isEditingRecord ? '编辑收支' : '新增收支' }}</h3>
        <div class="space-y-4">
          <div>
            <label class="block text-sm mb-1 text-gray-600">类型</label>
            <div class="flex gap-2">
              <button @click="recordForm.type = 'expense'" :class="['flex-1 py-2 rounded-lg border', recordForm.type === 'expense' ? 'bg-red-500 text-white border-red-500' : 'border-gray-300']">支出</button>
              <button @click="recordForm.type = 'income'" :class="['flex-1 py-2 rounded-lg border', recordForm.type === 'income' ? 'bg-green-500 text-white border-green-500' : 'border-gray-300']">收入</button>
            </div>
          </div>
          <div><label class="block text-sm mb-1 text-gray-600">日期</label><input v-model="recordForm.date" type="date" class="apple-input" /></div>
          <div><label class="block text-sm mb-1 text-gray-600">项目</label><input v-model="recordForm.item" class="apple-input" /></div>
          <div><label class="block text-sm mb-1 text-gray-600">金额</label><input v-model.number="recordForm.amount" type="number" class="apple-input" /></div>
          <div><label class="block text-sm mb-1 text-gray-600">备注</label><input v-model="recordForm.note" class="apple-input" /></div>
        </div>
        <div class="mt-6 flex justify-end gap-3">
          <button class="btn btn-outline" @click="showRecordModal = false">取消</button>
          <button class="btn btn-primary" @click="submitRecord">{{ isEditingRecord ? '保存' : '确认' }}</button>
        </div>
      </div>
    </div>

    <!-- 新增借贷弹窗 -->
    <div v-if="showLoanModal" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 glass-modal">
      <div class="apple-card w-full max-w-md relative">
        <button class="absolute top-4 right-4 text-gray-400 hover:text-gray-800" @click="showLoanModal = false"><i class="fa-solid fa-xmark text-xl" /></button>
        <h3 class="text-xl font-bold mb-6">{{ isEditingLoan ? '编辑借贷' : '新增借贷' }}</h3>
        <div class="space-y-4">
          <div>
            <label class="block text-sm mb-1 text-gray-600">类型</label>
            <div class="flex gap-2">
              <button @click="loanForm.type = 'borrow'" :class="['flex-1 py-2 rounded-lg border', loanForm.type === 'borrow' ? 'bg-blue-500 text-white border-blue-500' : 'border-gray-300']">借入</button>
              <button @click="loanForm.type = 'lend'" :class="['flex-1 py-2 rounded-lg border', loanForm.type === 'lend' ? 'bg-amber-500 text-white border-amber-500' : 'border-gray-300']">还款</button>
            </div>
          </div>
          <div><label class="block text-sm mb-1 text-gray-600">日期</label><input v-model="loanForm.date" type="date" class="apple-input" /></div>
          <div><label class="block text-sm mb-1 text-gray-600">往来方</label><select v-model="loanForm.counterparty" class="apple-select"><option>PT工作公费</option><option>家庭账户</option></select></div>
          <div><label class="block text-sm mb-1 text-gray-600">金额</label><input v-model.number="loanForm.amount" type="number" class="apple-input" /></div>
          <div><label class="block text-sm mb-1 text-gray-600">备注</label><input v-model="loanForm.note" class="apple-input" /></div>
        </div>
        <div class="mt-6 flex justify-end gap-3">
          <button class="btn btn-outline" @click="showLoanModal = false">取消</button>
          <button class="btn btn-warning" @click="submitLoan">{{ isEditingLoan ? '保存' : '确认' }}</button>
        </div>
      </div>
    </div>
  </div>
</template>
