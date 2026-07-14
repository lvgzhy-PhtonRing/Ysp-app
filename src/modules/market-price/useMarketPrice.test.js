import { describe, it, expect, beforeEach, vi } from 'vitest'
import { state as store } from '../../data/store'

// 重置 store.items
function resetItems(items) {
  store.items.splice(0, store.items.length, ...items)
}

// 模拟 longTerm 货品
function makeItem(overrides = {}) {
  return {
    id: Date.now() + Math.random(),
    sid: 'TEST-001',
    name: '测试货品',
    brand: 'TestBrand',
    cost: 100,
    isLongTerm: true,
    marketPrices: [],
    ...overrides,
  }
}

describe('useMarketPrice', () => {
  let mod

  beforeEach(async () => {
    store.items.splice(0, store.items.length)

    const localStorageMock = {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
    }
    vi.stubGlobal('localStorage', localStorageMock)

    // 动态 import 以确保每次测试拿到纯净引用
    mod = await import('./useMarketPrice')
  })

  describe('getCurrentPrice', () => {
    it('应返回最新市价', () => {
      const item = makeItem({ marketPrices: [{ price: 200, timestamp: '2026-07-14T00:00:00Z' }, { price: 150, timestamp: '2026-06-01T00:00:00Z' }] })
      expect(mod.getCurrentPrice(item)).toBe(200)
    })

    it('无价格记录应返回 null', () => {
      const item = makeItem({ marketPrices: [] })
      expect(mod.getCurrentPrice(item)).toBeNull()
    })

    it('无 marketPrices 字段应返回 null', () => {
      const item = makeItem()
      delete item.marketPrices
      expect(mod.getCurrentPrice(item)).toBeNull()
    })
  })

  describe('getChangeRate', () => {
    it('应正确计算涨跌幅', () => {
      const item = makeItem({ cost: 100, marketPrices: [{ price: 150, timestamp: '2026-07-14T00:00:00Z' }] })
      expect(mod.getChangeRate(item)).toBe(0.5)
    })

    it('亏损货品应返回负数', () => {
      const item = makeItem({ cost: 200, marketPrices: [{ price: 150, timestamp: '2026-07-14T00:00:00Z' }] })
      expect(mod.getChangeRate(item)).toBe(-0.25)
    })

    it('成本为 0 应返回 null', () => {
      const item = makeItem({ cost: 0, marketPrices: [{ price: 100, timestamp: '2026-07-14T00:00:00Z' }] })
      expect(mod.getChangeRate(item)).toBeNull()
    })
  })

  describe('isPriced', () => {
    it('有价格记录应返回 true', () => {
      const item = makeItem({ marketPrices: [{ price: 100, timestamp: '2026-07-14T00:00:00Z' }] })
      expect(mod.isPriced(item)).toBe(true)
    })

    it('无价格记录应返回 false', () => {
      const item = makeItem({ marketPrices: [] })
      expect(mod.isPriced(item)).toBe(false)
    })
  })

  describe('getMarketPriceItems', () => {
    it('应只返回 isLongTerm=true 的货品', () => {
      resetItems([
        makeItem({ id: '1', isLongTerm: true }),
        makeItem({ id: '2', isLongTerm: false }),
        makeItem({ id: '3', isLongTerm: true }),
      ])
      const result = mod.getMarketPriceItems()
      expect(result).toHaveLength(2)
      expect(result.map(i => i.id)).toEqual(['1', '3'])
    })
  })

  describe('groupByBrand', () => {
    it('应按品牌正确分组', () => {
      const items = [
        makeItem({ id: '1', brand: 'TLV' }),
        makeItem({ id: '2', brand: 'MINIGT' }),
        makeItem({ id: '3', brand: 'TLV' }),
      ]
      const map = mod.groupByBrand(items)
      expect(map.get('TLV')).toHaveLength(2)
      expect(map.get('MINIGT')).toHaveLength(1)
    })
  })

  describe('getBrandStats', () => {
    it('应正确计算品牌统计', () => {
      resetItems([
        makeItem({ id: '1', brand: 'TLV', cost: 100, marketPrices: [{ price: 150, timestamp: '2026-07-14T00:00:00Z' }] }),
        makeItem({ id: '2', brand: 'TLV', cost: 200, marketPrices: [{ price: 180, timestamp: '2026-07-14T00:00:00Z' }] }),
        makeItem({ id: '3', brand: 'TLV', cost: 50, marketPrices: [] }),
      ])
      const stats = mod.getBrandStats(mod.getMarketPriceItems())
      expect(stats).toHaveLength(1)
      expect(stats[0].brand).toBe('TLV')
      expect(stats[0].totalValue).toBe(330)
      expect(stats[0].totalCost).toBe(300)
      expect(stats[0].pricedCount).toBe(2)
      expect(stats[0].totalCount).toBe(3)
    })
  })

  describe('getGlobalStats', () => {
    it('应正确计算全局统计', () => {
      resetItems([
        makeItem({ id: '1', cost: 100, marketPrices: [{ price: 150, timestamp: '2026-07-14T00:00:00Z' }] }),
        makeItem({ id: '2', cost: 200, marketPrices: [{ price: 180, timestamp: '2026-07-14T00:00:00Z' }] }),
        makeItem({ id: '3', cost: 50, marketPrices: [] }),
      ])
      const stats = mod.getGlobalStats(mod.getMarketPriceItems())
      expect(stats.totalCount).toBe(3)
      expect(stats.pricedCount).toBe(2)
      expect(stats.unPricedCount).toBe(1)
      expect(stats.totalValue).toBe(330)
      expect(stats.totalProfit).toBe(30)
      expect(stats.profitCount).toBe(1)
      expect(stats.lossCount).toBe(1)
    })
  })

  describe('getTopChanges', () => {
    it('应正确返回涨幅和跌幅 TOP', () => {
      resetItems([
        makeItem({ id: '1', name: 'A', cost: 100, marketPrices: [{ price: 200, timestamp: '2026-07-14T00:00:00Z' }] }),
        makeItem({ id: '2', name: 'B', cost: 100, marketPrices: [{ price: 50, timestamp: '2026-07-14T00:00:00Z' }] }),
        makeItem({ id: '3', name: 'C', cost: 100, marketPrices: [{ price: 150, timestamp: '2026-07-14T00:00:00Z' }] }),
      ])
      const { gainers, losers } = mod.getTopChanges(mod.getMarketPriceItems(), 2)
      expect(gainers).toHaveLength(2)
      expect(gainers[0].item.name).toBe('A')
      expect(gainers[0].rate).toBe(1.0)
      expect(losers[0].item.name).toBe('B')
      expect(losers[0].rate).toBe(-0.5)
    })
  })

  describe('getLinkedItems', () => {
    it('应返回同 name+brand 的长线货品', () => {
      resetItems([
        makeItem({ id: '1', name: 'GT-R', brand: 'TLV', isLongTerm: true }),
        makeItem({ id: '2', name: 'GT-R', brand: 'TLV', isLongTerm: true }),
        makeItem({ id: '3', name: 'GT-R', brand: 'MINIGT', isLongTerm: true }),
        makeItem({ id: '4', name: 'Supra', brand: 'TLV', isLongTerm: true }),
        makeItem({ id: '5', name: 'GT-R', brand: 'TLV', isLongTerm: false }),
      ])
      const source = makeItem({ name: 'GT-R', brand: 'TLV', isLongTerm: true })
      const linked = mod.getLinkedItems(source)
      expect(linked).toHaveLength(2)
      expect(linked.map(i => i.id)).toEqual(['1', '2'])
    })
  })

  describe('updateMarketPrice', () => {
    it('应追加价格记录到所有联动货品', () => {
      resetItems([
        makeItem({ id: '1', name: 'GT-R', brand: 'TLV', cost: 100, marketPrices: [] }),
        makeItem({ id: '2', name: 'GT-R', brand: 'TLV', cost: 100, marketPrices: [] }),
      ])
      const source = store.items[0]
      const result = mod.updateMarketPrice(source, 250)
      expect(result.updatedCount).toBe(2)
      expect(store.items[0].marketPrices).toHaveLength(1)
      expect(store.items[0].marketPrices[0].price).toBe(250)
      expect(store.items[1].marketPrices).toHaveLength(1)
      expect(store.items[1].marketPrices[0].price).toBe(250)
    })

    it('价格记录超过 100 条应截断', () => {
      const oldPrices = Array.from({ length: 100 }, (_, i) => ({
        price: 100 + i,
        timestamp: new Date(2026, 0, i + 1).toISOString(),
      }))
      resetItems([
        makeItem({ id: '1', name: 'GT-R', brand: 'TLV', cost: 100, marketPrices: oldPrices }),
      ])
      mod.updateMarketPrice(store.items[0], 999)
      expect(store.items[0].marketPrices).toHaveLength(100)
      expect(store.items[0].marketPrices[0].price).toBe(999)
    })
  })
})
