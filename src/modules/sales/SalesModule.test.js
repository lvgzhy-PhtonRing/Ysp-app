import { beforeEach, describe, expect, it } from 'vitest'
import { h } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { loadData, state as store } from '../../data/store'
import SalesModule from './SalesModule.vue'

describe('SalesModule owner scope', () => {
  beforeEach(() => {
    loadData({
      items: [
        { id: 1, owner: 'papa', status: 'sold', cost: 50, saleDetails: { price: 100, profit: 50, date: '2026-10-01' } },
        { id: 2, owner: 'payton', status: 'sold', cost: 400, saleDetails: { price: 900, profit: 500, date: '2026-10-02' } },
        { id: 3, owner: 'papa', status: 'inventory', name: 'Papa库存' },
        { id: 4, owner: 'payton', status: 'inventory', name: 'Payton库存' },
      ],
    })
  })

  it('limits sales totals and add-sale inventory choices to the selected owner', async () => {
    const renderOwner = async (owner) => {
      store.currentOwner = owner
      return renderToString(h(SalesModule))
    }

    const papaHtml = await renderOwner('papa')
    expect(papaHtml).toContain('销售渠道')
    expect(papaHtml).toContain('PhtonRIng')
    expect(papaHtml).toContain('侧空翻棉')
    expect(papaHtml).toContain('其它')
    expect(papaHtml).toContain('累计成交</div><div class="text-2xl font-bold text-gray-800">1 <span')
    expect(papaHtml).toContain('成交总额</div><div class="text-2xl font-bold text-gray-800">100.00</div>')
    const paytonHtml = await renderOwner('payton')
    expect(paytonHtml).toContain('累计成交</div><div class="text-2xl font-bold text-gray-800">1 <span')
    expect(paytonHtml).toContain('成交总额</div><div class="text-2xl font-bold text-gray-800">900.00</div>')
  })
})
