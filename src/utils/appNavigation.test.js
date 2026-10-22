import { describe, expect, it } from 'vitest'
import { shouldShowGlobalOwnerSwitch } from './appNavigation'

describe('global owner switch visibility', () => {
  it('hides the switch on owner-independent home and single-owner pages', () => {
    expect(shouldShowGlobalOwnerSwitch('home')).toBe(false)
    expect(shouldShowGlobalOwnerSwitch('purchase')).toBe(false)
    expect(shouldShowGlobalOwnerSwitch('rushcar')).toBe(false)
  })

  it('keeps the switch on owner-specific pages', () => {
    expect(shouldShowGlobalOwnerSwitch('inventory')).toBe(true)
    expect(shouldShowGlobalOwnerSwitch('sales')).toBe(true)
  })
})
