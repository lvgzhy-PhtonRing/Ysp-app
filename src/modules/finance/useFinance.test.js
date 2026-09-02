import { beforeEach, describe, expect, it, vi } from 'vitest'
import sampleData from '../../__tests__/fixtures/sampleData.json'
import { loadData, state as store } from '../../data/store'
import {
  addFinanceRecord,
  addLoanRecord,
  deleteFinanceRecord,
  getFinanceStats,
  updateLoanRecord,
} from './useFinance'

describe('useFinance logic', () => {
  beforeEach(() => {
    loadData({})

    const localStorageMock = {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
    }
    vi.stubGlobal('localStorage', localStorageMock)
  })

  it('test1 addFinanceRecord and deleteFinanceRecord', () => {
    loadData(sampleData)

    const initialCount = store.financeRecords.length
    expect(initialCount).toBe(sampleData.finance.records.length)

    const rec = addFinanceRecord({
      type: 'expense',
      date: '2026-04-01',
      item: '测试开销',
      amount: 12.34,
      note: 'test',
    })

    expect(store.financeRecords.length).toBe(initialCount + 1)

    deleteFinanceRecord(rec.id)
    expect(store.financeRecords.length).toBe(initialCount)
  })

  it('test2 addLoanRecord and updateLoanRecord', () => {
    loadData(sampleData)

    const loan = addLoanRecord({
      type: 'borrow',
      date: '2026-04-01',
      counterparty: '测试账户',
      amount: 1000,
      note: 'test',
    })

    updateLoanRecord(loan.id, { amount: 1200, note: 'updated' })
    expect(loan.amount).toBe(1200)
    expect(loan.note).toBe('updated')
  })

  it('test3 getFinanceStats', () => {
    loadData(sampleData)

    const stats = getFinanceStats(store.financeRecords, store.loanRecords)

    expect(stats.totalIncome).toBeGreaterThanOrEqual(0)
    expect(stats.totalExpense).toBeGreaterThanOrEqual(0)
    expect(stats.netBalance).toBeCloseTo(stats.totalIncome - stats.totalExpense, 2)
  })
})