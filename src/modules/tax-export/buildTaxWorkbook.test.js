import { describe, expect, it, vi } from 'vitest'
import * as XLSX from 'xlsx'
import { buildTaxWorkbookData, createTaxWorkbook, writeTaxWorkbook } from './buildTaxWorkbook'

vi.mock('xlsx', async (importOriginal) => ({ ...(await importOriginal()), writeFile: vi.fn() }))

const period = { startDate: '2026-10-01', endDate: '2026-12-31', taxpayer: 'Papa 个体户', channels: ['PhtonRIng', '侧空翻棉', '其它'] }

describe('buildTaxWorkbookData', () => {
  const payload = {
    items: [
      { id: 'before', owner: 'papa', name: '期初前销售', sid: 'S0', cost: 30, status: 'sold', saleDetails: { date: '2026-09-30', entryDate: '2026-09-30', isConfirmed: true, price: 50 } },
      { id: 'start', owner: 'papa', name: '期初日', sid: 'S1', batch: '上海CTE', cost: 50, status: 'sold', saleDetails: { date: '2026-09-30', entryDate: '2026-10-01', isConfirmed: true, price: 100, express: 8, feeRate: 0.01, deduction: 0 } },
      { id: 'end', owner: 'payton', name: '期末日', sid: 'S2', cost: 10, status: 'sold', saleDetails: { date: '2027-01-01', entryDate: '2026-12-31', isConfirmed: true, price: 20, express: 1, feeRate: 0, deduction: -2 } },
      { id: 'pending', owner: 'payton', name: '未确认', sid: 'S3', cost: 10, status: 'sold', saleDetails: { date: '2026-10-15', price: 30, isConfirmed: false } },
      { id: 'missing', owner: 'papa', name: '无入账日', sid: 'S4', cost: 10, status: 'sold', saleDetails: { price: 30, isConfirmed: true, entryDate: '' } },
      { id: 'invalid', owner: 'papa', name: '错误入账日', sid: 'S5', cost: 10, status: 'sold', saleDetails: { price: 30, isConfirmed: true, entryDate: '2026-13-40' } },
      { id: 'other-owner', owner: 'other', name: '申报期外', status: 'sold', saleDetails: { price: 99, isConfirmed: true, entryDate: '2027-01-01' } },
    ],
    financeRecords: [
      { id: 'expense', owner: 'papa', date: '2026-11-01', type: 'expense', item: '包装', amount: 5, note: '凭证待核' },
      { id: 'no-date', owner: 'papa', type: 'expense', item: '无日期', amount: 7 },
    ],
  }

  it('filters confirmed sales by inclusive entry date and omits order date', () => {
    const result = buildTaxWorkbookData(payload, period)
    const rows = result.sheets.find((sheet) => sheet.name === '销售明细').rows
    expect(rows.map((row) => row.sid)).toEqual(['S1', 'S2'])
    expect(rows[0]).not.toHaveProperty('下单日期')
  })

  it('excludes unconfirmed rows and lists them as issues', () => {
    const result = buildTaxWorkbookData(payload, period)
    expect(result.sheets.find((sheet) => sheet.name === '销售明细').rows.some((row) => row.sid === 'S3')).toBe(false)
    expect(result.sheets.find((sheet) => sheet.name === '待确认事项').rows.some((row) => row.sid === 'S3' && row.issue.includes('未确认'))).toBe(true)
  })

  it('lists missing and invalid entry dates without guessing', () => {
    const rows = buildTaxWorkbookData(payload, period).sheets.find((sheet) => sheet.name === '待确认事项').rows
    expect(rows.some((row) => row.sid === 'S4' && row.issue.includes('缺少'))).toBe(true)
    expect(rows.some((row) => row.sid === 'S5' && row.issue.includes('无效'))).toBe(true)
  })

  it('keeps item costs and signed adjustments separate and summarizes owners', () => {
    const result = buildTaxWorkbookData(payload, period)
    const sales = result.sheets.find((sheet) => sheet.name === '销售明细').rows
    expect(sales[0]).toMatchObject({ cost: 50, platformFee: 1, express: 8, adjustment: 0, referenceProfit: 41 })
    expect(sales[1]).toMatchObject({ cost: 10, platformFee: 0, express: 1, adjustment: -2, referenceProfit: 11 })
    const summary = result.sheets.find((sheet) => sheet.name === 'A表经营数据').rows
    expect(summary.find((row) => row.metric === '销售收入')?.amount).toBe(120)
    expect(summary.find((row) => row.metric.startsWith('商品成本参考'))?.amount).toBe(60)
    expect(summary.find((row) => row.metric === '补差合计（单列核对）')?.amount).toBe(-2)
    expect(result.sheets.find((sheet) => sheet.name === '补差明细').rows).toMatchObject([
      { sid: 'S2', adjustment: -2, direction: '买家补给卖方' },
    ])
  })

  it('includes selected period expenses and flags missing taxpayer and unclassified data', () => {
    const result = buildTaxWorkbookData(payload, { ...period, taxpayer: '' })
    expect(result.sheets.find((sheet) => sheet.name === '收支明细').rows).toHaveLength(1)
    const issues = result.sheets.find((sheet) => sheet.name === '待确认事项').rows
    expect(issues.some((row) => row.issue.includes('纳税主体'))).toBe(true)
    expect(issues.some((row) => row.issue.includes('税务分类'))).toBe(true)
    expect(issues.some((row) => row.id === 'no-date')).toBe(true)
  })

  it('serializes the required workbook sheets without a sale order-date column', () => {
    const result = buildTaxWorkbookData(payload, period)
    const workbook = createTaxWorkbook(result, XLSX)
    expect(workbook.SheetNames).toEqual(['阅读说明', '申报步骤清单', '增值税核对', 'A表经营数据', '销售明细', '收支明细', '补差明细', '待确认事项'])
    const headers = XLSX.utils.sheet_to_json(workbook.Sheets['销售明细'], { header: 1 })[0]
    expect(headers).toContain('入账日期')
    expect(headers).not.toContain('下单日期')
  })

  it('downloads the generated workbook locally with the selected filename', async () => {
    const result = buildTaxWorkbookData(payload, period)
    await writeTaxWorkbook(result, 'YSP报税工作簿_2026Q4.xlsx')
    expect(XLSX.writeFile).toHaveBeenCalledWith(expect.objectContaining({ SheetNames: expect.any(Array) }), 'YSP报税工作簿_2026Q4.xlsx')
  })

  it('filters sales by shop across all owners and does not export Owner fields', () => {
    const result = buildTaxWorkbookData({
      items: [
        { id: 'papa-pr', owner: 'papa', sid: 'P-1', status: 'sold', cost: 10, saleDetails: { shop: 'PhtonRIng', isConfirmed: true, entryDate: '2026-10-10', price: 30 } },
        { id: 'payton-pr', owner: 'payton', sid: 'Y-1', status: 'sold', cost: 20, saleDetails: { shop: 'PhtonRIng', isConfirmed: true, entryDate: '2026-10-11', price: 40 } },
        { id: 'papa-side', owner: 'papa', sid: 'P-2', status: 'sold', cost: 30, saleDetails: { shop: '侧空翻棉', isConfirmed: true, entryDate: '2026-10-12', price: 50 } },
      ],
      financeRecords: [
        { id: 'papa-expense', owner: 'papa', date: '2026-10-10', type: 'expense', item: '包装', amount: 5 },
        { id: 'payton-expense', owner: 'payton', date: '2026-10-11', type: 'expense', item: '运费', amount: 8 },
      ],
    }, { ...period, owners: ['papa'], channels: ['PhtonRIng'] })

    expect(result.sheets.find((sheet) => sheet.name === '销售明细').rows.map((row) => row.id)).toEqual(['papa-pr', 'payton-pr'])
    expect(result.sheets.find((sheet) => sheet.name === '收支明细').rows).toHaveLength(2)
    expect(result.period).not.toHaveProperty('owners')
    expect(result.period).not.toHaveProperty('channels')
    expect(result.sheets.every((sheet) => !sheet.headers.includes('Owner'))).toBe(true)
    expect(result.sheets.every((sheet) => !sheet.headers.includes('销售渠道'))).toBe(true)
    expect(result.sheets.find((sheet) => sheet.name === '销售明细').rows.every((row) => !('shop' in row) && !('owner' in row))).toBe(true)
    expect(result.sheets.find((sheet) => sheet.name === '阅读说明').rows.some((row) => /Owner|销售渠道|PhtonRIng|侧空翻棉|其它/.test(`${row.field} ${row.value}`))).toBe(false)
  })
})
