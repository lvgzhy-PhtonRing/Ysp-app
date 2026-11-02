import { describe, expect, it } from 'vitest'
import {
  createInventoryAssignmentRows,
  setInventoryAssignmentOwner,
  setInventoryAssignmentPurpose,
  summarizeInventoryAssignments,
} from './inventoryAssignment'

describe('inventory assignment UX state', () => {
  it('starts with Papa and applies the Payton default as investment', () => {
    const items = [{ id: 'a', cost: 20 }, { id: 'b', cost: 30 }]
    const rows = createInventoryAssignmentRows(items)

    expect(rows).toEqual([
      { itemId: 'a', owner: 'papa', isLongTerm: false },
      { itemId: 'b', owner: 'papa', isLongTerm: false },
    ])
    expect(setInventoryAssignmentOwner(rows, 'all', 'payton')).toEqual([
      { itemId: 'a', owner: 'payton', isLongTerm: false },
      { itemId: 'b', owner: 'payton', isLongTerm: false },
    ])
  })

  it('allows a per-item override after bulk assignment', () => {
    const rows = setInventoryAssignmentOwner(
      createInventoryAssignmentRows([{ id: 'a' }, { id: 'b' }]),
      'all',
      'payton',
    )

    expect(setInventoryAssignmentOwner(rows, 'b', 'papa')).toEqual([
      { itemId: 'a', owner: 'payton', isLongTerm: false },
      { itemId: 'b', owner: 'papa', isLongTerm: false },
    ])
  })

  it('summarizes mixed ownership and the same account costs used at confirmation', () => {
    const items = [
      { id: 'keep', cost: 10 },
      { id: 'invest', cost: 20 },
      { id: 'papa', cost: 30 },
    ]
    let rows = createInventoryAssignmentRows(items)
    rows = setInventoryAssignmentOwner(rows, 'keep', 'payton')
    rows = setInventoryAssignmentPurpose(rows, 'keep', true)
    rows = setInventoryAssignmentOwner(rows, 'invest', 'payton')

    expect(summarizeInventoryAssignments(items, rows)).toEqual({
      count: 3,
      totalCost: 60,
      paytonInvestCost: 20,
      paytonKeepCost: 10,
    })
  })
})
