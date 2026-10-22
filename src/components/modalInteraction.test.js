import { describe, expect, it } from 'vitest'
import { shouldCloseOnOverlayClick } from './modalInteraction'

describe('shouldCloseOnOverlayClick', () => {
  it('does not close when a drag starts inside the modal and ends on the overlay', () => {
    expect(shouldCloseOnOverlayClick(true, false, true, true)).toBe(false)
  })

  it('closes when pointer starts and ends on the overlay', () => {
    expect(shouldCloseOnOverlayClick(true, true, true, true)).toBe(true)
  })

  it('does not close when overlay closing is disabled', () => {
    expect(shouldCloseOnOverlayClick(false, true, true, true)).toBe(false)
  })
})
