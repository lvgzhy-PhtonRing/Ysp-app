// finalizeRestorePayload 单元测试（E2 数据回溯版本化）
import { describe, expect, it } from 'vitest'
import { computeSlotPlan } from './cloudSlotPlan'
import { stableSerialize } from './store'
import { finalizeRestorePayload } from './restorePayload'

const basePayload = () => ({
  items: [{ id: 1, name: 'A', sid: 'JP-1', cost: 100, status: 'inventory' }],
  calc: { debt: 100, wechat: 0, publicExp: 0, unconfirmed: 0, fund: 0, forwarderBalance: 0, watchBalance: 0 },
  finance: {
    records: [{ id: 'r1', item: 'x', amount: 100, type: 'expense' }],
    loans: [],
  },
  transfers: [],
  rushcar: { entries: [], forwarderInfos: [], mattelSiteInfos: [], paymentCards: [] },
  updatedAt: '2026-09-26T00:00:00Z',
  _rev: {
    items: { rev: 3, at: 't1' },
    calc: { rev: 2, at: 't1' },
    'finance.records': { rev: 5, at: 't1' },
    'finance.loans': { rev: 1, at: 't1' },
    transfers: { rev: 0, at: 't1' },
    'rushcar.entries': { rev: 1, at: 't1' },
    'rushcar.forwarderInfos': { rev: 1, at: 't1' },
    'rushcar.mattelSiteInfos': { rev: 1, at: 't1' },
    'rushcar.paymentCards': { rev: 1, at: 't1' },
  },
})

describe('finalizeRestorePayload（E2 恢复版本化）', () => {
  it('内容变化的槽位 rev+1，未变槽位沿用当前 rev', () => {
    const current = basePayload()
    const prior = {
      items: [{ id: 1, name: 'A', sid: 'JP-1', cost: 99, status: 'purchase' }],
      calc: { debt: 100, wechat: 0, publicExp: 0, unconfirmed: 0, fund: 0, forwarderBalance: 0, watchBalance: 0 },
      finance: {
        records: [{ id: 'r1', item: 'x', amount: 100, type: 'expense' }],
        loans: [],
      },
      transfers: [],
      rushcar: current.rushcar,
      updatedAt: '',
      _rev: {},
    }
    const out = finalizeRestorePayload(prior, current, '2026-09-27T00:00:00Z')
    expect(out._rev.items.rev).toBe(4)
    expect(out._rev['finance.records'].rev).toBe(5)
    expect(out._rev.calc.rev).toBe(2)
    expect(out._rev.transfers.rev).toBe(0)
    expect(out.updatedAt).toBe('2026-09-27T00:00:00Z')
  })

  it('rev+1 后 computeSlotPlan 判 upload（本地已动、云端未动）', () => {
    const current = basePayload()
    const prior = {
      items: [{ id: 1, name: 'A', sid: 'JP-1', cost: 99, status: 'purchase' }],
      calc: current.calc,
      finance: current.finance,
      transfers: [],
      rushcar: current.rushcar,
      updatedAt: '',
      _rev: {},
    }
    const out = finalizeRestorePayload(prior, current, '2026-09-27T00:00:00Z')
    const plan = computeSlotPlan(out, current, { items: 3 }, stableSerialize)
    expect(plan.items).toBe('upload')
    expect(plan['finance.records']).toBe('align')
  })

  it('未恢复任何变化时（内容全同）rev 不变，判定 align', () => {
    const current = basePayload()
    const prior = {
      items: current.items,
      calc: current.calc,
      finance: current.finance,
      transfers: [],
      rushcar: current.rushcar,
      updatedAt: '',
      _rev: {},
    }
    const out = finalizeRestorePayload(prior, current, '2026-09-27T00:00:00Z')
    expect(out._rev.items.rev).toBe(3)
    const plan = computeSlotPlan(out, current, { items: 3 }, stableSerialize)
    expect(plan.items).toBe('align')
  })
})
