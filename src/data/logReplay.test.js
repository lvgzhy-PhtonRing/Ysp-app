import { describe, expect, it } from 'vitest'
import { reconstructAtTime } from './logReplay'

describe('sale log replay', () => {
  it('restores the saved stock state when reversing an inventory sales sync', () => {
    const current = {
      items: [{
        id: 'batch-sale', status: 'sold', stock: 0,
        saleDetails: { beforeSaleState: { status: 'inventory', stock: 3 } },
      }],
    }
    const logs = [{
      id: 1, time: '2026-10-29T12:00:00.000Z', type: 'inventory_sales_sync',
      detail: { itemIds: ['batch-sale'] },
    }]

    const { state, skipped } = reconstructAtTime(current, logs)

    expect(skipped).toEqual([])
    expect(state.items[0]).toMatchObject({ status: 'inventory', stock: 3 })
    expect(state.items[0].saleDetails).toBeUndefined()
  })

  it('reverses a confirmation log to its prior confirmation state and entry date', () => {
    const current = {
      items: [{ id: 'confirmed-sale', status: 'sold', saleDetails: { isConfirmed: false, entryDate: '' } }],
    }
    const logs = [{
      id: 2, time: '2026-10-29T12:00:00.000Z', type: 'sales_confirmation',
      detail: {
        itemId: 'confirmed-sale',
        before: { isConfirmed: true, entryDate: '2026-10-28' },
        after: { isConfirmed: false, entryDate: '' },
      },
    }]

    const { state, skipped } = reconstructAtTime(current, logs)

    expect(skipped).toEqual([])
    expect(state.items[0].saleDetails).toMatchObject({ isConfirmed: true, entryDate: '2026-10-28' })
  })
})
