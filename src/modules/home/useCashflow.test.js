import { describe, it, expect } from 'vitest'
import { getCashflowData } from './useCashflow'

function makeStore(overrides = {}) {
  return {
    items: [],
    snapshots: [],
    loanRecords: [],
    calc: { debt: 0 },
    ...overrides,
  }
}

describe('getCashflowData', () => {
  const now = new Date('2026-06-22')

  it('returns zeroes for empty store', () => {
    const result = getCashflowData(makeStore(), now)
    expect(result.current.netCollection).toBe(0)
    expect(result.current.inventoryDigestion).toBe(0)
    expect(result.current.procurement).toBe(0)
    expect(result.current.debt).toBe(0)
  })

  it('computes netCollection and inventoryDigestion from sold items this month', () => {
    const store = makeStore({
      items: [
        { status: 'sold', cost: 100, saleDetails: { date: '2026-06-15', profit: 50 } },
        { status: 'sold', cost: 200, saleDetails: { date: '2026-06-20', profit: 80 } },
        { status: 'sold', cost: 300, saleDetails: { date: '2026-05-10', profit: 60 } },
        { status: 'purchase', cost: 500 },
      ],
    })
    const result = getCashflowData(store, now)
    // netCollection = (100+50) + (200+80) = 430
    expect(result.current.netCollection).toBe(430)
    // inventoryDigestion = 100 + 200 = 300
    expect(result.current.inventoryDigestion).toBe(300)
  })

  it('computes procurement from purchase date month', () => {
    const store = makeStore({
      items: [
        { cost: 100, purchaseDetails: { date: '2026-06-05' } },
        { cost: 200, purchaseDetails: { date: '2026-06-18' } },
        { cost: 50, purchaseDetails: { date: '2026-05-01' } },
        { cost: 999, purchaseDetails: {} },
      ],
    })
    const result = getCashflowData(store, now)
    expect(result.current.procurement).toBe(300)
  })

  it('computes current debt from calc + loanBalance', () => {
    const store = makeStore({
      calc: { debt: 5000 },
      loanRecords: [
        { type: 'borrow', amount: 1000, isRepaid: false },
        { type: 'lend', amount: 300, isRepaid: false },
        { type: 'borrow', amount: 2000, repaid: true },
      ],
    })
    const result = getCashflowData(store, now)
    // 5000 + 1000 - 300 = 5700
    expect(result.current.debt).toBe(5700)
  })

  it('returns 6 months in chronological order', () => {
    const store = makeStore()
    const result = getCashflowData(store, now)
    expect(result.last6Months).toHaveLength(6)
    expect(result.last6Months[0]).toMatchObject({ year: 2026, month: 1 })
    expect(result.last6Months[5]).toMatchObject({ year: 2026, month: 6 })
  })

  it('returns 3 months for mini bars', () => {
    const store = makeStore()
    const result = getCashflowData(store, now)
    expect(result.last3Months).toHaveLength(3)
    expect(result.last3Months[2]).toMatchObject({ year: 2026, month: 6 })
  })

  it('reads debt history from snapshots when available', () => {
    const store = makeStore({
      snapshots: [
        { date: '2026-05-15', calc: { debt: 3000 }, finance: { loanBalance: 400 } },
        { date: '2026-05-25', calc: { debt: 3100 }, finance: { loanBalance: 400 } },
      ],
    })
    const result = getCashflowData(store, now)
    // May debt from last snapshot: 3100 + 400 = 3500
    const mayData = result.last6Months.find(m => m.month === 5)
    expect(mayData?.debt).toBe(3500)
  })

  it('returns null debt for months without snapshots', () => {
    const store = makeStore({ snapshots: [] })
    const result = getCashflowData(store, now)
    const janData = result.last6Months.find(m => m.month === 1)
    expect(janData?.debt).toBeNull()
  })

  it('handles cross-year boundary (Dec→Jan)', () => {
    const dec = new Date('2025-12-15')
    const result = getCashflowData(makeStore(), dec)
    expect(result.last6Months[0]).toMatchObject({ year: 2025, month: 7 })
    expect(result.last6Months[5]).toMatchObject({ year: 2025, month: 12 })
  })
})
