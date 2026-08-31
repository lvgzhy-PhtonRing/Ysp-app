import { describe, expect, it } from 'vitest'
import { shouldWarnBeforeOverwrite } from './dataProtection'

function payload(items, saleDates = {}) {
  // saleDates: { sid: 'YYYY-MM-DD' }
  return {
    items: items.map((sid) => ({
      sid,
      name: sid,
      saleDetails: saleDates[sid] ? { date: saleDates[sid] } : null,
    })),
  }
}

describe('shouldWarnBeforeOverwrite', () => {
  it('数量相等时不警告', () => {
    const local = payload(['a', 'b', 'c'])
    const cloud = payload(['a', 'b', 'c'])
    const r = shouldWarnBeforeOverwrite(local, cloud)
    expect(r.shouldWarn).toBe(false)
    expect(r.countDiff).toBe(0)
  })

  it('云端比本地多时不警告', () => {
    const local = payload(['a', 'b', 'c'])
    const cloud = payload(['a', 'b', 'c', 'd', 'e'])
    const r = shouldWarnBeforeOverwrite(local, cloud)
    expect(r.shouldWarn).toBe(false)
    expect(r.countDiff).toBe(-2)
  })

  it('少 10% 触发警告（本地 100 → 云端 90）', () => {
    const local = payload(Array.from({ length: 100 }, (_, i) => `l${i}`))
    const cloud = payload(Array.from({ length: 90 }, (_, i) => `l${i}`))
    const r = shouldWarnBeforeOverwrite(local, cloud)
    expect(r.shouldWarn).toBe(true)
    expect(r.countDiff).toBe(10)
    expect(r.reasons.join()).toContain('少 10 条')
  })

  it('少 5 条且不足 10% 不警告（本地 100 → 云端 95）', () => {
    const local = payload(Array.from({ length: 100 }, (_, i) => `l${i}`))
    const cloud = payload(Array.from({ length: 95 }, (_, i) => `l${i}`))
    expect(shouldWarnBeforeOverwrite(local, cloud).shouldWarn).toBe(false)
  })

  it('小数据集少 5 条触发警告（本地 20 → 云端 15，达到 min 阈值）', () => {
    const local = payload(Array.from({ length: 20 }, (_, i) => `l${i}`))
    const cloud = payload(Array.from({ length: 15 }, (_, i) => `l${i}`))
    expect(shouldWarnBeforeOverwrite(local, cloud).shouldWarn).toBe(true)
  })

  it('小数据集少 4 条不警告（本地 20 → 云端 16）', () => {
    const local = payload(Array.from({ length: 20 }, (_, i) => `l${i}`))
    const cloud = payload(Array.from({ length: 16 }, (_, i) => `l${i}`))
    expect(shouldWarnBeforeOverwrite(local, cloud).shouldWarn).toBe(false)
  })

  it('时间倒流触发警告（云端最后销售早于本地）', () => {
    const local = payload(['a', 'b'], { b: '2026-08-26' })
    const cloud = payload(['a', 'b'], { b: '2026-08-25' })
    const r = shouldWarnBeforeOverwrite(local, cloud)
    expect(r.shouldWarn).toBe(true)
    expect(r.reasons.join()).toContain('最后销售日期早于本地')
    expect(r.lastSaleLocal).toBe('2026-08-26')
    expect(r.lastSaleCloud).toBe('2026-08-25')
  })

  it('时间相同不触发时间倒流', () => {
    const local = payload(['a'], { a: '2026-08-26' })
    const cloud = payload(['a'], { a: '2026-08-26' })
    expect(shouldWarnBeforeOverwrite(local, cloud).shouldWarn).toBe(false)
  })

  it('任一侧无销售记录不触发时间倒流', () => {
    const local = payload(['a'])
    const cloud = payload(['a'], { a: '2026-08-26' })
    expect(shouldWarnBeforeOverwrite(local, cloud).shouldWarn).toBe(false)
  })

  it('本地空商品不警告（首次同步）', () => {
    const local = payload([])
    const cloud = payload(['a', 'b', 'c'])
    const r = shouldWarnBeforeOverwrite(local, cloud)
    expect(r.shouldWarn).toBe(false)
    expect(r.lastSaleLocal).toBe('')
    expect(r.lastSaleCloud).toBe('')
  })

  it('云端空商品触发警告（本地 20 → 云端 0）', () => {
    const local = payload(Array.from({ length: 20 }, (_, i) => `l${i}`))
    const cloud = payload([])
    expect(shouldWarnBeforeOverwrite(local, cloud).shouldWarn).toBe(true)
  })

  it('items 缺失时不警告', () => {
    expect(shouldWarnBeforeOverwrite({}, {}).shouldWarn).toBe(false)
    expect(shouldWarnBeforeOverwrite({ items: 'not-array' }, { items: ['a'] }).shouldWarn).toBe(false)
  })
})
