import { beforeEach, describe, expect, it, vi } from 'vitest'
import sampleData from '../../__tests__/fixtures/sampleData.json'
import { loadData, state as store } from '../../data/store'
import { editItem, filterInventory, getInventoryStats } from './useInventory'

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
})