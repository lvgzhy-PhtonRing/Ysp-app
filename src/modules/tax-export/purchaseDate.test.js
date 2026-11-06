import { describe, expect, it } from 'vitest'
import { resolvePurchaseDate } from './purchaseDate'

describe('resolvePurchaseDate', () => {
  it('uses the recorded purchase date first', () => {
    expect(resolvePurchaseDate({ category: '日淘', batch: '预订', purchaseDetails: { date: '2026-10-08' } })).toBe('2026-10-08')
  })

  it('uses the same batch fallback as the purchase ledger when the date is missing', () => {
    expect(resolvePurchaseDate({ category: '日淘', batch: '预订', purchaseDetails: { date: '' } })).toBe('2025-12-15')
    expect(resolvePurchaseDate({ category: '国内', batch: '国内现货', purchaseDetails: { date: '' } })).toBe('')
  })
})
