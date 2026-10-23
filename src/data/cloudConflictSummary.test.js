import { describe, expect, it } from 'vitest'
import { summarizeConflictPayload, summarizeConflictSlot } from './cloudConflictSummary'

describe('cloud conflict summary', () => {
  it('summarizes stock count and cost from real item fields', () => {
    const data = { items: [
      { status: 'inventory', cost: 12.34 },
      { status: 'inventory', cost: 20.01 },
      { status: 'sold', cost: 8.5 },
      { status: 'purchase', cost: 7 },
    ] }
    expect(summarizeConflictPayload(data)).toEqual({ itemCount: 4, inventoryCount: 2, inventoryCost: 32.35, soldCount: 1 })
  })

  it('reports per-slot record count and does not turn object slots into records', () => {
    expect(summarizeConflictSlot({ finance: { records: [{ amount: 1 }, { amount: 2 }] } }, 'finance.records')).toEqual({ kind: 'records', count: 2 })
    expect(summarizeConflictSlot({ calc: { debt: 2, wechat: 0 } }, 'calc')).toEqual({ kind: 'fields', count: 2 })
  })
})
