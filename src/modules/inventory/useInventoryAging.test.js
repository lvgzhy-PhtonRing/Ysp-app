import { describe, expect, it } from 'vitest'
import { buildInventoryAgingRows } from './useInventoryAging'

const NOW = new Date('2026-10-01')

function makeItem(overrides = {}) {
  return {
    id: 1,
    sid: 'T-001',
    name: '测试商品',
    cost: 100,
    qty: 1,
    status: 'inventory',
    category: '国内',
    batch: '国内现货',
    inventoryDetails: { inStockDate: '2026-06-01' },
    ...overrides,
  }
}

describe('buildInventoryAgingRows', () => {
  it('只保留 status=inventory 的记录', () => {
    const rows = buildInventoryAgingRows(
      [
        makeItem({ id: 1, status: 'inventory' }),
        makeItem({ id: 2, status: 'sold' }),
        makeItem({ id: 3, status: 'purchase' }),
      ],
      [],
      NOW,
    )
    expect(rows).toHaveLength(1)
    expect(rows[0].id).toBe(1)
  })

  it('重复 id 时 rowKey 必须唯一（回归：id 重复会让 Vue diff 错乱，切换视图时残留旧行）', () => {
    const rows = buildInventoryAgingRows(
      [
        makeItem({ id: 100, sid: 'CN-L9PR' }),
        makeItem({ id: 100, sid: 'CN-L9PR' }),
        makeItem({ id: 200, sid: 'CN-L9R3' }),
        makeItem({ id: 200, sid: 'CN-L9R3' }),
      ],
      [],
      NOW,
    )

    expect(rows).toHaveLength(4)
    expect(new Set(rows.map((r) => r.id)).size).toBe(2) // id 确实重复
    expect(new Set(rows.map((r) => r.rowKey)).size).toBe(4) // rowKey 全唯一
  })

  it('isLongTerm 归一为布尔值，缺失按 false 处理', () => {
    const rows = buildInventoryAgingRows(
      [makeItem({ id: 1, isLongTerm: true }), makeItem({ id: 2, isLongTerm: false }), makeItem({ id: 3 })],
      [],
      NOW,
    )
    expect(rows.map((r) => r.isLongTerm)).toEqual([true, false, false])
  })

  it('monthsInStock 由入库日推算', () => {
    const rows = buildInventoryAgingRows(
      [makeItem({ inventoryDetails: { inStockDate: '2025-08-01' } })],
      [],
      NOW,
    )
    expect(rows[0].monthsInStock).toBeGreaterThan(11)
  })
})
