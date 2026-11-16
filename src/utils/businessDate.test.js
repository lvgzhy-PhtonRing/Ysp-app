import { describe, expect, it } from 'vitest'
import { getBusinessDate } from './businessDate'

describe('getBusinessDate', () => {
  it('uses the Shanghai calendar date across UTC month boundaries', () => {
    expect(getBusinessDate(new Date('2026-10-31T15:59:00.000Z'))).toBe('2026-10-31')
    expect(getBusinessDate(new Date('2026-10-31T16:00:00.000Z'))).toBe('2026-11-01')
    expect(getBusinessDate(new Date('2026-11-01T15:59:00.000Z'))).toBe('2026-11-01')
    expect(getBusinessDate(new Date('2026-11-01T16:00:00.000Z'))).toBe('2026-11-02')
  })
})
