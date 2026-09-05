import { describe, expect, it } from 'vitest'
import {
  getLogBrief,
  getLogDetailSections,
  getLogMeta,
  getLogModule,
  hasLogDetail,
} from './operationLogDisplay'

describe('getLogMeta / getLogModule', () => {
  it('known type returns its own meta, unknown type falls back', () => {
    expect(getLogMeta('inventory_delete').label).toBe('库存删除')
    expect(getLogMeta('inventory_delete').pillClass).toContain('bg-red-100')

    const fallback = getLogMeta('nobody_knows_this')
    expect(fallback.label).toBe('未知')
    expect(fallback.pillClass).toContain('bg-gray-100')
  })

  it('module label is derived from the type prefix', () => {
    expect(getLogModule('inventory_delete')).toBe('库存')
    expect(getLogModule('purchase_transfer')).toBe('采购')
    expect(getLogModule('calc_update')).toBe('数据透视')
    expect(getLogModule('')).toBe('-')
  })
})

describe('getLogBrief', () => {
  it('renders per-type templates from detail', () => {
    const cases = [
      [
        { type: 'inventory_delete', detail: { sid: 'JP-1', name: '车模A', deletedCount: 2 } },
        '删除了2件库存',
      ],
      [
        { type: 'purchase_delete', detail: { sid: 'JP-1', name: '车模A', itemId: 'i1' } },
        '删除采购商品：车模A',
      ],
      [
        { type: 'inventory_edit', detail: { sid: 'JP-1', name: '车模A', changes: { cost: { before: 100, after: 200 } } } },
        '编辑库存：车模A（成本 ¥100→¥200）',
      ],
      [{ type: 'sales_submit', detail: { name: '车模A', qty: 1 } }, '记录销售：车模A ×1'],
      [
        { type: 'finance_delete_record', detail: { item: '买保护壳', amount: 50 } },
        '删除收支：买保护壳（¥50）',
      ],
      [
        { type: 'calc_update', detail: { field: 'debt', before: 1000, after: 800 } },
        '更新参数：总负债 ¥1000→¥800',
      ],
      [
        { type: 'purchase_transfer', detail: { transferBatch: 'T-001', count: 3 } },
        '提交转运：T-001（3件）',
      ],
      [
        { type: 'purchase_add', detail: { purchaseGroupId: 'PG-1', totalItems: 4, totalSids: 2 } },
        '新增购买组：PG-1（4件/2个SID）',
      ],
      [
        { type: 'inventory_long_term', detail: { category: '日淘', batch: '26h批' } },
        '标记长线库存：日淘/26h批',
      ],
    ]

    cases.forEach(([log, expected]) => {
      expect(getLogBrief(log)).toBe(expected)
    })
  })

  it('edit log without changes keeps the bare name', () => {
    expect(getLogBrief({ type: 'inventory_edit', detail: { name: '车模A', sid: 'JP-1' } })).toBe('编辑库存：车模A')
  })

  it('unlist suffix only appears when more than one item is affected', () => {
    expect(getLogBrief({ type: 'inventory_unlist', detail: { name: '车模A', count: 1 } })).toBe('下架回采购：车模A')
    expect(getLogBrief({ type: 'inventory_unlist', detail: { name: '车模A', count: 3 } })).toBe('下架回采购：车模A（3件）')
  })

  it('unknown type or empty detail falls back to the legacy message', () => {
    expect(getLogBrief({ type: 'cloud_sync', message: '已同步云端数据' })).toBe('已同步云端数据')
    expect(getLogBrief({ type: 'inventory_delete', message: '删除商品: 车模A' })).toBe('删除商品: 车模A')
    expect(getLogBrief({ type: 'inventory_delete', detail: {}, message: '删除商品: 车模A' })).toBe('删除商品: 车模A')
    expect(getLogBrief({ type: 'app_undo' })).toBe('-')
  })
})

describe('getLogDetailSections', () => {
  it('outputs changes / items / names / kv / raw in order', () => {
    const log = {
      type: 'inventory_delete',
      detail: {
        sid: 'JP-1',
        itemId: 'i1',
        changes: { cost: { before: 100, after: 200 } },
        deletedItems: [{ name: '车模A', sid: 'JP-1', status: 'inventory', cost: 123.456 }],
        itemNames: ['车模A', '车模B'],
        extra: '值',
      },
    }

    const sections = getLogDetailSections(log)
    expect(sections.map((s) => s.kind)).toEqual(['changes', 'items', 'names', 'kv', 'raw'])

    expect(sections[0].rows).toEqual([{ field: '成本', before: '¥100', after: '¥200' }])
    expect(sections[1].columns).toEqual(['名称', 'SID', '状态', '成本'])
    expect(sections[1].rows).toEqual([['车模A', 'JP-1', '库存', '¥123.46']])
    expect(sections[2].names).toEqual(['车模A', '车模B'])
    expect(sections[4].json).toContain('"extra"')
  })

  it('consumed fields are not repeated in the kv section', () => {
    const section = getLogDetailSections({
      type: 'inventory_delete',
      detail: { sid: 'JP-1', name: '车模A', itemId: 'i1', deletedItems: [{ name: '车模A', sid: 'JP-1' }] },
    })[0]

    expect(section.kind).toBe('items')
    expect(section.entries).toBeUndefined()
  })

  it('nested values are compacted to JSON instead of a placeholder', () => {
    const kv = getLogDetailSections({
      type: 'inventory_manual_add',
      detail: { itemId: 'i1', name: '车模A', sid: 'MAN-0001', purchaseDetails: { transferId: 'T-1' } },
    })[0]

    expect(kv.kind).toBe('kv')
    const entry = kv.entries.find((x) => x.key === '采购信息')
    expect(entry.value).toBe('{"transferId":"T-1"}')
  })

  it('legacy logs without detail produce no sections', () => {
    expect(getLogDetailSections({ type: 'app_undo', message: '撤销：xxx' })).toEqual([])
    expect(getLogDetailSections({ type: 'app_undo', detail: {}, message: '撤销：xxx' })).toEqual([])
  })
})

describe('hasLogDetail', () => {
  it('is true only when a section other than raw exists', () => {
    expect(hasLogDetail({ type: 'app_undo', message: '撤销：xxx' })).toBe(false)
    expect(hasLogDetail({ type: 'app_undo', detail: {} })).toBe(false)
    expect(hasLogDetail({ type: 'inventory_delete', detail: { sid: 'JP-1', itemId: 'i1' } })).toBe(true)
    expect(hasLogDetail({ type: 'inventory_delete', detail: { sid: 'JP-1', itemId: 'i1', deletedItems: [] } })).toBe(true)
  })
})
