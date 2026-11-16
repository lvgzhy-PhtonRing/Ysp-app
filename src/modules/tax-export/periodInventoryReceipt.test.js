import { readFile } from 'node:fs/promises'
import JSZip from 'jszip'
import { describe, expect, it, vi } from 'vitest'
import { buildPeriodInventoryReceipt, combineInventoryNote, writePeriodInventoryReceipt } from './periodInventoryReceipt'

const range = { startDate: '2026-10-15', endDate: '2026-10-31', taxpayerName: '测试纳税主体', taxpayerId: 'AUDIT123' }

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

  it('keeps an explicit zero cost and falls back only for missing or invalid costs', () => {
    const costs = [0, '0', undefined, '', 'not-a-number', 5]
    const result = buildPeriodInventoryReceipt({
      items: costs.map((cost, index) => ({ sid: `S${index}`, cost, purchaseDetails: { date: '2026-10-20', preTransferCost: 17 } })),
    }, range)
    expect(result.rows.map((item) => item.unitCost)).toEqual([0, 0, 17, 17, 17, 5])
    expect(result.totals.cost).toBe(56)
  })

  it('writes literal replacement markers and quotes to the worksheet XML', async () => {
    const template = await readFile(new URL('./templates/period-inventory-intake-a3-template.xlsx', import.meta.url))
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:audit')
    const link = { click: vi.fn(), remove: vi.fn(), style: {} }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, arrayBuffer: async () => template }))
    vi.stubGlobal('document', { createElement: () => link, body: { appendChild: vi.fn() } })
    vi.stubGlobal('window', { setTimeout: vi.fn() })
    try {
      await writePeriodInventoryReceipt({
        items: [{ sid: 'S1', name: 'A $& "原名"', cost: 0, purchaseDetails: { date: '2026-10-20', preTransferCost: 17, note: "B $' 备注" } }],
      }, range, 'audit.xlsx')
      const zip = await JSZip.loadAsync(await createObjectURL.mock.calls[0][0].arrayBuffer())
      const xml = await zip.file('xl/worksheets/sheet1.xml').async('string')
      expect(xml.match(/<ns0:sheetData>/g)).toHaveLength(1)
      expect(xml).toContain('A $&amp; &quot;原名&quot;')
      expect(xml).toContain('B $&apos; 备注')
      expect(xml).toMatch(/<ns0:c r="F8"[^>]*><ns0:v>0<\/ns0:v>/)
      expect(link.click).toHaveBeenCalledOnce()
    } finally {
      vi.unstubAllGlobals()
      createObjectURL.mockRestore()
    }
  })
})
