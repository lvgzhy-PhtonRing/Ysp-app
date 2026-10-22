import { describe, expect, it } from 'vitest'
import { shouldShowGlobalOwnerSwitch } from './appNavigation'

describe('global owner switch visibility', () => {
  it('shows the switch on owner-dependent inventory pages, but reserves home for its group switch', () => {
    expect(shouldShowGlobalOwnerSwitch('home')).toBe(false)
    expect(shouldShowGlobalOwnerSwitch('inventory')).toBe(true)
    expect(shouldShowGlobalOwnerSwitch('sales')).toBe(true)
  })

  it('shows the switch on Public Finance and Payton Finance', () => {
    expect(shouldShowGlobalOwnerSwitch('finance')).toBe(true)
    expect(shouldShowGlobalOwnerSwitch('payton-finance')).toBe(true)
  })

  it('hides the switch on owner-specific and single-owner pages', () => {
    expect(shouldShowGlobalOwnerSwitch('purchase')).toBe(false)
    expect(shouldShowGlobalOwnerSwitch('rushcar')).toBe(false)
  })
})
