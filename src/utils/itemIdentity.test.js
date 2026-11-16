import { describe, expect, it, vi } from 'vitest'
import { comparePurchaseItemsDesc, createItemIdentity, getItemCreationOrder } from './itemIdentity'

describe('product identity', () => {
  it('checks a generated ID against existing products and keeps creation order distinct', () => {
    const clock = vi.spyOn(Date, 'now').mockReturnValue(1794873600000)
    const ids = vi.spyOn(globalThis.crypto, 'randomUUID')
      .mockReturnValueOnce('existing')
      .mockReturnValueOnce('next-id')
      .mockReturnValueOnce('last-id')
    try {
      const first = createItemIdentity([{ id: 'existing' }])
      const next = createItemIdentity([first])
      expect(first.id).toBe('next-id')
      expect(next.id).toBe('last-id')
      expect(next.creationOrder).toBeGreaterThan(first.creationOrder)
    } finally {
      clock.mockRestore()
      ids.mockRestore()
    }
  })

  it('uses purchase date first and supports new and legacy same-day orders', () => {
    const sameDay = { date: '2026-11-16' }
    const old = { id: 1794873600000, purchaseDetails: sameDay }
    const imported = { id: 'car_007', purchaseDetails: sameDay }
    const earlier = { id: 'new-older-purchase', creationOrder: 1794873600020, purchaseDetails: { date: '2026-11-15' } }
    const fresh = { id: 'new-same-day', creationOrder: 1794873600001, purchaseDetails: sameDay }
    expect(getItemCreationOrder(old)).toBe(old.id)
    expect(getItemCreationOrder(imported)).toBe(0)
    expect([earlier, imported, old, fresh].sort(comparePurchaseItemsDesc)).toEqual([fresh, old, imported, earlier])
  })
})
