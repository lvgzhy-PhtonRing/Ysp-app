import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { loadData, state as store } from '../../data/store'
import {
  addFinanceRecord,
  addLoanRecord,
  deleteFinanceRecord,
  getFinanceStats,
  updateLoanRecord,
} from './useFinance'

function readDesktopAJson() {
  const __filename = fileURLToPath(import.meta.url)
  const __dirname = path.dirname(__filename)
  const filePath = path.resolve(__dirname, '../../../../a.json')
  const raw = fs.readFileSync(filePath, 'utf8')
  return JSON.parse(raw)
}

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
    const original = readDesktopAJson()
    loadData(original)

    const initialCount = Array.isArray(original?.finance?.records) ? original.finance.records.length : 0
    expect(store.financeRecords.length).toBe(initialCount)

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
    const original = readDesktopAJson()
    loadData(original)

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
    const original = readDesktopAJson()
    loadData(original)

    const stats = getFinanceStats(store.financeRecords, store.loanRecords)

    expect(stats.totalIncome).toBeGreaterThanOrEqual(0)
    expect(stats.totalExpense).toBeGreaterThanOrEqual(0)
    expect(stats.netBalance).toBeCloseTo(stats.totalIncome - stats.totalExpense, 2)
  })
})
