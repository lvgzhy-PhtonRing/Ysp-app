// 公共收支模块逻辑层（无 UI）

import { addOperationLog, saveToLocalStorage, state as store } from '../../data/store'

function toNumber(value, fallback = 0) {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

function genId() {
  return Date.now() + Math.floor(Math.random() * 1000)
}

export function addFinanceRecord(recordData = {}) {
  const record = {
    id: genId(),
    type: recordData.type,
    date: recordData.date || '',
    item: recordData.item || '',
    amount: toNumber(recordData.amount),
    note: recordData.note || '',
  }

  store.financeRecords.push(record)
  saveToLocalStorage()
  addOperationLog('finance_add_record', `新增收支: ${record.item}`, { type: record.type, amount: record.amount })
  return record
}

export function deleteFinanceRecord(recordId) {
  const idx = store.financeRecords.findIndex((x) => x.id === recordId)
  if (idx < 0) return false

  store.financeRecords.splice(idx, 1)
  saveToLocalStorage()
  addOperationLog('finance_delete_record', `删除收支记录`, { recordId })
  return true
}

export function updateFinanceRecord(recordId, patch = {}) {
  const record = store.financeRecords.find((x) => x.id === recordId)
  if (!record) return false

  record.type = patch.type ?? record.type
  record.date = patch.date ?? record.date
  record.item = patch.item ?? record.item
  record.amount = patch.amount !== undefined ? toNumber(patch.amount) : record.amount
  record.note = patch.note ?? record.note

  saveToLocalStorage()
  addOperationLog('finance_update_record', `编辑收支: ${record.item}`, { type: record.type, amount: record.amount })
  return record
}

export function addLoanRecord(loanData = {}) {
  const loan = {
    id: genId(),
    type: loanData.type,
    date: loanData.date || '',
    counterparty: loanData.counterparty || '',
    amount: toNumber(loanData.amount),
    note: loanData.note || '',
  }

  store.loanRecords.push(loan)
  saveToLocalStorage()
  addOperationLog('finance_add_loan', `新增借贷`, { type: loan.type, amount: loan.amount })
  return loan
}

export function updateLoanRecord(loanId, patch = {}) {
  const loan = store.loanRecords.find((x) => x.id === loanId)
  if (!loan) return false

  loan.type = patch.type ?? loan.type
  loan.date = patch.date ?? loan.date
  loan.counterparty = patch.counterparty ?? loan.counterparty
  loan.amount = patch.amount !== undefined ? toNumber(patch.amount) : loan.amount
  loan.note = patch.note ?? loan.note

  saveToLocalStorage()
  addOperationLog('finance_update_loan', `编辑借贷`, {
    loanId,
  })
  return loan
}

export function deleteLoanRecord(loanId) {
  const idx = store.loanRecords.findIndex((x) => x.id === loanId)
  if (idx < 0) return false

  store.loanRecords.splice(idx, 1)
  saveToLocalStorage()
  addOperationLog('finance_delete_loan', `删除借贷`, { loanId })
  return true
}

export function getFinanceStats(financeRecords = [], loanRecords = []) {
  const totalIncome = financeRecords.reduce(
    (sum, r) => (r?.type === 'income' ? sum + toNumber(r.amount) : sum),
    0,
  )

  const totalExpense = financeRecords.reduce(
    (sum, r) => (r?.type === 'expense' ? sum + toNumber(r.amount) : sum),
    0,
  )

  const totalBorrowed = loanRecords.reduce(
    (sum, r) => (r?.type === 'borrow' ? sum + toNumber(r.amount) : sum),
    0,
  )

  const totalLent = loanRecords.reduce(
    (sum, r) => (r?.type === 'lend' ? sum + toNumber(r.amount) : sum),
    0,
  )

  return {
    totalIncome,
    totalExpense,
    netBalance: totalIncome - totalExpense,
    totalBorrowed,
    totalLent,
    netLoan: totalBorrowed - totalLent,
  }
}

export function useFinance() {
  return {
    addFinanceRecord,
    deleteFinanceRecord,
    addLoanRecord,
    updateLoanRecord,
    deleteLoanRecord,
    getFinanceStats,
  }
}
