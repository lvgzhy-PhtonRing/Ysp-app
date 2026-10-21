import { describe, expect, it } from 'vitest'
import { aggregateSKUs } from './useSalesAnalysis'

describe('aggregateSKUs owner isolation', () => {
  it('does not merge identical SKU keys across owners', () => {
    const skus = aggregateSKUs([
      { owner: 'papa', status: 'sold', brand: 'Hotwheels', name: 'car', cost: 10, saleDetails: { profit: 1, price: 11 } },
      { owner: 'payton', status: 'sold', brand: 'Hotwheels', name: 'car', cost: 20, saleDetails: { profit: 2, price: 22 } },
    ])
    expect(skus).toHaveLength(2)
    expect(skus.map((sku) => sku.owner).sort()).toEqual(['papa', 'payton'])
    expect(skus.map((sku) => sku.totalCost).sort()).toEqual([10, 20])
  })
})
