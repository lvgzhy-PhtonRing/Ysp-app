import { beforeEach, describe, expect, it, vi } from 'vitest'
import { loadData, state } from '../../data/store'
import {
  addMonthlyAllowance, addPaytonExpense, addPaytonLoanEvent, addPaytonTransfer,
  createPaytonLoan, deletePaytonExpense, deletePaytonLoanEvent, deletePaytonTransfer,
  getPaytonAccountForItem, getPaytonFund, updatePaytonExpense, updatePaytonLoanEvent,
  updatePaytonTransfer,
} from './usePaytonFinance'

describe('Payton finance', () => {
  beforeEach(() => {
    loadData({ ownerRegistry: { papa: { label: 'Papa' }, payton: {
      label: 'Payton', pocketBalance: 100, investBalance: 300, monthlyAllowance: 200,
      openingAt: '2026-10-15', loans: [{ id: 'l1', name: 'loan', amount: 100, remaining: 80, status: 'active', events: [] }], accountTransfers: [],
    } } })
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {}, removeItem: () => {} })
  })

  it('calculates signed fund and maps long-term versus investment inventory to accounts', () => {
    expect(getPaytonFund()).toBe(320)
    expect(getPaytonFund({ payton: { pocketBalance: -305.96, investBalance: 366.54, loans: [{ status: 'active', remaining: 4000 }] } })).toBe(-3939.42)
    expect(getPaytonAccountForItem({ owner: 'payton', isLongTerm: true })).toBe('pocket')
    expect(getPaytonAccountForItem({ owner: 'payton', isLongTerm: false })).toBe('invest')
  })

  it('Payton ordinary income/expense changes pocket only and edits/deletes by reversing the delta', () => {
    const expense = addPaytonExpense({ type: 'expense', date: '2026-10-20', item: 'snack', amount: 20 })
    expect(state.ownerRegistry.payton.pocketBalance).toBe(80)
    expect(state.financeRecords.find((record) => record.id === expense.id).owner).toBe('payton')
    expect(state.financeRecords.filter((record) => record.owner === 'papa')).toHaveLength(0)
    updatePaytonExpense(expense.id, { amount: 35, type: 'income' })
    expect(state.ownerRegistry.payton.pocketBalance).toBe(135)
    deletePaytonExpense(expense.id)
    expect(state.ownerRegistry.payton.pocketBalance).toBe(100)
  })

  it('adds one allowance per month and adjusts its balance when edited or removed', () => {
    const record = addMonthlyAllowance('2026-10-22')
    expect(record.amount).toBe(200)
    expect(state.ownerRegistry.payton.pocketBalance).toBe(300)
    expect(addMonthlyAllowance('2026-10-31')).toBe(false)
    updatePaytonExpense(record.id, { amount: 150 })
    expect(state.ownerRegistry.payton.pocketBalance).toBe(250)
    deletePaytonExpense(record.id)
    expect(state.ownerRegistry.payton.pocketBalance).toBe(100)
  })

  it('tracks loan drawdown and repayment without changing the fund; edits and deletion reverse events', () => {
    const loan = createPaytonLoan({ name: 'new', amount: 50, date: '2026-10-20' })
    expect(state.ownerRegistry.payton.investBalance).toBe(350)
    expect(getPaytonFund()).toBe(320)
    const repayment = addPaytonLoanEvent(loan.id, { type: 'repay', amount: 20, date: '2026-10-21' })
    expect(loan.remaining).toBe(30)
    expect(state.ownerRegistry.payton.investBalance).toBe(330)
    updatePaytonLoanEvent(loan.id, repayment.id, { amount: 10 })
    expect(loan.remaining).toBe(40)
    expect(state.ownerRegistry.payton.investBalance).toBe(340)
    deletePaytonLoanEvent(loan.id, repayment.id)
    expect(loan.remaining).toBe(50)
    expect(state.ownerRegistry.payton.investBalance).toBe(350)
  })

  it('applies new borrow and repayment events to both investment and loan remaining', () => {
    const loan = state.ownerRegistry.payton.loans[0]
    const borrow = addPaytonLoanEvent(loan.id, { type: 'borrow', amount: 25 })
    expect(loan.remaining).toBe(105)
    expect(state.ownerRegistry.payton.investBalance).toBe(325)
    updatePaytonLoanEvent(loan.id, borrow.id, { amount: 5 })
    expect(loan.remaining).toBe(85)
    expect(state.ownerRegistry.payton.investBalance).toBe(305)
    deletePaytonLoanEvent(loan.id, borrow.id)
    expect(loan.remaining).toBe(80)
    expect(state.ownerRegistry.payton.investBalance).toBe(300)
  })

  it('keeps internal transfers balanced across edits and deletion', () => {
    const transfer = addPaytonTransfer({ fromAccount: 'pocket', toAccount: 'invest', amount: 40, date: '2026-10-20' })
    expect(state.ownerRegistry.payton.pocketBalance).toBe(60)
    expect(state.ownerRegistry.payton.investBalance).toBe(340)
    expect(getPaytonFund()).toBe(320)
    updatePaytonTransfer(transfer.id, { fromAccount: 'invest', toAccount: 'pocket', amount: 25 })
    expect(state.ownerRegistry.payton.pocketBalance).toBe(125)
    expect(state.ownerRegistry.payton.investBalance).toBe(275)
    expect(getPaytonFund()).toBe(320)
    deletePaytonTransfer(transfer.id)
    expect(state.ownerRegistry.payton.pocketBalance).toBe(100)
    expect(state.ownerRegistry.payton.investBalance).toBe(300)
  })
})
