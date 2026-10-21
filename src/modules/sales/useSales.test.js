import { beforeEach, describe, expect, it, vi } from 'vitest'
import sampleData from '../../__tests__/fixtures/sampleData.json'
import { loadData, state as store } from '../../data/store'
import { calcAlipayBalance } from '../../utils/calc'
import { editSaleRecord, getSalesStats, submitSell } from './useSales'

describe('useSales logic', () => {
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

  it('test1 submitSell', () => {
    loadData(sampleData)

    const item = store.items.find((x) => x.status === 'inventory')
    expect(item).toBeTruthy()

    submitSell(item.id, {
      price: 500,
      express: 10,
      feeRate: 0.05,
      deduction: 0,
      date: '2026-04-01',
    })

    expect(item.status).toBe('sold')
    const expected = 500 - 10 - 500 * 0.05 - 0 - Number(item.cost)
    expect(Number(item.saleDetails.profit)).toBeCloseTo(expected, 2)
  })

  it('test2 getSalesStats', () => {
    loadData(sampleData)

    const stats = getSalesStats(store.items)
    const soldItems = store.items.filter((x) => x.status === 'sold')

    expect(stats.totalSoldCount).toBe(soldItems.length)
    expect(Number.isNaN(stats.totalProfit)).toBe(false)
    expect(stats.recoveryRate).toBeGreaterThanOrEqual(0)
  })

  it('test3 editSaleRecord', () => {
    loadData(sampleData)

    const item = store.items.find((x) => x.status === 'sold' && x.saleDetails)
    expect(item).toBeTruthy()

    const nextPrice = Number(item.saleDetails.price) + 100
    editSaleRecord(item.id, { price: nextPrice })

    const expected =
      Number(item.saleDetails.price) -
      Number(item.saleDetails.express) -
      Number(item.saleDetails.price) * Number(item.saleDetails.feeRate) -
      Number(item.saleDetails.deduction) -
      Number(item.cost)

    expect(Number(item.saleDetails.profit)).toBeCloseTo(expected, 2)
  })

  it('Payton sales add net proceeds to the selected account and edits adjust only the delta', () => {
    loadData({ items: [{ id: 'payton', owner: 'payton', status: 'inventory', cost: 10, isLongTerm: false }] })
    const item = store.items[0]
    submitSell(item.id, { price: 100, express: 5, feeRate: 0.1, deduction: 2, date: '2026-10-19' })
    expect(store.ownerRegistry.payton.investBalance).toBe(83)
    editSaleRecord(item.id, { price: 120 })
    expect(store.ownerRegistry.payton.investBalance).toBe(101)
  })

  it('records the cutoff BMW sale into Payton pocket and reproduces the accepted merged balance', () => {
    loadData({
      items: [{ id: 'bmw507', sid: '55aeffc4-b720-483f-b85e-1d85067f0189', owner: 'payton', status: 'inventory', cost: 10, isLongTerm: true }],
      calc: { debt: 119667.34, unconfirmed: 388 }, finance: { records: [], loans: [] },
      ownerRegistry: { papa: {}, payton: { pocketBalance: -305.96, investBalance: 366.54, loans: [2000, 1000, 1000].map((remaining) => ({ status: 'active', remaining })) } },
    })
    submitSell('bmw507', { price: 15, express: 0, feeRate: 0, deduction: 0, date: '2026-10-19' })
    expect(store.ownerRegistry.payton.pocketBalance).toBeCloseTo(-290.96, 2)
    const fund = store.ownerRegistry.payton.pocketBalance + store.ownerRegistry.payton.investBalance - 4000
    expect(fund).toBeCloseTo(-3924.42, 2)
    expect(calcAlipayBalance(119667.34, 6000, 22441.195, 128805.2266, 388, fund, 20487.373)).toBeCloseTo(-5496.48, 2)
  })
})
