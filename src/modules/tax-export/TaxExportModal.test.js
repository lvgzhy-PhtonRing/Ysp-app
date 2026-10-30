import { describe, expect, it } from 'vitest'
import { h } from 'vue'
import { renderToString } from '@vue/server-renderer'
import TaxExportModal from './TaxExportModal.vue'

describe('TaxExportModal', () => {
  it('shows separate taxpayer fields and remembered paired suggestions', async () => {
    const html = await renderToString(h(TaxExportModal, {
      modelValue: true,
      payload: { items: [
        { id: 'included', owner: 'papa', name: '确认车', sid: 'A-1', status: 'sold', cost: 50, saleDetails: { date: '2026-09-30', shop: 'PhtonRIng', entryDate: '2026-10-10', isConfirmed: true, price: 100, express: 8, feeRate: 0.01 } },
        { id: 'pending', owner: 'payton', name: '未确认车', sid: 'B-2', status: 'sold', cost: 10, saleDetails: { date: '2026-10-11', shop: 'PhtonRIng', price: 20, isConfirmed: false } },
      ], taxpayerProfiles: [{ name: '主体甲', taxId: '91310000ABC123' }] },
    }))

    expect(html).toContain('报税导出')
    expect(html).toContain('纳税主体名称')
    expect(html).toContain('纳税人识别号')
    expect(html).toContain('datalist')
    expect(html).toContain('主体甲')
    expect(html).toContain('91310000ABC123')
    expect(html).toContain('导出前筛选销售')
    expect(html).toContain('PhtonRIng')
    expect(html).toContain('侧空翻棉')
    expect(html).toContain('其它')
    expect(html).not.toContain('纳入 Owner')
    expect(html).toContain('默认仅纳入 PhtonRIng')
    expect(html).toContain('确认销售</div><b>1 笔')
    expect(html).toContain('待确认事项</div><b')
    expect(html).toContain('不会展示下单日期')
    expect(html).not.toContain('Owner')
    expect(html).toContain('税务分类')
  })
})
