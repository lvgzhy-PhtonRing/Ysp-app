import { describe, expect, it } from 'vitest'
import { getPurchaseGroupTransferIds } from './purchaseGrouping'

describe('purchase group transfer costs', () => {
  it('collects the original transfer from a removed line even when no kept line belongs to it', () => {
    const kept = { id: 'kept', purchaseDetails: { transferId: 'kept-transfer' } }
    const removed = { id: 'removed', purchaseDetails: { transferId: 'shared-transfer' } }
    const unchanged = { id: 'unchanged', purchaseDetails: { transferId: 'kept-transfer' } }
    const lines = [
      { id: 'kept', transferStatus: 'completed' },
      { id: 'unchanged', transferStatus: 'completed', transferId: 'kept-transfer' },
    ]
    const originals = new Map([kept, removed, unchanged].map((item) => [item.id, item]))
    expect([...getPurchaseGroupTransferIds(lines, originals, [removed])]).toEqual(['kept-transfer', 'shared-transfer'])
  })
})
