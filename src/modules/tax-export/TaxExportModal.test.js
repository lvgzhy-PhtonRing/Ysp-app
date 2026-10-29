import { describe, expect, it } from 'vitest'
import { h } from 'vue'
import { renderToString } from '@vue/server-renderer'
import TaxExportModal from './TaxExportModal.vue'

describe('TaxExportModal', () => {
  it('previews entry-date totals and warns that taxpayer mapping requires manual confirmation', async () => {
    const html = await renderToString(h(TaxExportModal, {
      modelValue: true,
      payload: { items: [
        { id: 'included', owner: 'papa', name: '确认车', sid: 'A-1', status: 'sold', cost: 50, saleDetails: { date: '2026-09-30', entryDate: '2026-10-10', isConfirmed: true, price: 100, express: 8, feeRate: 0.01 } },
        { id: 'pending', owner: 'payton', name: '未确认车', sid: 'B-2', status: 'sold', cost: 10, saleDetails: { date: '2026-10-11', price: 20, isConfirmed: false } },
      ] },
    }))

    expect(html).toContain('报税工作簿导出')
    expect(html).toContain('纳税主体（请人工填写确认）')
    expect(html).toContain('确认销售</div><b>1 笔')
    expect(html).toContain('待确认事项</div><b')
    expect(html).toContain('不会展示下单日期')
    expect(html).toContain('不代表纳税主体映射')
    expect(html).toContain('税务分类')
  })
})
