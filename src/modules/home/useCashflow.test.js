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
    expect(result.current.debt).toBeNull() // 无上月快照 → null
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
    expect(result.current.netCollection).toBe(430)
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

  it('computes new debt as month-over-month delta', () => {
    const store = makeStore({
      calc: { debt: 5000 },
      loanRecords: [
        { type: 'borrow', amount: 1000, isRepaid: false },
        { type: 'lend', amount: 300, isRepaid: false },
      ],
      snapshots: [
        // May: absolute debt = 4000
        { date: '2026-05-28', calc: { debt: 3600 }, finance: { loanBalance: 400 } },
      ],
    })
    const result = getCashflowData(store, now)
    // current live debt = 5000 + 1000 - 300 = 5700
    // May absolute debt = 3600 + 400 = 4000
    // 新增负债 = 5700 - 4000 = 1700
    expect(result.current.debt).toBe(1700)
  })

  it('returns 5 months in chronological order', () => {
    const store = makeStore()
    const result = getCashflowData(store, now)
    expect(result.last5Months).toHaveLength(5)
    expect(result.last5Months[0]).toMatchObject({ year: 2026, month: 2 })
    expect(result.last5Months[4]).toMatchObject({ year: 2026, month: 6 })
  })

  it('computes monthly debt delta from consecutive snapshots', () => {
    const store = makeStore({
      snapshots: [
        { date: '2026-04-25', calc: { debt: 3000 }, finance: { loanBalance: 200 } },
        { date: '2026-05-25', calc: { debt: 3100 }, finance: { loanBalance: 400 } },
      ],
    })
    const result = getCashflowData(store, now)
    // Apr absolute = 3000 + 200 = 3200
    // May absolute = 3100 + 400 = 3500
    // May delta = 3500 - 3200 = 300
    const mayData = result.last5Months.find(m => m.month === 5)
    expect(mayData?.debt).toBe(300)
  })

  it('returns null debt when previous month snapshot missing', () => {
    const store = makeStore({
      snapshots: [
        { date: '2026-05-25', calc: { debt: 3100 }, finance: { loanBalance: 400 } },
      ],
    })
    const result = getCashflowData(store, now)
    // May has data but April doesn't → delta = null
    const mayData = result.last5Months.find(m => m.month === 5)
    expect(mayData?.debt).toBeNull()
  })

  it('handles cross-year boundary (Dec→Jan)', () => {
    const dec = new Date('2025-12-15')
    const result = getCashflowData(makeStore(), dec)
    expect(result.last5Months[0]).toMatchObject({ year: 2025, month: 8 })
    expect(result.last5Months[4]).toMatchObject({ year: 2025, month: 12 })
  })
})
