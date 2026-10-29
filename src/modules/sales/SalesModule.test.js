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

  it('shows the three shop summaries for the selected owner and categorizes undated legacy sales as Other', async () => {
    loadData({ items: [
      { id: 'phton', owner: 'papa', status: 'sold', cost: 20, saleDetails: { price: 40, profit: 20, date: '2026-10-15' } },
      { id: 'side', owner: 'papa', status: 'sold', cost: 30, saleDetails: { shop: '侧空翻棉', price: 60, profit: 30, date: '2026-10-16' } },
      { id: 'legacy', owner: 'papa', status: 'sold', cost: 10, saleDetails: { price: 25, profit: 15 } },
      { id: 'payton', owner: 'payton', status: 'sold', cost: 50, saleDetails: { shop: 'PhtonRIng', price: 100, profit: 50 } },
    ] })

    store.currentOwner = 'papa'
    const papaHtml = await renderToString(h(SalesModule))
    expect(papaHtml).toContain('data-shop-summary="PhtonRIng"')
    expect(papaHtml).toContain('data-shop-summary="侧空翻棉"')
    expect(papaHtml).toContain('data-shop-summary="其它"')
    expect(store.items.find((item) => item.id === 'legacy').saleDetails.shop).toBe('其它')

    store.currentOwner = 'payton'
    const paytonHtml = await renderToString(h(SalesModule))
    expect(paytonHtml).toContain('data-shop-summary="PhtonRIng"')
    expect(paytonHtml).toMatch(/<article data-shop-summary="侧空翻棉"[\s\S]*?0 件[\s\S]*?0\.00[\s\S]*?<\/article>/)
  })

  it('renders order date, entry date, and confirmation state separately', async () => {
    loadData({ items: [
      { id: 'pending', owner: 'papa', name: '待确认车', sid: 'P-1', status: 'sold', cost: 20, saleDetails: { price: 40, profit: 20, date: '2026-10-20', isConfirmed: false, entryDate: '' } },
      { id: 'confirmed', owner: 'papa', name: '已确认车', sid: 'P-2', status: 'sold', cost: 30, saleDetails: { price: 60, profit: 30, date: '2026-10-21', isConfirmed: true, entryDate: '2026-10-22' } },
    ] })
    store.currentOwner = 'papa'

    const html = await renderToString(h(SalesModule))
    expect(html).toContain('下单日期')
    expect(html).toContain('入账日期')
    expect(html).toContain('待确认')
    expect(html).toContain('已确认到账')
    expect(html).toContain('2026-10-20')
    expect(html).toContain('2026-10-22')
  })
})
