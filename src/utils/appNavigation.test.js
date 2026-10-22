import { describe, expect, it } from 'vitest'
import { shouldShowGlobalOwnerSwitch } from './appNavigation'

describe('global owner switch visibility', () => {
  it('shows the switch on owner-dependent home and inventory pages', () => {
    expect(shouldShowGlobalOwnerSwitch('home')).toBe(true)
    expect(shouldShowGlobalOwnerSwitch('inventory')).toBe(true)
    expect(shouldShowGlobalOwnerSwitch('sales')).toBe(true)
  })

  it('hides the switch on owner-specific and single-owner pages', () => {
    expect(shouldShowGlobalOwnerSwitch('finance')).toBe(false)
    expect(shouldShowGlobalOwnerSwitch('payton-finance')).toBe(false)
    expect(shouldShowGlobalOwnerSwitch('purchase')).toBe(false)
    expect(shouldShowGlobalOwnerSwitch('rushcar')).toBe(false)
  })
})
