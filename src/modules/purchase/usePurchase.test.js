import { beforeEach, describe, expect, it, vi } from 'vitest'
import sampleData from '../../__tests__/fixtures/sampleData.json'
import { calcItemCost } from '../../utils/calc'
import { loadData, state as store } from '../../data/store'
import { addPurchaseItem, batchMoveToInventory, moveToInventory } from './usePurchase'
import * as purchase from './usePurchase'

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

  it('rebalances Payton investment when deleting another item reallocates transfer cost', () => {
    loadData({
      items: [
        { id: 'kept', owner: 'payton', status: 'inventory', cost: 50, isLongTerm: false, purchaseDetails: { transferId: 'T1', transferCoefficient: 1, preTransferCost: 20, transferCost: 30 } },
        { id: 'removed', owner: 'papa', status: 'purchase', cost: 50, purchaseDetails: { transferId: 'T1', transferCoefficient: 1, preTransferCost: 20, transferCost: 30 } },
      ],
      transfers: [{ transferId: 'T1', totalRMB: 60 }],
      ownerRegistry: { papa: {}, payton: { pocketBalance: 100, investBalance: 50, loans: [], accountTransfers: [] } },
    })
    purchase.deletePurchaseItem('removed')
    expect(store.items.find((item) => item.id === 'kept').cost).toBe(80)
    expect(store.ownerRegistry.payton.investBalance).toBe(20)
  })

  it('rebalances the original Payton account when an inventory cost is corrected', () => {
    loadData({ items: [{ id: 'keep', owner: 'payton', status: 'inventory', cost: 50, isLongTerm: true }], ownerRegistry: { papa: {}, payton: { pocketBalance: 50, investBalance: 100, loans: [], accountTransfers: [] } } })
    purchase.setPurchaseItemCost(store.items[0], 65)
    expect(store.items[0].cost).toBe(65)
    expect(store.ownerRegistry.payton.pocketBalance).toBe(35)
    expect(store.ownerRegistry.payton.investBalance).toBe(100)
  })

  it('corrects a sold Payton item without changing its sale date or proceeds', () => {
    loadData({ items: [{ id: 'sold', owner: 'payton', status: 'sold', cost: 50, isLongTerm: false,
      saleDetails: { date: '2026-10-31', entryDate: '2026-11-01', price: 100, express: 8, feeRate: 0.01, deduction: 0, profit: 41 } }],
    ownerRegistry: { papa: {}, payton: { pocketBalance: 0, investBalance: 150, loans: [], accountTransfers: [] } } })
    purchase.setPurchaseItemCost(store.items[0], 60)
    expect(store.ownerRegistry.payton.investBalance).toBe(140)
    expect(store.items[0].saleDetails).toMatchObject({ date: '2026-10-31', entryDate: '2026-11-01', price: 100, profit: 31 })
  })

  it('adjusts Payton funds for an unlisted item whose purchase cost changes', () => {
    loadData({ items: [{ id: 'off', owner: 'payton', status: 'unlisted', cost: 50, isLongTerm: false }],
      ownerRegistry: { papa: {}, payton: { pocketBalance: 0, investBalance: 50, loans: [], accountTransfers: [] } } })
    purchase.setPurchaseItemCost(store.items[0], 60)
    expect(store.ownerRegistry.payton.investBalance).toBe(40)
  })

  it('reallocates transfer cost across sold and unsold items without losing Payton funds', () => {
    loadData({ items: [
      { id: 'sold', owner: 'payton', status: 'sold', cost: 50, isLongTerm: false, purchaseDetails: { transferId: 'T1', transferCoefficient: 1, preTransferCost: 20, transferCost: 30 }, saleDetails: { price: 100, express: 8, feeRate: 0.01, deduction: 0, profit: 41 } },
      { id: 'removed', owner: 'papa', status: 'purchase', cost: 50, purchaseDetails: { transferId: 'T1', transferCoefficient: 1, preTransferCost: 20, transferCost: 30 } },
    ], transfers: [{ transferId: 'T1', totalRMB: 60 }], ownerRegistry: { papa: {}, payton: { pocketBalance: 0, investBalance: 150, loans: [], accountTransfers: [] } } })
    purchase.deletePurchaseItem('removed')
    expect(store.items[0].cost).toBe(80)
    expect(store.items[0].saleDetails.profit).toBe(11)
    expect(store.ownerRegistry.payton.investBalance).toBe(120)
  })

  it('finds all transfer items when an old record has missing or partial item IDs', () => {
    const items = [
      { id: 'a', purchaseDetails: { transferId: 'T1' } },
      { id: 'b', purchaseDetails: { transferId: 'T1' } },
      { id: 'c', purchaseDetails: { transferId: 'T2' } },
    ]
    expect(purchase.getTransferItemsForRecord({ transferId: 'T1' }, items).map((item) => item.id)).toEqual(['a', 'b'])
    expect(purchase.getTransferItemsForRecord({ transferId: 'T1', itemIds: ['a'] }, items).map((item) => item.id)).toEqual(['a', 'b'])
  })

  it('does not allocate a transfer to an item moved to another transfer record', () => {
    const items = [
      { id: 'old', purchaseDetails: { transferId: 'T2' } },
      { id: 'current', purchaseDetails: { transferId: 'T1' } },
      { id: 'legacy', purchaseDetails: {} },
    ]
    expect(purchase.getTransferItemsForRecord({ transferId: 'T1', itemIds: ['old', 'legacy'] }, items).map((item) => item.id)).toEqual(['current', 'legacy'])
  })

  it('reprices a foreign group when item count changes despite unchanged RMB total', () => {
    const items = [
      { id: 'a', category: '日淘', purchaseDetails: { totalRMB: 100, originalPrice: 100, domesticShipping: 0, fee: 0 } },
      { id: 'b', category: '日淘', purchaseDetails: { totalRMB: 100, originalPrice: 100, domesticShipping: 0, fee: 0 } },
    ]
    expect(purchase.purchaseGroupNeedsFullReprice(items, [{ id: 'a', originalPrice: 100, domesticShipping: 0, fee: 0 }], '日淘', 100)).toBe(true)
    expect(purchase.purchaseGroupNeedsFullReprice(items, [
      { id: 'a', originalPrice: 100, domesticShipping: 0, fee: 0 },
      { id: 'b', originalPrice: 100, domesticShipping: 0, fee: 0 },
    ], '日淘', 100)).toBe(false)
  })

  it('preserves a legacy purchase cost when original price is missing and monetary inputs are unchanged', () => {
    const item = { cost: 80, purchaseDetails: { originalPrice: 0, exchangeRate: 0, domesticShipping: 0, fee: 0, preTransferCost: 80 } }
    expect(purchase.resolveEditedPreTransferCost(item, 0, { originalPrice: 0, exchangeRate: 0, domesticShipping: 0, fee: 0 })).toBe(80)
  })

  it('keeps a domestic legacy group total when original prices are absent', () => {
    expect(purchase.getDomesticPurchaseTotal([
      { originalPrice: 0, preTransferCost: 80 },
      { originalPrice: 20, preTransferCost: 20 },
    ])).toBe(100)
  })

  it('keeps completed and sold purchase groups discoverable without changing the default purchase list', () => {
    const items = [
      { id: 'p', category: '国内', status: 'purchase', purchaseDetails: { purchaseGroupId: 'G1' } },
      { id: 'i', category: '国内', status: 'inventory', purchaseDetails: { purchaseGroupId: 'G1' } },
      { id: 's', category: '国内', status: 'sold', purchaseDetails: { purchaseGroupId: 'G1' } },
      { id: 'off', category: '国内', status: 'unlisted', purchaseDetails: { purchaseGroupId: 'G1' } },
      { id: 'manual', category: '国内', status: 'inventory' },
    ]
    expect(purchase.getPurchaseGroupItems(items, '国内', 'purchase').map((item) => item.id)).toEqual(['p'])
    expect(purchase.getPurchaseGroupItems(items, '国内', 'all').map((item) => item.id)).toEqual(['p', 'i', 's', 'off'])
  })

  it('keeps purchase and transfer cost components aligned after directly editing total cost', () => {
    loadData({ items: [{ id: 'buy', owner: 'papa', status: 'purchase', cost: 25, purchaseDetails: { originalPrice: 20, exchangeRate: 0, domesticShipping: 0, fee: 0, preTransferCost: 20, transferCost: 5, transferStatus: 'completed' } }] })
    purchase.editPurchaseItemCost(store.items[0], 35)
    expect(store.items[0].cost).toBe(35)
    expect(store.items[0].purchaseDetails.preTransferCost).toBe(30)
    expect(store.items[0].purchaseDetails.transferCost).toBe(5)
    expect(purchase.resolveEditedPreTransferCost(store.items[0], 20, { originalPrice: 20, exchangeRate: 0, domesticShipping: 0, fee: 0 })).toBe(30)
    expect(purchase.resolveEditedPreTransferCost(store.items[0], 25, { originalPrice: 25, exchangeRate: 0, domesticShipping: 0, fee: 0 })).toBe(25)
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
