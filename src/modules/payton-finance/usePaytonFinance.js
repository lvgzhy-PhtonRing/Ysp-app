import { addOperationLog, saveToLocalStorage, state } from '../../data/store'

const payton = (registry = state.ownerRegistry) => registry?.payton
const number = (value) => Number.isFinite(Number(value)) ? Number(value) : 0
const makeId = () => `${Date.now()}_${Math.floor(Math.random() * 1e9)}`
const accountNames = new Set(['pocket', 'invest'])

export function getPaytonFund(registry = state.ownerRegistry) {
  const owner = payton(registry)
  if (!owner) return 0
  const loans = Array.isArray(owner.loans) ? owner.loans : []
  const remaining = loans.reduce((sum, loan) => sum + (loan?.status === 'active' ? number(loan.remaining) : 0), 0)
  return number(owner.pocketBalance) + number(owner.investBalance) - remaining
}

export function getPaytonAccountForItem(item) {
  if (item?.owner !== 'payton') return null
  return item.isLongTerm ? 'pocket' : 'invest'
}

export function adjustPaytonBalance(account, delta) {
  if (!accountNames.has(account)) throw new Error(`未知 Payton 账户：${account}`)
  const owner = payton()
  if (!owner) throw new Error('Payton 资金注册表缺失')
  owner[account === 'pocket' ? 'pocketBalance' : 'investBalance'] = number(owner[account === 'pocket' ? 'pocketBalance' : 'investBalance']) + number(delta)
  return owner[account === 'pocket' ? 'pocketBalance' : 'investBalance']
}

function persist(type, message, detail = {}) {
  saveToLocalStorage()
  addOperationLog(type, message, { ...detail, owner: 'payton' })
}

function recordEffect(record, sign = 1) {
  if (record.type !== 'income' && record.type !== 'expense') throw new Error('收支类型必须是 income 或 expense')
  adjustPaytonBalance('pocket', (record.type === 'income' ? 1 : -1) * number(record.amount) * sign)
}

function addFinanceRecord(data) {
  const record = {
    id: data.id ?? makeId(), owner: 'payton', type: data.type, date: data.date || '',
    item: data.item || '', amount: number(data.amount), note: data.note || '',
  }
  recordEffect(record)
  state.financeRecords.push(record)
  return record
}

export function addPaytonExpense(data = {}) {
  const record = addFinanceRecord(data)
  persist('finance_add_record', `Payton 收支：${record.item}`, { recordId: record.id, type: record.type, amount: record.amount })
  return record
}

export function updatePaytonExpense(id, patch = {}) {
  const record = state.financeRecords.find((item) => item.id === id && item.owner === 'payton')
  if (!record) return false
  const next = {
    ...record, type: patch.type ?? record.type, date: patch.date ?? record.date,
    item: patch.item ?? record.item, amount: patch.amount === undefined ? record.amount : number(patch.amount),
    note: patch.note ?? record.note,
  }
  if (next.type !== 'income' && next.type !== 'expense') throw new Error('收支类型必须是 income 或 expense')
  recordEffect(record, -1)
  Object.assign(record, next)
  recordEffect(record)
  persist('finance_update_record', `编辑 Payton 收支：${record.item}`, { recordId: id, type: record.type, amount: record.amount })
  return record
}

export function deletePaytonExpense(id) {
  const index = state.financeRecords.findIndex((item) => item.id === id && item.owner === 'payton')
  if (index < 0) return false
  const [record] = state.financeRecords.splice(index, 1)
  recordEffect(record, -1)
  persist('finance_delete_record', `删除 Payton 收支：${record.item}`, { recordId: id, amount: record.amount })
  return true
}

export function addMonthlyAllowance(date = new Date().toISOString().slice(0, 10)) {
  const month = String(date).slice(0, 7)
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error('零花日期无效')
  const existing = state.financeRecords.some((record) => record.owner === 'payton' && record.item === '每月零花' && String(record.date).slice(0, 7) === month)
  if (existing) return false
  const owner = payton()
  const record = addFinanceRecord({ type: 'income', date, item: '每月零花', amount: number(owner?.monthlyAllowance) || 200, note: '手动存入本月零花' })
  persist('finance_add_record', `存入 Payton ${month} 零花`, { recordId: record.id, amount: record.amount })
  return record
}

function loanById(id) {
  return payton()?.loans?.find((loan) => loan.id === id)
}

function applyLoanEffect(loan, event, sign = 1, allowNegative = false) {
  if (event.type !== 'borrow' && event.type !== 'repay') throw new Error('贷款事件必须是 borrow 或 repay')
  const amount = number(event.amount)
  if (amount <= 0) throw new Error('贷款事件金额必须大于 0')
  const delta = (event.type === 'borrow' ? 1 : -1) * amount * sign
  const remaining = number(loan.remaining) + delta
  if (!allowNegative && remaining < -0.000001) throw new Error('还款金额超过贷款剩余')
  loan.remaining = Math.max(0, remaining)
  loan.status = loan.remaining <= 0 ? 'repaid' : 'active'
  adjustPaytonBalance('invest', delta)
}

export function createPaytonLoan(data = {}) {
  const amount = number(data.amount)
  if (amount <= 0) throw new Error('贷款金额必须大于 0')
  const event = { id: makeId(), type: 'borrow', date: data.date || '', amount, note: data.note || '' }
  const loan = {
    id: data.id ?? makeId(), name: data.name || '', note: data.note || '', amount,
    remaining: 0, startDate: data.startDate || data.date || '', dueDate: data.dueDate || '',
    status: 'active', events: [],
  }
  applyLoanEffect(loan, event)
  loan.events.push(event)
  payton().loans.push(loan)
  persist('finance_add_loan', `新增 Payton 贷款：${loan.name}`, { loanId: loan.id, amount })
  return loan
}

export function addPaytonLoanEvent(loanId, data = {}) {
  const loan = loanById(loanId)
  if (!loan) return false
  const event = { id: data.id ?? makeId(), type: data.type, date: data.date || '', amount: number(data.amount), note: data.note || '' }
  applyLoanEffect(loan, event)
  loan.events = [...(loan.events || []), event]
  persist('finance_update_loan', `Payton 贷款${event.type === 'borrow' ? '借入' : '还款'}：${loan.name}`, { loanId, eventId: event.id, amount: event.amount })
  return event
}

export function updatePaytonLoanEvent(loanId, eventId, patch = {}) {
  const loan = loanById(loanId)
  const event = loan?.events?.find((item) => item.id === eventId)
  if (!event) return false
  const next = { ...event, type: patch.type ?? event.type, date: patch.date ?? event.date, amount: patch.amount === undefined ? event.amount : number(patch.amount), note: patch.note ?? event.note }
  if (!['borrow', 'repay'].includes(next.type) || number(next.amount) <= 0) throw new Error('贷款事件类型或金额无效')
  applyLoanEffect(loan, event, -1, true)
  const before = { ...event }
  Object.assign(event, next)
  try {
    applyLoanEffect(loan, event)
  } catch (error) {
    Object.assign(event, before)
    applyLoanEffect(loan, event)
    throw error
  }
  persist('finance_update_loan', `编辑 Payton 贷款事件：${loan.name}`, { loanId, eventId })
  return event
}

export function deletePaytonLoanEvent(loanId, eventId) {
  const loan = loanById(loanId)
  const index = loan?.events?.findIndex((event) => event.id === eventId) ?? -1
  if (index < 0) return false
  const [event] = loan.events.splice(index, 1)
  applyLoanEffect(loan, event, -1, true)
  persist('finance_update_loan', `删除 Payton 贷款事件：${loan.name}`, { loanId, eventId })
  return true
}

function validateTransfer(data) {
  if (!accountNames.has(data.fromAccount) || !accountNames.has(data.toAccount) || data.fromAccount === data.toAccount) throw new Error('互转账户无效')
  if (number(data.amount) <= 0) throw new Error('互转金额必须大于 0')
}

function applyTransfer(transfer, sign = 1) {
  adjustPaytonBalance(transfer.fromAccount, -number(transfer.amount) * sign)
  adjustPaytonBalance(transfer.toAccount, number(transfer.amount) * sign)
}

export function addPaytonTransfer(data = {}) {
  validateTransfer(data)
  const transfer = { id: data.id ?? makeId(), fromAccount: data.fromAccount, toAccount: data.toAccount, amount: number(data.amount), date: data.date || '', note: data.note || '' }
  applyTransfer(transfer)
  payton().accountTransfers.push(transfer)
  persist('finance_add_record', '新增 Payton 账户互转', { transferId: transfer.id, amount: transfer.amount })
  return transfer
}

export function updatePaytonTransfer(id, patch = {}) {
  const transfer = payton()?.accountTransfers?.find((item) => item.id === id)
  if (!transfer) return false
  const next = { ...transfer, ...patch, amount: patch.amount === undefined ? transfer.amount : number(patch.amount) }
  validateTransfer(next)
  applyTransfer(transfer, -1)
  Object.assign(transfer, next)
  applyTransfer(transfer)
  persist('finance_update_record', '编辑 Payton 账户互转', { transferId: id, amount: transfer.amount })
  return transfer
}

export function deletePaytonTransfer(id) {
  const transfers = payton()?.accountTransfers
  const index = transfers?.findIndex((item) => item.id === id) ?? -1
  if (index < 0) return false
  const [transfer] = transfers.splice(index, 1)
  applyTransfer(transfer, -1)
  persist('finance_delete_record', '删除 Payton 账户互转', { transferId: id, amount: transfer.amount })
  return true
}
