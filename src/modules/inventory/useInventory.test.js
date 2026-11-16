import { beforeEach, describe, expect, it, vi } from 'vitest'
import sampleData from '../../__tests__/fixtures/sampleData.json'
import { loadData, state as store } from '../../data/store'
import { reconstructAtTime } from '../../data/logReplay'
import { deleteItem, editItem, filterInventory, getInventoryEditPatch, getInventoryStats, markLongTermInventory, sortInventoryItems, submitManualAdd } from './useInventory'

describe('useInventory logic', () => {
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

  it('test1 getInventoryStats', () => {
    loadData(sampleData)

    const stats = getInventoryStats(store.items)
    const inventoryItems = store.items.filter((x) => x.status === 'inventory').length
    const purchaseItems = store.items.filter((x) => x.status === 'purchase').length
    const soldItems = store.items.filter((x) => x.status === 'sold').length

    expect(stats.totalInventoryCount + stats.totalPurchaseCount + soldItems).toBe(
      inventoryItems + purchaseItems + soldItems,
    )
    expect(stats.totalInventoryValue).toBeGreaterThan(0)
  })

  it('test2 filterInventory', () => {
    loadData(sampleData)

    const byStatus = filterInventory(store.items, { status: 'inventory' })
    expect(byStatus.length).toBeGreaterThan(0)
    byStatus.forEach((item) => expect(item.status).toBe('inventory'))

    const byCategory = filterInventory(store.items, { category: '日淘' })
    expect(byCategory.length).toBeGreaterThan(0)
    byCategory.forEach((item) => expect(item.category).toBe('日淘'))

    const byKeyword = filterInventory(store.items, { keyword: 'GT-R' })
    expect(byKeyword.length).toBeGreaterThan(0)
    byKeyword.forEach((item) => {
      const text = `${item.name || ''} ${item.sid || ''}`
      expect(text).toContain('GT-R')
    })

    const combined = filterInventory(store.items, {
      status: 'inventory',
      category: '日淘',
      isDefect: false,
    })
    combined.forEach((item) => {
      expect(item.status).toBe('inventory')
      expect(item.category).toBe('日淘')
      expect(item.isDefect).toBe(false)
    })
  })

  it('sorts inventory by name and brand in either direction without mutating input', () => {
    const items = [
      { id: 'z', name: 'Z-Car', brand: 'Alpha' },
      { id: 'b', name: 'A-Car', brand: 'Beta' },
      { id: 'a', name: 'A-Car', brand: 'Alpha' },
    ]

    expect(sortInventoryItems(items, 'name', 'asc').map((item) => item.id)).toEqual(['b', 'a', 'z'])
    expect(sortInventoryItems(items, 'name', 'desc').map((item) => item.id)).toEqual(['z', 'b', 'a'])
    expect(sortInventoryItems(items, 'brand', 'asc').map((item) => item.id)).toEqual(['z', 'a', 'b'])
    expect(sortInventoryItems(items, 'brand', 'desc').map((item) => item.id)).toEqual(['b', 'z', 'a'])
    expect(items.map((item) => item.id)).toEqual(['z', 'b', 'a'])
  })

  it('treats legacy items without an owner as Papa inventory', () => {
    const legacy = { id: 'legacy', status: 'inventory' }
    expect(filterInventory([legacy], { owner: 'papa' })).toEqual([legacy])
    expect(filterInventory([legacy], { owner: 'payton' })).toEqual([])
  })

  it('test3 editItem', () => {
    loadData(sampleData)

    const item = store.items[0]
    const oldName = item.name
    const oldCost = item.cost
    const oldSid = item.sid

    editItem(item.id, { name: `${oldName}_UPDATED` })

    expect(item.name).toBe(`${oldName}_UPDATED`)
    expect(item.cost).toBe(oldCost)
    expect(item.sid).toBe(oldSid)
  })

  it('isolates same-SID edits by owner and adjusts Payton account for cost changes', () => {
    loadData({
      items: [
        { id: 'p', sid: 'same', owner: 'payton', status: 'inventory', cost: 50, isLongTerm: false },
        { id: 'a', sid: 'same', owner: 'papa', status: 'inventory', cost: 80 },
      ],
      ownerRegistry: { papa: { label: 'Papa' }, payton: { pocketBalance: 100, investBalance: 100, loans: [], accountTransfers: [] } },
    })
    editItem('p', { cost: 60, name: 'updated' })
    expect(store.items[1].name).not.toBe('updated')
    expect(store.ownerRegistry.payton.investBalance).toBe(90)
  })

  it('preserves each cost on rename and reverses explicit cost edits per item', () => {
    loadData({ items: [
      { id: 'p1', sid: 'same', owner: 'payton', status: 'inventory', name: 'old', cost: 100 },
      { id: 'p2', sid: 'same', owner: 'payton', status: 'inventory', name: 'old 2', cost: 150 },
      { id: 'a', sid: 'same', owner: 'papa', status: 'inventory', name: 'other', cost: 75 },
    ], ownerRegistry: { payton: { pocketBalance: 50, investBalance: -250, loans: [] } } })
    const opened = { name: 'old', cost: 100 }
    editItem('p1', getInventoryEditPatch(opened, { ...opened, name: 'new' }))
    expect(store.items.map(({ name, cost }) => [name, cost])).toEqual([['new', 100], ['new', 150], ['other', 75]])
    expect(store.ownerRegistry.payton.investBalance).toBe(-250)

    editItem('p1', { cost: 120 })
    expect(store.ownerRegistry.payton.investBalance).toBe(-240)
    const { state } = reconstructAtTime({ items: store.items, ownerRegistry: store.ownerRegistry }, [store.operationLogs[0]])
    expect(state.items.map((item) => item.cost)).toEqual([100, 150, 75])
    expect(state.ownerRegistry.payton.investBalance).toBe(-250)
  })

  it('marks only the chosen owner and scope, and transfers the Payton amount once', () => {
    loadData({ items: [
      { id: 'p1', sid: 'same', owner: 'payton', status: 'inventory', category: '日淘', batch: 'A', cost: 100 },
      { id: 'p2', sid: 'keep', owner: 'payton', status: 'inventory', category: '日淘', batch: 'A', cost: 150, isLongTerm: true },
      { id: 'p3', sid: 'same', owner: 'payton', status: 'inventory', category: '日淘', batch: 'B', cost: 50 },
      { id: 'a', sid: 'same', owner: 'papa', status: 'inventory', category: '日淘', batch: 'A', cost: 75 },
    ], ownerRegistry: { payton: { pocketBalance: -150, investBalance: -150, loans: [] } } })
    markLongTermInventory({ owner: 'papa', category: '日淘', batch: 'A' }, ['same'])
    expect(store.items.map((item) => item.isLongTerm)).toEqual([undefined, true, undefined, true])
    markLongTermInventory({ owner: 'payton', category: '日淘', batch: 'A' }, ['same'])
    expect(store.items.map((item) => item.isLongTerm)).toEqual([true, false, undefined, true])
    expect(store.ownerRegistry.payton).toMatchObject({ pocketBalance: -100, investBalance: -200 })
    const { state } = reconstructAtTime({ items: store.items, ownerRegistry: store.ownerRegistry }, [store.operationLogs[0]])
    expect(state.items.map((item) => item.isLongTerm)).toEqual([undefined, true, undefined, true])
    expect(state.ownerRegistry.payton).toMatchObject({ pocketBalance: -150, investBalance: -150 })
  })

  it('returns Payton purchase cost only for mistaken or duplicate deletion', () => {
    loadData({ items: [{ id: 'p', owner: 'payton', status: 'inventory', cost: 25, isLongTerm: true }] })
    expect(deleteItem('p', { reason: 'mistake' })).toBe(true)
    expect(store.ownerRegistry.payton.pocketBalance).toBe(25)
  })

  it('adds every manually entered unit and reverses the matching total on replay', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-01T00:30:00+08:00'))
    try {
      loadData({ items: [], ownerRegistry: { payton: { pocketBalance: 100, investBalance: 200, loans: [] } } })

      submitManualAdd({ name: '测试车', cost: 25, qty: 3, owner: 'payton', isLongTerm: true })

      expect(store.items).toHaveLength(3)
      expect(new Set(store.items.map((item) => item.id)).size).toBe(3)
      expect(new Set(store.items.map((item) => item.sid)).size).toBe(1)
      expect(store.items.map((item) => item.cost)).toEqual([25, 25, 25])
      expect(store.items.every((item) => item.qty === 1 && item.stock === 1)).toBe(true)
      expect(store.items.every((item) => item.inventoryDetails.inStockDate === '2026-11-01')).toBe(true)
      expect(store.ownerRegistry.payton).toMatchObject({ pocketBalance: 25, investBalance: 200 })

      const { state } = reconstructAtTime(
        { items: store.items, ownerRegistry: store.ownerRegistry },
        [store.operationLogs[0]],
      )
      expect(state.items).toHaveLength(0)
      expect(state.ownerRegistry.payton.pocketBalance).toBe(100)
    } finally {
      vi.useRealTimers()
    }
  })
})
