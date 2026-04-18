import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { loadData, state as store } from '../../data/store'
import { editItem, filterInventory, getInventoryStats } from './useInventory'

function readDesktopAJson() {
  const __filename = fileURLToPath(import.meta.url)
  const __dirname = path.dirname(__filename)
  const filePath = path.resolve(__dirname, '../../../../a.json')
  const raw = fs.readFileSync(filePath, 'utf8')
  return JSON.parse(raw)
}

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
    const original = readDesktopAJson()
    loadData(original)

    const stats = getInventoryStats(store.items)
    const soldCount = store.items.filter((x) => x.status === 'sold').length

    expect(stats.totalInventoryCount + stats.totalPurchaseCount + soldCount).toBe(407)
    expect(stats.totalInventoryValue).toBeGreaterThan(0)
  })

  it('test2 filterInventory', () => {
    const original = readDesktopAJson()
    loadData(original)

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
    const original = readDesktopAJson()
    loadData(original)

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
