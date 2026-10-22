import { describe, expect, it } from 'vitest'
import { getPurchaseBatchesByCategory } from './purchaseOptions'

describe('purchase batch options', () => {
  it('includes the 2026 Shanghai CTE batch for domestic purchases', () => {
    expect(getPurchaseBatchesByCategory('国内')).toContain('2026上海CTE')
  })

  it('keeps the purchase-only US stock batch', () => {
    expect(getPurchaseBatchesByCategory('美淘')).toContain('美淘现货')
  })
})
