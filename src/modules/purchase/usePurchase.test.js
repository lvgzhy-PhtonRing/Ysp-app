import { beforeEach, describe, expect, it, vi } from 'vitest'
import sampleData from '../../__tests__/fixtures/sampleData.json'
import { calcItemCost } from '../../utils/calc'
import { loadData, state as store } from '../../data/store'
import { addPurchaseItem, batchMoveToInventory, moveToInventory } from './usePurchase'

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
    loadData(sampleData)
    const before = store.items.length

    const item = addPurchaseItem({
      name: '测试商品',
      purchaseDetails: {
        preTransferCost: 123.45,
      },
    })

    expect(store.items.length).toBe(before + 1)
    expect(item.status).toBe('purchase')
    expect(item.owner).toBe('papa')
    expect(item.id).toBeTruthy()
    expect(typeof item.sid).toBe('string')
    expect(/^JP-\d{4}$/.test(item.sid)).toBe(true)
  })

  it('assigns mixed owners when items enter inventory and charges final Payton cost by account', () => {
    loadData({ items: [], ownerRegistry: { papa: {}, payton: { pocketBalance: 100, investBalance: 200, loans: [], accountTransfers: [] } } })
    const keep = addPurchaseItem({ name: 'keep', cost: 20, purchaseDetails: { preTransferCost: 20 } })
    const invest = addPurchaseItem({ name: 'invest', cost: 30, purchaseDetails: { preTransferCost: 30 } })
    batchMoveToInventory([keep.id, invest.id], {
      [keep.id]: { owner: 'payton', isLongTerm: true },
      [invest.id]: { owner: 'payton', isLongTerm: false },
    })
    expect(keep.owner).toBe('payton')
    expect(invest.owner).toBe('payton')
    expect(store.ownerRegistry.payton.pocketBalance).toBe(80)
    expect(store.ownerRegistry.payton.investBalance).toBe(170)
  })

  it('supports assigning a single non-transfer purchase to Payton', () => {
    loadData({ items: [], ownerRegistry: { papa: {}, payton: { pocketBalance: 100, investBalance: 200, loans: [], accountTransfers: [] } } })
    const item = addPurchaseItem({ name: 'single', purchaseDetails: { preTransferCost: 25 } })
    moveToInventory(item.id, { [item.id]: { owner: 'payton', isLongTerm: false } })
    expect(item.owner).toBe('payton')
    expect(store.ownerRegistry.payton.investBalance).toBe(175)
  })

  it('test2 submitTransfer related cost formula consistency on real data', () => {
    loadData(sampleData)

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
    loadData(sampleData)

    const item = store.items.find((x) => x.status === 'purchase')
    expect(item).toBeTruthy()

    moveToInventory(item.id)
    expect(item.status).toBe('inventory')
  })
})
