import { describe, expect, it, vi } from 'vitest'
import { loadTaxExportPeriod, saveTaxExportPeriod } from './periodStorage'

describe('tax export period storage', () => {
  it('round-trips the last valid date range', () => {
    const values = new Map()
    vi.stubGlobal('localStorage', {
      getItem: (key) => values.get(key) || null,
      setItem: (key, value) => values.set(key, value),
    })

    saveTaxExportPeriod('2026-10-01', '2026-12-31')

    expect(loadTaxExportPeriod()).toEqual({ startDate: '2026-10-01', endDate: '2026-12-31' })
  })

  it('ignores malformed or reversed saved periods', () => {
    vi.stubGlobal('localStorage', { getItem: () => '{"startDate":"2026-12-31","endDate":"2026-10-01"}' })

    expect(loadTaxExportPeriod()).toBeNull()
  })
})
