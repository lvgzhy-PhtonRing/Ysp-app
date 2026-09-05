import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  addFinanceRecord,
  addLoanRecord,
  deleteFinanceRecord,
  deleteLoanRecord,
  updateFinanceRecord,
  updateLoanRecord,
} from '../modules/finance/useFinance'
import { deleteItem, editItem, submitManualAdd } from '../modules/inventory/useInventory'
import { addPurchaseItem, deletePurchaseItem, moveToInventory, submitTransfer } from '../modules/purchase/usePurchase'
import { editSaleRecord, submitSell, unlistItem } from '../modules/sales/useSales'
import { addOperationLog, clearOperationLogs, clone, loadData, state as store } from './store'
import {
  LOG_DETAIL_CONTRACT,
  LOG_REPLAY_CAPABILITY,
  reconstructAtTime,
  validateLogDetail,
} from './logReplay'

function stubEnv() {
  vi.stubGlobal('localStorage', {
    getItem: vi.fn(() => null),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    clear: vi.fn(),
  })
  vi.stubGlobal('alert', vi.fn())
}

beforeEach(() => {
  stubEnv()
  loadData({})
  clearOperationLogs()
})

const captureState = () => ({
  items: clone(store.items),
  calc: clone(store.calc),
  financeRecords: clone(store.financeRecords),
  loanRecords: clone(store.loanRecords),
  transfers: clone(store.transfers),
})

describe('operation log detail contract', () => {
  it('full 能力类型都有契约要求，每条契约项都有能力分级', () => {
    Object.entries(LOG_REPLAY_CAPABILITY)
      .filter(([, cap]) => cap === 'full')
      .forEach(([type]) => {
        expect(LOG_DETAIL_CONTRACT[type], `full 类型 ${type} 缺少契约字段要求`).toEqual(expect.any(Array))
      })

    Object.keys(LOG_DETAIL_CONTRACT).forEach((type) => {
      expect(['full', 'partial'], `契约类型 ${type} 缺少回放能力分级`).toContain(LOG_REPLAY_CAPABILITY[type])
    })
  })

  it('业务链路产生的每条日志都满足回溯契约', () => {
    const a = addPurchaseItem({ name: '采购A', sid: 'JP-9001', category: '日淘', purchaseDetails: { preTransferCost: 600 } })
    const b = addPurchaseItem({ name: '采购B', sid: 'JP-9002', category: '日淘', purchaseDetails: { preTransferCost: 800 } })
    submitTransfer({ totalRMB: 300, transferBatch: 'T1' }, [a.id])
    submitTransfer({ totalRMB: 200, transferBatch: 'T2' }, [b.id])
    moveToInventory(a.id)
    editItem(a.id, { cost: 1234 })
    submitSell(a.id, { price: 2500, express: 50, date: '2026-09-01' })
    editSaleRecord(a.id, { price: 2600 })
    unlistItem(a.id, { reason: '测试下架' })

    const m = submitManualAdd({ name: '手动商品', cost: 90 })
    editItem(m.id, { cost: 129 })
    deleteItem(m.id)
    deletePurchaseItem(b.id)

    const r = addFinanceRecord({ type: 'expense', item: '买保护壳', amount: 50 })
    updateFinanceRecord(r.id, { amount: 66 })
    deleteFinanceRecord(r.id)

    const l = addLoanRecord({ type: 'in', item: '借车模', amount: 300 })
    updateLoanRecord(l.id, { amount: 250 })
    deleteLoanRecord(l.id)

    store.calc.debt = 1000
    addOperationLog('calc_update', '更新参数: 总负债 ¥1000→¥1500', { field: 'debt', before: 1000, after: 1500 })
    store.calc.debt = 1500

    const problems = []
    store.operationLogs.forEach((log) => {
      const { ok, missing } = validateLogDetail(log)
      if (!ok) problems.push(`${log.type} 缺少: ${missing.join(', ')}`)
    })

    expect(store.operationLogs.length).toBeGreaterThanOrEqual(18)
    expect(problems).toEqual([])
  })

  it('删除日志保留完整商品快照（含转运/销售字段）', () => {
    const a = addPurchaseItem({ name: '快照A', sid: 'JP-9101', purchaseDetails: { preTransferCost: 600 } })
    submitTransfer({ totalRMB: 120, transferBatch: 'T-SNAP' }, [a.id])
    moveToInventory(a.id)
    submitSell(a.id, { price: 2000, date: '2026-09-01' })

    const before = clone(a)
    deleteItem(a.id)

    const log = store.operationLogs[0]
    expect(log.type).toBe('inventory_delete')
    expect(log.detail.deletedItems).toHaveLength(1)

    const snap = log.detail.deletedItems[0]
    expect(JSON.stringify(snap)).toBe(JSON.stringify(before))
    expect(snap).not.toBe(a)
    expect(snap.status).toBe('sold')
    expect(snap.purchaseDetails.transferCost).toBeGreaterThan(0)
    expect(snap.saleDetails.price).toBe(2000)
    expect(snap.inStockDate).toBe(before.inStockDate)
  })

  it('同 SID 连续删除合并为一条日志且累加完整商品快照', () => {
    const a = addPurchaseItem({ name: '聚合A', sid: 'JP-9001', purchaseDetails: { preTransferCost: 100 } })
    const b = addPurchaseItem({ name: '聚合B', sid: 'JP-9001', purchaseDetails: { preTransferCost: 200 } })

    deletePurchaseItem(a.id)
    deletePurchaseItem(b.id)

    expect(store.operationLogs).toHaveLength(3)

    const log = store.operationLogs[0]
    expect(log.type).toBe('purchase_delete')
    expect(log.detail.deletedCount).toBe(2)
    expect(log.detail.deletedNames).toEqual(['聚合A', '聚合B'])
    expect(log.detail.deletedItemIds).toEqual([a.id, b.id])
    expect(log.detail.deletedItems).toHaveLength(2)
    expect(log.detail.deletedItems.map((x) => x.id)).toEqual([a.id, b.id])
    expect(validateLogDetail(log).ok).toBe(true)
  })
})

describe('reconstructAtTime 逆序回放', () => {
  it('回放所有日志可完整还原到操作前状态', () => {
    const baseline = captureState()

    const a = addPurchaseItem({ name: '回放A', sid: 'JP-9201', purchaseDetails: { preTransferCost: 600 } })
    const b = addPurchaseItem({ name: '回放B', sid: 'JP-9202', purchaseDetails: { preTransferCost: 800 } })
    submitTransfer({ totalRMB: 300, transferBatch: 'T1' }, [a.id])
    submitTransfer({ totalRMB: 200, transferBatch: 'T2' }, [b.id])
    moveToInventory(a.id)
    editItem(a.id, { cost: 1234 })
    submitSell(a.id, { price: 2500, express: 50, date: '2026-09-01' })
    editSaleRecord(a.id, { price: 2600 })
    unlistItem(a.id, { reason: '测试下架' })
    deletePurchaseItem(b.id)

    expect(store.operationLogs.length).toBeGreaterThanOrEqual(10)

    const { state: rebuilt, skipped, barriers } = reconstructAtTime(captureState(), store.operationLogs, null)

    expect(skipped).toEqual([])
    expect(barriers).toEqual([])
    expect(rebuilt).toEqual(baseline)
  })

  it('回放 calc_update 可还原到操作前参数', () => {
    const baseline = captureState()
    store.calc.debt = 1000
    addOperationLog('calc_update', '更新参数: 总负债 ¥1000→¥1500', { field: 'debt', before: 1000, after: 1500 })
    store.calc.debt = 1500

    const { state: rebuilt } = reconstructAtTime(captureState(), store.operationLogs, null)

    expect(rebuilt.calc.debt).toBe(1000)
    expect(baseline.calc.debt).toBe(0)
  })

  it('遇到状态替换类屏障即中止并记录', () => {
    const a = addPurchaseItem({ name: '屏障前', sid: 'JP-9301' })
    addOperationLog('app_undo', '撤销：某操作')
    deletePurchaseItem(a.id)

    const { state: rebuilt, barriers } = reconstructAtTime(captureState(), store.operationLogs, null)

    expect(barriers).toHaveLength(1)
    expect(barriers[0].type).toBe('app_undo')
    expect(store.items.find((x) => x.id === a.id)).toBeUndefined()
    expect(rebuilt.items.find((x) => x.id === a.id)).toBeTruthy()
  })

  it('云端下载覆盖本地的 cloud_sync 判定为屏障，纯同步不判定', () => {
    const a = addPurchaseItem({ name: '云端屏障', sid: 'JP-9601' })
    addOperationLog('cloud_sync', '用户选择使用云端数据', { cloudUpdatedAt: 'x', localUpdatedAt: 'y' })
    addOperationLog('cloud_sync', '内容一致，已对齐时间戳', { cloudUpdatedAt: 'x', localUpdatedAt: 'y' })
    deletePurchaseItem(a.id)

    const { state: rebuilt, barriers } = reconstructAtTime(captureState(), store.operationLogs, null)

    expect(barriers).toHaveLength(1)
    expect(barriers[0].message).toContain('使用云端数据')
    expect(rebuilt.items.find((x) => x.id === a.id)).toBeTruthy()
  })

  it('无逆操作类型的日志记入 skipped 而不中断回放', () => {
    const a = addPurchaseItem({ name: '跳过项', sid: 'JP-9401' })
    addOperationLog('market_price_update', '更新市价', { sid: 'JP-9401', name: '跳过项', price: 5000 })
    deletePurchaseItem(a.id)

    const { state: rebuilt, skipped, barriers } = reconstructAtTime(captureState(), store.operationLogs, null)

    expect(skipped).toHaveLength(1)
    expect(skipped[0].type).toBe('market_price_update')
    expect(barriers).toEqual([])
    // 跳过日志后仍继续回放后续 purchase_add，add + delete 净效果为商品不存在
    expect(rebuilt.items).toEqual([])
  })

  it('targetTime 仅回放该时间点之后的日志', () => {
    const current = {
      items: [
        { id: 'i1', sid: 'JP-9501', name: '早期', status: 'purchase' },
        { id: 'i2', sid: 'JP-9502', name: '晚期', status: 'purchase' },
      ],
      calc: {},
      financeRecords: [],
      loanRecords: [],
      transfers: [],
    }
    const logs = [
      { id: 1, type: 'purchase_add', time: '2026-09-01T00:00:00.000Z', message: '', detail: { itemId: 'i1', name: '早期' } },
      { id: 2, type: 'purchase_add', time: '2026-09-01T01:00:00.000Z', message: '', detail: { itemId: 'i2', name: '晚期' } },
    ]

    const at = reconstructAtTime(current, logs, '2026-09-01T00:30:00.000Z')
    expect(at.state.items.map((x) => x.id)).toEqual(['i1'])

    const all = reconstructAtTime(current, logs, null)
    expect(all.state.items).toEqual([])
  })
})
