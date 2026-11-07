import { describe, expect, it } from 'vitest'
import { buildPeriodInventoryReceipt, combineInventoryNote } from './periodInventoryReceipt'

describe('period inventory receipt notes', () => {
  it('combines status and purchase-group note without losing either', () => {
    expect(combineInventoryNote('已入库后售出', '黑皮咖啡购买')).toBe('已入库后售出；购买组备注：黑皮咖啡购买')
    expect(combineInventoryNote('', '信用卡汇率待确认')).toBe('购买组备注：信用卡汇率待确认')
    expect(combineInventoryNote('采购中，尚未实际入库', '')).toBe('采购中，尚未实际入库')
  })

  it('exports the purchase-group note into the existing remark field', () => {
    const result = buildPeriodInventoryReceipt({
      items: [{
        id: 'item-1', sid: 'CN-TEST', name: '商品', status: 'purchase', cost: 10,
        purchaseDetails: { date: '2026-10-20', paymentBatch: '批次A', note: '购买组原始备注' },
      }],
    }, { startDate: '2026-10-15', endDate: '2026-10-31' })
    expect(result.rows[0].note).toBe('采购中，尚未实际入库；购买组备注：购买组原始备注')
  })

  it('keeps the same purchase group together after the purchase-date sort', () => {
    const result = buildPeriodInventoryReceipt({
      items: [
        { id: 'b2', sid: 'S2', name: 'B组后项', status: 'purchase', purchaseDetails: { date: '2026-10-20', paymentBatch: 'B组' } },
        { id: 'a1', sid: 'S1', name: 'A组', status: 'purchase', purchaseDetails: { date: '2026-10-20', paymentBatch: 'A组' } },
        { id: 'b1', sid: 'S1', name: 'B组前项', status: 'purchase', purchaseDetails: { date: '2026-10-20', paymentBatch: 'B组' } },
      ],
    }, { startDate: '2026-10-15', endDate: '2026-10-31' })
    expect(result.rows.map((row) => `${row.paymentBatch}-${row.sid}`)).toEqual(['A组-S1', 'B组-S1', 'B组-S2'])
  })
})
