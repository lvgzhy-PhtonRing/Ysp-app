import { describe, expect, it } from 'vitest'
import { getBatchReturnStats, searchItems } from './useHomeInsights'

describe('home insights owner-independent views', () => {
  it('keeps same-SID inventory search results separate across owners', () => {
    const items = [
      { sid: 'shared', owner: 'papa', status: 'inventory', name: 'Shared Car', cost: 10 },
      { sid: 'shared', owner: 'payton', status: 'inventory', name: 'Shared Car', cost: 10 },
    ]

    const results = searchItems(items, 'Shared Car')

    expect(results).toHaveLength(2)
    expect(results.map((item) => item.owner).sort()).toEqual(['papa', 'payton'])
  })

  it('attributes same-SID sales to each owner batch in global batch statistics', () => {
    const items = [
      { sid: 'shared', owner: 'papa', status: 'sold', category: '日淘', batch: '26a批', cost: 10, saleDetails: { date: '2026-10-01', price: 20 } },
      { sid: 'shared', owner: 'payton', status: 'sold', category: 'payton库存', batch: '2026年10月导入', cost: 12, saleDetails: { date: '2026-10-01', price: 18 } },
    ]

    const result = getBatchReturnStats(items)

    expect(result.find((row) => row.category === '日淘' && row.batch === '26a批').revenue).toBe(20)
    expect(result.find((row) => row.category === 'payton库存' && row.batch === '2026年10月导入').revenue).toBe(18)
    expect(result.find((row) => row.isSummary).revenue).toBe(38)
  })
})
