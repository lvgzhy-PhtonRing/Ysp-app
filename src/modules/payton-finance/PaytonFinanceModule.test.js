import { beforeEach, describe, expect, it, vi } from 'vitest'
import { h } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { loadData, state } from '../../data/store'
import PaytonFinanceModule from './PaytonFinanceModule.vue'

describe('PaytonFinanceModule', () => {
  beforeEach(() => {
    loadData({ ownerRegistry: { papa: {}, payton: { pocketBalance: 100, investBalance: 200, loans: [], accountTransfers: [], monthlyAllowance: 200 } } })
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {}, removeItem: () => {} })
  })

  it('renders the balance cards and required workflows', async () => {
    const html = await renderToString(h(PaytonFinanceModule))
    expect(html).toContain('零钱')
    expect(html).toContain('投资账户')
    expect(html).toContain('贷款剩余')
    expect(html).toContain("Payton&#39;s 基金")
    expect(html).toContain('贷款清单')
    expect(html).toContain('零钱↔投资互转')
    expect(state.ownerRegistry.payton.pocketBalance).toBe(100)
  })
})
