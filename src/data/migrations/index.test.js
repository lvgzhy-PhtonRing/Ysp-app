import { describe, expect, it } from 'vitest'
import { migratePayload } from './index'

describe('migratePayload', () => {
  it('assigns legacy records to Papa and initializes the Payton registry without mutating input', () => {
    const input = {
      items: [{ id: 'i1', status: 'purchase' }, { id: 'i2', owner: 'payton' }],
      finance: { records: [{ id: 'r1' }], loans: [{ id: 'l1' }] },
    }
    const output = migratePayload(input)
    expect(output.items.map((item) => item.owner)).toEqual(['papa', 'payton'])
    expect(output.finance.records[0].owner).toBe('papa')
    expect(output.finance.loans[0].owner).toBe('papa')
    expect(output.ownerRegistry.payton).toMatchObject({ pocketBalance: 0, investBalance: 0, loans: [] })
    expect(input.items[0].owner).toBeUndefined()
  })

  it('preserves existing owners and ownerRegistry fields', () => {
    const input = {
      items: [{ id: 1, owner: 'payton' }, { id: 2, owner: 'papa' }],
      finance: { records: [{ owner: 'payton' }], loans: [{ owner: 'papa' }] },
      ownerRegistry: { payton: { pocketBalance: 123, custom: true } },
    }
    const output = migratePayload(input)
    expect(output.items).toEqual(input.items)
    expect(output.finance).toEqual(input.finance)
    expect(output.ownerRegistry.payton).toMatchObject({ pocketBalance: 123, custom: true })
  })

  it('is idempotent and tolerates incomplete payloads', () => {
    const first = migratePayload({ items: [{ id: 1 }] })
    expect(migratePayload(first)).toEqual(first)
    expect(migratePayload(null).items).toEqual([])
  })
})
