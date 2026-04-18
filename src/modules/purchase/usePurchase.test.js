import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { calcItemCost } from '../../utils/calc'
import { loadData, state as store } from '../../data/store'
import { addPurchaseItem, moveToInventory } from './usePurchase'

function readDesktopAJson() {
  const __filename = fileURLToPath(import.meta.url)
  const __dirname = path.dirname(__filename)
  const filePath = path.resolve(__dirname, '../../../../a.json')
  const raw = fs.readFileSync(filePath, 'utf8')
  return JSON.parse(raw)
}

describe('usePurchase logic', () => {
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

  it('test1 addPurchaseItem', () => {
    const before = store.items.length

    const item = addPurchaseItem({
      name: '测试商品',
      purchaseDetails: {
        preTransferCost: 123.45,
      },
    })

    expect(store.items.length).toBe(before + 1)
    expect(item.status).toBe('purchase')
    expect(item.id).toBeTruthy()
    expect(typeof item.sid).toBe('string')
    expect(/^JP-\d{4}$/.test(item.sid)).toBe(true)
  })

  it('test2 submitTransfer related cost formula consistency on real data', () => {
    const original = readDesktopAJson()
    loadData(original)

    const candidate =
      store.items.find((x) => x.status === 'purchase' && x.purchaseDetails?.transferId && x.sid === 'JP-0126') ||
      store.items.find((x) => x.status === 'purchase' && x.purchaseDetails?.transferId)

    expect(candidate).toBeTruthy()

    const preTransferCost = Number(candidate.purchaseDetails?.preTransferCost)
    const transferCost = Number(candidate.purchaseDetails?.transferCost)
    const expectedCost = calcItemCost(preTransferCost, transferCost)

    expect(Number(candidate.cost)).toBeCloseTo(expectedCost, 2)
  })

  it('test3 moveToInventory', () => {
    const original = readDesktopAJson()
    loadData(original)

    const item = store.items.find((x) => x.status === 'purchase')
    expect(item).toBeTruthy()

    moveToInventory(item.id)
    expect(item.status).toBe('inventory')
  })
})
