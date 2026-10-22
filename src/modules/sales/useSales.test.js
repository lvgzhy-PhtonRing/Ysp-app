import { beforeEach, describe, expect, it, vi } from 'vitest'
import sampleData from '../../__tests__/fixtures/sampleData.json'
import { loadData, state as store } from '../../data/store'
import { calcAlipayBalance } from '../../utils/calc'
import { editSaleRecord, getOwnerInventory, getSalesChannelStats, getSalesStats, submitSell } from './useSales'
import { DEFAULT_SALES_CHANNEL, filterSalesByShop, SALES_CHANNELS } from './salesChannels'

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
    expect(item.saleDetails.shop).toBe('PhtonRIng')
    const expected = 500 - 10 - 500 * 0.05 - 0 - Number(item.cost)
    expect(Number(item.saleDetails.profit)).toBeCloseTo(expected, 2)
  })

  it('filters the current sales rows by shop while keeping the all-shops view intact', () => {
    const sales = [
      { id: 'phton', status: 'sold', cost: 70, saleDetails: { shop: 'PhtonRIng', price: 100, profit: 30 } },
      { id: 'side', status: 'sold', cost: 150, saleDetails: { shop: '侧空翻棉', price: 200, profit: 50 } },
      { id: 'other', status: 'sold', cost: 40, saleDetails: { shop: '其它', price: 60, profit: 20 } },
    ]

    expect(filterSalesByShop(sales, '全部')).toEqual(sales)
    expect(filterSalesByShop(sales, '侧空翻棉').map((item) => item.id)).toEqual(['side'])
    expect(filterSalesByShop(sales, '其它').map((item) => item.id)).toEqual(['other'])
    expect(getSalesStats(filterSalesByShop(sales, '侧空翻棉'))).toMatchObject({
      totalSoldCount: 1,
      totalRevenue: 200,
      totalProfit: 50,
    })
  })

  it('summarizes sales by shop and assigns undated legacy sales to Other', () => {
    const stats = getSalesChannelStats([
      { status: 'sold', cost: 70, saleDetails: { shop: 'PhtonRIng', price: 100, profit: 30 } },
      { status: 'sold', cost: 150, saleDetails: { shop: '侧空翻棉', price: 200, profit: 50 } },
      { status: 'sold', cost: 40, saleDetails: { price: 60, profit: 20 } },
    ])

    expect(stats.map(({ shop, totalSoldCount, totalRevenue, totalProfit }) => ({ shop, totalSoldCount, totalRevenue, totalProfit }))).toEqual([
      { shop: 'PhtonRIng', totalSoldCount: 1, totalRevenue: 100, totalProfit: 30 },
      { shop: '侧空翻棉', totalSoldCount: 1, totalRevenue: 200, totalProfit: 50 },
      { shop: '其它', totalSoldCount: 1, totalRevenue: 60, totalProfit: 20 },
    ])
  })

  it('supports the three shop choices and saves selected shop changes when editing a sale', () => {
    expect(SALES_CHANNELS).toEqual(['PhtonRIng', '侧空翻棉', '其它'])
    loadData({ items: [{ id: 'shop-sale', status: 'inventory', cost: 10 }] })
    submitSell('shop-sale', { price: 20, date: '2026-10-20', shop: '侧空翻棉' })
    expect(store.items[0].saleDetails.shop).toBe('侧空翻棉')

    editSaleRecord('shop-sale', { shop: '其它' })
    expect(store.items[0].saleDetails.shop).toBe('其它')
    expect(DEFAULT_SALES_CHANNEL).toBe('PhtonRIng')
  })

  it('test2 getSalesStats', () => {
    loadData(sampleData)

    const stats = getSalesStats(store.items)
    const soldItems = store.items.filter((x) => x.status === 'sold')

    expect(stats.totalSoldCount).toBe(soldItems.length)
    expect(Number.isNaN(stats.totalProfit)).toBe(false)
    expect(stats.recoveryRate).toBeGreaterThanOrEqual(0)
  })

  it('filters add-sale inventory by the selected owner', () => {
    const inventory = [
      { id: 'papa', owner: 'papa', status: 'inventory' },
      { id: 'payton', owner: 'payton', status: 'inventory' },
      { id: 'legacy', status: 'inventory' },
    ]

    expect(getOwnerInventory(inventory, 'papa').map((item) => item.id)).toEqual(['papa', 'legacy'])
    expect(getOwnerInventory(inventory, 'payton').map((item) => item.id)).toEqual(['payton'])
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
