import { describe, expect, it } from 'vitest'
import { buildInventoryAgingRows, groupInventoryAgingRows } from './useInventoryAging'

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

describe('groupInventoryAgingRows', () => {
  it('按 sid|name 合并，数量求和', () => {
    const items = [
      makeItem({ id: 1, sid: 'CN-L9PR', name: '兰博基尼Aventator黑' }),
      makeItem({ id: 2, sid: 'CN-L9PR', name: '兰博基尼Aventator黑' }),
      makeItem({ id: 3, sid: 'CN-L9PR', name: '兰博基尼Aventator黑' }),
      makeItem({ id: 4, sid: 'CN-L9R3', name: 'ARBOX 保时捷911' }),
    ]
    const rows = groupInventoryAgingRows(buildInventoryAgingRows(items, [], NOW))

    expect(rows).toHaveLength(2)
    const l9pr = rows.find((r) => r.sid === 'CN-L9PR')
    expect(l9pr.qty).toBe(3)
    expect(rows.find((r) => r.sid === 'CN-L9R3').qty).toBe(1)
  })

  it('同 sid 不同名称不合并', () => {
    const items = [
      makeItem({ id: 1, sid: 'CN-L9PR', name: '兰博基尼Aventator黑' }),
      makeItem({ id: 2, sid: 'CN-L9PR', name: '兰博基尼Aventator白' }),
    ]
    const rows = groupInventoryAgingRows(buildInventoryAgingRows(items, [], NOW))
    expect(rows).toHaveLength(2)
  })

  it('合并行 rowKey 唯一，货值 = 单价 × 总数量', () => {
    const items = [
      makeItem({ id: 1, sid: 'S-1', name: 'GT-R', cost: 100 }),
      makeItem({ id: 2, sid: 'S-1', name: 'GT-R', cost: 100 }),
      makeItem({ id: 3, sid: 'S-2', name: 'Supra', cost: 200 }),
    ]
    const rows = groupInventoryAgingRows(buildInventoryAgingRows(items, [], NOW))

    expect(rows).toHaveLength(2)
    expect(new Set(rows.map((r) => r.rowKey)).size).toBe(2)
    const gtr = rows.find((r) => r.sid === 'S-1')
    expect(gtr.cost).toBe(100) // 单价取第一条，不累加
    expect(Number(gtr.cost) * Number(gtr.qty)).toBe(200) // 货值 = 100 × 2
  })

  it('库龄按金额加权平均，入库日期取最早', () => {
    const items = [
      makeItem({ id: 1, sid: 'S-1', cost: 100, inventoryDetails: { inStockDate: '2025-08-01' } }),
      makeItem({ id: 2, sid: 'S-1', cost: 100, inventoryDetails: { inStockDate: '2026-08-01' } }),
    ]
    const rows = groupInventoryAgingRows(buildInventoryAgingRows(items, [], NOW))

    expect(rows).toHaveLength(1)
    const r = rows[0]
    expect(r.inStockDate).toBe('2025-08-01')
    // 两批各 ¥100，等权平均：13.99 月与 2.0 月 → 约 8 月
    expect(r.monthsInStock).toBeGreaterThan(2)
    expect(r.monthsInStock).toBeLessThan(14)
    expect(r.monthsInStock).toBeCloseTo(8, 0)
  })

  it('cost=0 时库龄不得归零（回归：金额权重全 0 时退化为组内最大库龄）', () => {
    const items = [
      makeItem({ id: 1, sid: 'H-7LU', cost: 0, inventoryDetails: {} }),
      makeItem({ id: 2, sid: 'H-7LU', cost: 0, inventoryDetails: {} }),
    ]
    // 无入库日但匹配批次 fallback：2025JAPAN / 2025JAPAN → 2025-08-01
    items.forEach((i) => {
      i.category = '2025JAPAN'
      i.batch = '2025JAPAN'
      delete i.inventoryDetails
    })

    const rows = groupInventoryAgingRows(buildInventoryAgingRows(items, [], NOW))

    expect(rows).toHaveLength(1)
    // 真实库龄约 14 月，不能因为 cost=0 变成 0
    expect(rows[0].monthsInStock).toBeGreaterThan(13)
  })
})
