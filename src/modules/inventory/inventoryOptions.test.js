import { describe, expect, it } from 'vitest'
import { getBatchesByCategory } from './inventoryOptions'

describe('inventory batch options', () => {
  it('includes the 2026 Shanghai CTE batch for domestic inventory', () => {
    expect(getBatchesByCategory('国内')).toContain('2026上海CTE')
  })
})
