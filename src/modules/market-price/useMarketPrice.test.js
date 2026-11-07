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
    status: 'inventory',
    isLongTerm: true,
    marketPrices: [],
    ...overrides,
  }
}

describe('useMarketPrice', () => {
  let mod

  beforeEach(async () => {
    store.items.splice(0, store.items.length)
    store.currentOwner = 'papa'

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
    it('Papa只取长线，Payton只取投资，且都只取在库商品', () => {
      resetItems([
        makeItem({ id: '1', isLongTerm: true, status: 'inventory' }),
        makeItem({ id: '2', owner: 'payton', isLongTerm: false, status: 'inventory' }),
        makeItem({ id: '3', isLongTerm: true, status: 'inventory' }),
        makeItem({ id: '4', isLongTerm: true, status: 'sold' }),
        makeItem({ id: '5', owner: 'payton', isLongTerm: false, status: 'inventory' }),
        makeItem({ id: '6', owner: 'payton', isLongTerm: true, status: 'inventory' }),
        makeItem({ id: '7', owner: 'payton', isLongTerm: false, status: 'inventory' }),
        makeItem({ id: '8', owner: 'papa', isLongTerm: false, status: 'inventory' }),
      ])
      const result = mod.getMarketPriceItems()
      expect(result).toHaveLength(2)
      expect(result.map(i => i.id)).toEqual(['1', '3'])
      store.currentOwner = 'payton'
      expect(mod.getMarketPriceItems().map(i => i.id)).toEqual(['2', '5', '7'])
    })

    it('同款仅联动Owner对应的长线或投资在库货品', () => {
      store.currentOwner = 'payton'
      const papa = makeItem({ id: 'papa', owner: 'papa', name: 'same', brand: 'same' })
      const payton = makeItem({ id: 'payton', owner: 'payton', name: 'same', brand: 'same', isLongTerm: false })
      const selfRetain = makeItem({ id: 'self', owner: 'payton', name: 'same', brand: 'same', isLongTerm: true })
      const sold = makeItem({ id: 'sold', owner: 'payton', name: 'same', brand: 'same', isLongTerm: false, status: 'sold' })
      resetItems([papa, payton, selfRetain, sold])
      expect(mod.getLinkedItems(payton).map((item) => item.id)).toEqual(['papa', 'payton'])
      expect(mod.getMarketPriceItems().map((item) => item.id)).toEqual(['payton'])
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
    it('应返回同 name+brand 且符合各自Owner规则的在库货品', () => {
      resetItems([
        makeItem({ id: '1', name: 'GT-R', brand: 'TLV', owner: 'papa', isLongTerm: true }),
        makeItem({ id: '2', name: 'GT-R', brand: 'TLV', owner: 'payton', isLongTerm: false }),
        makeItem({ id: '3', name: 'GT-R', brand: 'MINIGT', owner: 'payton', isLongTerm: true }),
        makeItem({ id: '4', name: 'Supra', brand: 'TLV', owner: 'payton', isLongTerm: true }),
        makeItem({ id: '5', name: 'GT-R', brand: 'TLV', owner: 'payton', isLongTerm: true }),
        makeItem({ id: '6', name: 'GT-R', brand: 'TLV', owner: 'payton', isLongTerm: false, status: 'sold' }),
      ])
      const source = makeItem({ name: 'GT-R', brand: 'TLV', owner: 'papa', isLongTerm: true })
      const linked = mod.getLinkedItems(source)
      expect(linked.map(i => i.id)).toEqual(['1', '2'])
    })
  })

  describe('updateMarketPrice', () => {
    it('应追加价格记录到所有联动货品', () => {
      resetItems([
        makeItem({ id: '1', name: 'GT-R', brand: 'TLV', owner: 'papa', cost: 100, marketPrices: [] }),
        makeItem({ id: '2', name: 'GT-R', brand: 'TLV', owner: 'payton', isLongTerm: false, cost: 100, marketPrices: [] }),
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

  describe('syncMissingMarketPrices', () => {
    it('应将跨 Owner 一致的已有价格补给所有未标价同款，不覆盖已有价格', () => {
      store.currentOwner = 'payton'
      const source = makeItem({ id: 'source', owner: 'papa', name: 'GT-R', brand: 'TLV', marketPrices: [{ price: 250, timestamp: '2026-11-01T00:00:00Z' }] })
      const alreadyPriced = makeItem({ id: 'priced', owner: 'payton', name: 'GT-R', brand: 'TLV', marketPrices: [{ price: 250, timestamp: '2026-11-02T00:00:00Z' }] })
      const missingPayton = makeItem({ id: 'missing-payton', owner: 'payton', isLongTerm: false, name: 'GT-R', brand: 'TLV' })
      const missingPapa = makeItem({ id: 'missing-papa', owner: 'papa', name: 'GT-R', brand: 'TLV' })
      const differentName = makeItem({ id: 'different-name', owner: 'payton', name: 'Supra', brand: 'TLV' })
      const differentBrand = makeItem({ id: 'different-brand', owner: 'payton', name: 'GT-R', brand: 'MINIGT' })
      const selfRetain = makeItem({ id: 'self-retain', owner: 'payton', name: 'GT-R', brand: 'TLV', isLongTerm: true })
      resetItems([source, alreadyPriced, missingPayton, missingPapa, differentName, differentBrand, selfRetain])
      store.operationLogs.splice(0)

      const result = mod.syncMissingMarketPrices()

      expect(result).toEqual({ updatedCount: 2, updatedGroupCount: 1, conflicts: [] })
      expect(missingPayton.marketPrices).toHaveLength(1)
      expect(missingPayton.marketPrices[0].price).toBe(250)
      expect(missingPapa.marketPrices[0].price).toBe(250)
      expect(alreadyPriced.marketPrices).toEqual([{ price: 250, timestamp: '2026-11-02T00:00:00Z' }])
      expect(source.marketPrices).toEqual([{ price: 250, timestamp: '2026-11-01T00:00:00Z' }])
      expect(differentName.marketPrices).toEqual([])
      expect(differentBrand.marketPrices).toEqual([])
      expect(selfRetain.marketPrices).toEqual([])
      expect(store.operationLogs[0]).toMatchObject({ type: 'market_price_backfill', detail: { owner: 'all', updatedCount: 2 } })
    })

    it('遇到同款不同价格应整组跳过并返回各 Owner 价格', () => {
      const papa = makeItem({ id: 'papa', owner: 'papa', name: 'GT-R', brand: 'TLV', marketPrices: [{ price: 250, timestamp: '2026-11-01T00:00:00Z' }] })
      const payton = makeItem({ id: 'payton', owner: 'payton', isLongTerm: false, name: 'GT-R', brand: 'TLV', marketPrices: [{ price: 260, timestamp: '2026-11-02T00:00:00Z' }] })
      const missing = makeItem({ id: 'missing', owner: 'payton', isLongTerm: false, name: 'GT-R', brand: 'TLV' })
      resetItems([papa, payton, missing])
      store.operationLogs.splice(0)

      const result = mod.syncMissingMarketPrices()

      expect(result.updatedCount).toBe(0)
      expect(result.updatedGroupCount).toBe(0)
      expect(result.conflicts).toEqual([{ name: 'GT-R', brand: 'TLV', unpricedCount: 1, sources: [{ owner: 'papa', price: 250, count: 1 }, { owner: 'payton', price: 260, count: 1 }] }])
      expect(missing.marketPrices).toEqual([])
      expect(store.operationLogs[0]).toMatchObject({ type: 'market_price_backfill', detail: { owner: 'all', conflictCount: 1 } })
    })

    it('没有价格来源或未标价目标时不写入商品或操作日志', () => {
      const unpriced = makeItem({ id: 'unpriced', name: 'No source', brand: 'TLV' })
      const priced = makeItem({ id: 'priced', name: 'No target', brand: 'TLV', marketPrices: [{ price: 100, timestamp: '2026-11-01T00:00:00Z' }] })
      resetItems([unpriced, priced])
      store.operationLogs.splice(0)

      expect(mod.syncMissingMarketPrices()).toEqual({ updatedCount: 0, updatedGroupCount: 0, conflicts: [] })
      expect(unpriced.marketPrices).toEqual([])
      expect(store.operationLogs).toHaveLength(0)
    })
  })
})
