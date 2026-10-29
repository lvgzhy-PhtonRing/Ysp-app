import { describe, expect, it } from 'vitest'
import { getSaleNetProceeds, getSalePendingAmount, getUnconfirmedSalesTotal } from './saleAccounting'

describe('sale accounting', () => {
  it('pending amount excludes freight but includes fee and signed deduction', () => {
    expect(getSalePendingAmount({
      status: 'sold',
      saleDetails: { isConfirmed: false, price: 100, express: 8, feeRate: 0.01, deduction: 10 },
    })).toBeCloseTo(89, 2)
    expect(getSalePendingAmount({
      status: 'sold',
      saleDetails: { isConfirmed: false, price: 100, express: 8, feeRate: 0.01, deduction: -10 },
    })).toBeCloseTo(109, 2)
  })

  it('combines pending sales across owners and skips confirmed or unsold rows', () => {
    const items = [
      { owner: 'papa', status: 'sold', saleDetails: { isConfirmed: false, price: 100, feeRate: 0.01 } },
      { owner: 'payton', status: 'sold', saleDetails: { isConfirmed: false, price: 50 } },
      { owner: 'papa', status: 'sold', saleDetails: { isConfirmed: true, price: 80 } },
      { owner: 'payton', status: 'inventory', saleDetails: { isConfirmed: false, price: 70 } },
    ]

    expect(getUnconfirmedSalesTotal(items)).toBeCloseTo(149, 2)
  })

  it('treats missing and invalid numeric values as zero', () => {
    expect(getSaleNetProceeds({ price: 'not-a-number', express: 4 })).toBe(-4)
    expect(getSalePendingAmount({ status: 'sold', saleDetails: { isConfirmed: false, price: 10, feeRate: 'invalid' } })).toBe(10)
    expect(getUnconfirmedSalesTotal(null)).toBe(0)
  })
})
