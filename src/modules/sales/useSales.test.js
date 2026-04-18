import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { loadData, state as store } from '../../data/store'
import { editSaleRecord, getSalesStats, submitSell } from './useSales'

function readDesktopAJson() {
  const __filename = fileURLToPath(import.meta.url)
  const __dirname = path.dirname(__filename)
  const filePath = path.resolve(__dirname, '../../../../a.json')
  const raw = fs.readFileSync(filePath, 'utf8')
  return JSON.parse(raw)
}

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
    const original = readDesktopAJson()
    loadData(original)

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
    const original = readDesktopAJson()
    loadData(original)

    const stats = getSalesStats(store.items)

    expect(stats.totalSoldCount).toBe(107)
    expect(Number.isNaN(stats.totalProfit)).toBe(false)
    expect(stats.recoveryRate).toBeGreaterThanOrEqual(0)
    expect(stats.recoveryRate).toBeLessThanOrEqual(10)
  })

  it('test3 editSaleRecord', () => {
    const original = readDesktopAJson()
    loadData(original)

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
})
