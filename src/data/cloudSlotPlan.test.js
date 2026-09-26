import { describe, expect, it } from 'vitest'
import {
  SLOT_KEYS, SLOT_LABELS, slotValue, setSlotValue, revOf, normalizeRev,
  computeSlotPlan, buildMerged,
} from './cloudSlotPlan'

const ser = (v) => JSON.stringify(v)

function p(items = [], calc = { debt: 0 }, rev = {}) {
  return { items, calc, finance: { records: [], loans: [] }, transfers: [], rushcar: {}, _rev: rev }
}

describe('SLOT_KEYS / slotValue / setSlotValue', () => {
  it('共 9 槽位且值默认空', () => {
    expect(SLOT_KEYS).toHaveLength(9)
    const pay = p()
    for (const s of SLOT_KEYS) {
      expect(Array.isArray(slotValue(pay, s)) || typeof slotValue(pay, s) === 'object').toBe(true)
    }
  })
  it('setSlotValue 写回 items 与 finance.records 深层路径', () => {
    const pay = p()
    setSlotValue(pay, 'items', [{ id: 1 }])
    setSlotValue(pay, 'finance.records', [{ id: 9 }])
    expect(slotValue(pay, 'items')).toEqual([{ id: 1 }])
    expect(pay.finance.records).toEqual([{ id: 9 }])
  })
})

describe('revOf / normalizeRev', () => {
  it('缺失或非法 rev 按 0', () => {
    expect(revOf(p(), 'items')).toBe(0)
    expect(revOf(p([], {}, { items: { rev: 'x', at: '' } }), 'items')).toBe(0)
  })
  it('normalizeRev 保留合法槽位丢弃非法', () => {
    const n = normalizeRev({ items: { rev: 3, at: 't' }, calc: { rev: 0, at: '' }, bad: { rev: 'x' } })
    expect(n.items).toEqual({ rev: 3, at: 't' })
    expect(n.calc).toEqual({ rev: 0, at: '' })
    expect(n.bad).toBeUndefined()
  })
})

describe('computeSlotPlan', () => {
  const L = p([{ id: 1, name: 'local' }], { debt: 0 }, { items: { rev: 2, at: '' }, calc: { rev: 1, at: '' } })
  const C = p([{ id: 1, name: 'cloud' }], { debt: 0 }, { items: { rev: 5, at: '' }, calc: { rev: 1, at: '' } })

  it('内容一致 → align（即使 rev 不同）', () => {
    const a = p([{ id: 1 }], { debt: 0 }, { items: { rev: 3, at: '' } })
    const b = p([{ id: 1 }], { debt: 0 }, { items: { rev: 7, at: '' } })
    expect(computeSlotPlan(a, b, {}, ser).items).toBe('align')
  })
  it('仅本地越基线 → upload', () => {
    expect(computeSlotPlan(L, p([], {}, {}), { items: 1 }, ser).items).toBe('upload')
  })
  it('仅云端越基线 → adopt-cloud', () => {
    expect(computeSlotPlan(p(), C, { items: 1 }, ser).items).toBe('adopt-cloud')
  })
  it('双方越基线且内容不同 → conflict', () => {
    expect(computeSlotPlan(L, C, { items: 1 }, ser).items).toBe('conflict')
  })
  it('rev 皆未越基线但内容不同 → 保守 conflict', () => {
    expect(computeSlotPlan(L, p([{ id: 1, name: 'cloud' }], { debt: 0 }, { items: { rev: 2, at: '' } }), { items: 2 }, ser).items).toBe('conflict')
  })
  it('9 槽位全部产出', () => {
    const plan = computeSlotPlan(L, C, { items: 1 }, ser)
    for (const s of SLOT_KEYS) expect(plan[s]).toBeDefined()
  })
})

describe('buildMerged', () => {
  it('upload 槽取本地、adopt 槽取云端、conflict 按决策取', () => {
    const L = p([{ id: 1, n: 'A' }], { debt: 0 }, { items: { rev: 2, at: '' }, calc: { rev: 1, at: '' }, transfers: { rev: 1, at: '' } })
    const C = p([{ id: 1, n: 'C' }], { debt: 0 }, { items: { rev: 5, at: '' }, calc: { rev: 1, at: '' }, transfers: { rev: 5, at: '' } })
    C.transfers = [{ id: 9 }]
    const plan = computeSlotPlan(L, C, { items: 1, transfers: 1 }, ser)
    // 期望：items=conflict, calc=align, transfers=adopt-cloud（仅云端越基线）
    expect(plan.items).toBe('conflict')
    expect(plan.calc).toBe('align')
    expect(plan.transfers).toBe('adopt-cloud')

    const merged = buildMerged(L, C, plan, { items: 'local' })
    expect(merged.items[0].n).toBe('A') // conflict→local
    expect(merged._rev.items.rev).toBe(2)
    expect(merged.transfers).toEqual([{ id: 9 }]) // adopt→cloud
    expect(merged._rev.transfers.rev).toBe(5)
    expect(merged.calc).toEqual({ debt: 0 }) // align
  })

  it('adopt 槽显式决策 local 时保本地内容与 rev', () => {
    const L = p([], { debt: 0 }, { items: { rev: 1, at: '' }, transfers: { rev: 1, at: '' } })
    const C = p([] , { debt: 0 }, { transfers: { rev: 5, at: '' } })
    const plan = computeSlotPlan(L, C, { items: 1, transfers: 1 }, ser)
    expect(plan.transfers).toBe('adopt-cloud')
    const merged = buildMerged(L, C, plan, { transfers: 'local' })
    expect(merged.transfers).toEqual([])
    expect(merged._rev.transfers.rev).toBe(1)
  })
})
