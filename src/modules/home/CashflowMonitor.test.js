import { describe, expect, it, vi } from 'vitest'
import { h } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { state } from '../../data/store'
import CashflowMonitor from './CashflowMonitor.vue'

describe('CashflowMonitor', () => {
  it('shows Payton months before opening as unavailable instead of zero', async () => {
    const previous = {
      currentOwner: state.currentOwner,
      items: state.items,
      snapshots: state.snapshots,
      ownerRegistry: state.ownerRegistry,
      loanRecords: state.loanRecords,
      calc: state.calc,
    }
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-22T12:00:00'))

    Object.assign(state, {
      currentOwner: 'payton',
      items: [],
      snapshots: [],
      ownerRegistry: { payton: { openingAt: '2026-10-15', loans: [] } },
      loanRecords: [],
      calc: { debt: 0 },
    })

    try {
      const html = await renderToString(h(CashflowMonitor))
      const november = html.match(/<span[^>]*>11月<\/span>[\s\S]{0,300}?<span[^>]*>(.*?)<\/span>/)
      expect(november?.[1]).toBe('--')
    } finally {
      Object.assign(state, previous)
      vi.useRealTimers()
    }
  })
})
