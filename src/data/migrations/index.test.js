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

  it('assigns legacy sales shops from the 2026-10-15 cutoff and preserves valid choices', () => {
    const output = migratePayload({ items: [
      { id: 'before', status: 'sold', saleDetails: { date: '2026-10-14' } },
      { id: 'cutoff', status: 'sold', saleDetails: { date: '2026-10-15' } },
      { id: 'after', status: 'sold', saleDetails: { date: '2026-10-16' } },
      { id: 'missing', status: 'sold', saleDetails: {} },
      { id: 'explicit', status: 'sold', saleDetails: { date: '2026-10-12', shop: '侧空翻棉' } },
      { id: 'unsold', status: 'inventory', saleDetails: { date: '2026-10-20' } },
    ] })

    expect(output.items.map((item) => item.saleDetails?.shop)).toEqual([
      '其它', 'PhtonRIng', 'PhtonRIng', '其它', '侧空翻棉', undefined,
    ])
  })

  it('migrates legacy sales as confirmed with the order date as entry date', () => {
    const output = migratePayload({
      items: [{ id: 'legacy-sale', status: 'sold', saleDetails: { date: '2026-10-20' } }],
    })

    expect(output.items[0].saleDetails).toMatchObject({ isConfirmed: true, entryDate: '2026-10-20' })
  })

  it('keeps explicit confirmation state and entry date', () => {
    const output = migratePayload({
      items: [{ id: 'current-sale', status: 'sold', saleDetails: {
        date: '2026-10-20', isConfirmed: false, entryDate: '',
      } }],
    })

    expect(output.items[0].saleDetails).toMatchObject({ isConfirmed: false, entryDate: '' })
  })

  it('does not infer an entry date for an explicitly pending sale', () => {
    const output = migratePayload({
      items: [{ id: 'pending-sale', status: 'sold', saleDetails: { date: '2026-10-20', isConfirmed: false } }],
    })

    expect(output.items[0].saleDetails.entryDate).toBe('')
  })

  it('does not invent an entry date for legacy sales without an order date', () => {
    const output = migratePayload({
      items: [{ id: 'undated-sale', status: 'sold', saleDetails: {} }],
    })

    expect(output.items[0].saleDetails.isConfirmed).toBe(true)
    expect(output.items[0].saleDetails.entryDate).toBe('')
  })

  it('does not copy an invalid order date to entry date', () => {
    const output = migratePayload({
      items: [{ id: 'invalid-date-sale', status: 'sold', saleDetails: { date: '2026-02-30' } }],
    })

    expect(output.items[0].saleDetails.isConfirmed).toBe(true)
    expect(output.items[0].saleDetails.entryDate).toBe('')
  })

  it('resets the legacy manual unconfirmed total to zero', () => {
    const output = migratePayload({ calc: { debt: 10, unconfirmed: 388 } })

    expect(output.calc).toMatchObject({ debt: 10, unconfirmed: 0 })
  })
})
