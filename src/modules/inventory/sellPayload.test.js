import { describe, expect, it } from 'vitest'
import { buildInventorySalePayload } from './sellPayload'

describe('buildInventorySalePayload', () => {
  it('keeps the selected shop on every item in a batch sale', () => {
    const form = {
      price: 100,
      express: 8,
      feeRate: 0.006,
      deduction: 2,
      date: '2026-10-22',
      shop: '侧空翻棉',
    }

    expect(buildInventorySalePayload(form, 0, 2)).toEqual({
      price: 50,
      express: 8,
      feeRate: 0.006,
      deduction: 2,
      date: '2026-10-22',
      shop: '侧空翻棉',
    })
    expect(buildInventorySalePayload(form, 1, 2)).toEqual({
      price: 50,
      express: 0,
      feeRate: 0.006,
      deduction: 0,
      date: '2026-10-22',
      shop: '侧空翻棉',
    })
  })
})
