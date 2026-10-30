import { describe, expect, it } from 'vitest'
import { normalizeTaxpayerProfiles, findTaxpayerProfileConflict, upsertTaxpayerProfile } from './taxpayerProfiles'

describe('taxpayerProfiles', () => {
  it('normalizes names and tax IDs and keeps each name and ID in a one-to-one mapping', () => {
    expect(normalizeTaxpayerProfiles([
      { name: ' 主体甲 ', taxId: ' abC123 ' },
      { name: '主体甲', taxId: 'OTHER' },
      { name: '主体乙', taxId: 'abc123' },
      { name: '', taxId: 'EMPTY' },
    ])).toEqual([{ name: '主体甲', taxId: 'ABC123' }])
  })

  it('finds conflicts by either name or tax ID but permits the exact pair', () => {
    const profiles = [{ name: '主体甲', taxId: 'ABC123' }]
    expect(findTaxpayerProfileConflict(profiles, '主体甲', 'OTHER')?.field).toBe('name')
    expect(findTaxpayerProfileConflict(profiles, '主体乙', 'ABC123')?.field).toBe('taxId')
    expect(findTaxpayerProfileConflict(profiles, '主体甲', 'abc123')).toBeNull()
  })

  it('adds a new pair and rejects either side being reassigned', () => {
    const profiles = [{ name: '主体甲', taxId: 'ABC123' }]
    expect(upsertTaxpayerProfile(profiles, '主体乙', 'XYZ789')).toEqual({ profiles: [...profiles, { name: '主体乙', taxId: 'XYZ789' }], conflict: null })
    expect(upsertTaxpayerProfile(profiles, '主体甲', 'XYZ789').conflict?.field).toBe('name')
    expect(upsertTaxpayerProfile(profiles, '主体乙', 'ABC123').conflict?.field).toBe('taxId')
  })
})
