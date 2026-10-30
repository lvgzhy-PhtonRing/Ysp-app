// store.js 单元测试：验证 loadData -> exportData 数据无损

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import sampleData from '../__tests__/fixtures/sampleData.json'
import { ADOPT_STORAGE_KEY } from './adoptLog'
import { getUnconfirmedSalesTotal } from '../modules/sales/saleAccounting'
import {
  addOperationLog,
  clearOperationLogs,
  computeConflictDiff,
  exportData,
  getUnsyncedOperations,
  hiddenSync,
  isContentEqual,
  loadData,
  loadUiStateFromLocalStorage,
  markCloudConnected,
  performSyncDecision,
  registerCloudApplyHandler,
  registerCloudConflictHandler,
  registerCloudSyncHandler,
  registerWritePermissionChecker,
  redoLastChange,
  runCloudSyncCheck,
  runPullSync,
  saveToLocalStorage,
  saveTaxpayerProfile,
  saveUiStateToLocalStorage,
  stableSerialize,
  state,
  syncToCloudNow,
  undoLastChange,
  unloadSync,
} from './store'

describe('data store', () => {
  beforeEach(() => {
    loadData({})
  })

  it('should keep data lossless from loadData to exportData', () => {
    loadData(sampleData)
    const output = exportData()

    expect(output.items.length).toBe(sampleData.items.length)
    expect(output.items.length).toBe(sampleData.items.length)

    output.items.forEach((item, index) => {
      expect(item.id).toEqual(sampleData.items[index].id)
      expect(item.sid).toEqual(sampleData.items[index].sid)
      expect(item.cost).toEqual(sampleData.items[index].cost)
    })

    expect(output.finance.records.length).toBe(sampleData.finance.records.length)
    expect(output.transfers.length).toBe(sampleData.transfers.length)
  })

  it('exportData 携带 _rev，loadData 恢复 _rev', () => {
    loadData({ items: [{ id: 1 }], _rev: { items: { rev: 3, at: 't' } } })
    expect(exportData()._rev).toEqual({ items: { rev: 3, at: 't' } })
  })

  it('saveToLocalStorage 改动槽位则 bump 对应 rev，未动槽位不变', () => {
    const storeMap = new Map()
    vi.stubGlobal('localStorage', {
      getItem: (k) => (storeMap.has(k) ? storeMap.get(k) : null),
      setItem: (k, v) => storeMap.set(k, String(v)),
      removeItem: (k) => storeMap.delete(k),
    })
    loadData({ items: [{ id: 1, name: 'a' }] })
    saveToLocalStorage() // 建立持久化基线，不应 bump（无 ._rev 基线 = {}）
    expect(exportData()._rev).toEqual({})
    loadData({ items: [{ id: 1, name: 'b' }] }) // items 变了
    saveToLocalStorage()
    const rev = exportData()._rev
    expect(rev.items.rev).toBe(1)
    expect(rev.calc).toBeUndefined() // calc 未变
    // 再次保存相同内容 → 不再 bump
    const before = rev.items.rev
    saveToLocalStorage()
    expect(exportData()._rev.items.rev).toBe(before)
    vi.unstubAllGlobals()
  })
})

describe('read-only tab persistence guard', () => {
  afterEach(() => {
    registerWritePermissionChecker(null)
    vi.unstubAllGlobals()
  })

  it('cannot save business data or UI state without the editor lock', async () => {
    const values = new Map()
    vi.stubGlobal('localStorage', {
      getItem: (key) => values.get(key) || null,
      setItem: (key, value) => values.set(key, value),
      removeItem: (key) => values.delete(key),
    })
    registerWritePermissionChecker(() => false)
    loadData({ items: [{ id: 'read-only' }] })
    expect(saveToLocalStorage()).toBe(false)
    saveUiStateToLocalStorage()
    expect(values.size).toBe(0)
    expect(await syncToCloudNow()).toBeNull()
  })
})

describe('Owner snapshots and local UI preference', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-22T10:00:00.000Z'))
    loadData({})
    state.snapshots.splice(0)
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {}, removeItem: () => {} })
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('writes Papa, Payton and merged metrics into the daily snapshot', () => {
    loadData({
      items: [
        { id: 'p1', owner: 'papa', status: 'inventory', cost: 100 },
        { id: 'y1', owner: 'payton', status: 'inventory', cost: 10 },
        { id: 'y2', owner: 'payton', status: 'sold', cost: 5, saleDetails: { profit: 2 } },
      ],
      calc: { debt: 20, unconfirmed: 0 }, finance: { records: [], loans: [] },
      ownerRegistry: { papa: {}, payton: { pocketBalance: 30, investBalance: 40, loans: [{ status: 'active', remaining: 10 }] } },
    })
    saveToLocalStorage()
    const snapshot = state.snapshots.find((entry) => entry.date === '2026-10-22')
    expect(snapshot).toMatchObject({
      inventory: { value: 100, count: 1 },
      payton: { carValue: 10, carCount: 1, pocketBalance: 30, investBalance: 40, loanRemaining: 10, fund: 60, soldProfit: 2 },
      merged: { inventoryValue: 100, carValue: 10 },
    })
  })

  it('records the calculated pending sales total instead of stale manual input', () => {
    loadData({
      items: [
        { id: 'papa-pending', owner: 'papa', status: 'sold', saleDetails: { price: 100, feeRate: 0.01, isConfirmed: false } },
        { id: 'payton-pending', owner: 'payton', status: 'sold', saleDetails: { price: 50, isConfirmed: false } },
        { id: 'confirmed', owner: 'papa', status: 'sold', saleDetails: { price: 500, isConfirmed: true } },
      ],
      calc: { unconfirmed: 999 },
    })
    saveToLocalStorage()

    const snapshot = state.snapshots.find((entry) => entry.date === '2026-10-22')
    expect(snapshot.calc.unconfirmed).toBe(149)
    expect(snapshot.merged.alipayBalance).toBe(-149)
  })

  it('round-trips pending confirmation and pre-sale state through JSON export and load', () => {
    const pendingSale = {
      id: 'pending-payton', owner: 'payton', status: 'sold', stock: 0, cost: 20,
      saleDetails: { price: 100, express: 8, feeRate: 0.01, deduction: 0, shop: 'PhtonRIng', isConfirmed: false, entryDate: '', beforeSaleState: { status: 'inventory', stock: 3 } },
    }
    loadData({ items: [pendingSale], ownerRegistry: { papa: {}, payton: { pocketBalance: 0, investBalance: 91, loans: [] } } })
    const jsonBackup = JSON.parse(JSON.stringify(exportData()))
    loadData(jsonBackup)

    expect(state.items[0].saleDetails).toEqual(pendingSale.saleDetails)
    expect(state.items[0].saleDetails.beforeSaleState).toEqual({ status: 'inventory', stock: 3 })
    expect(getUnconfirmedSalesTotal(state.items)).toBe(99)
  })

  it('round-trips confirmed Papa entry date without replacing it with the order date', () => {
    const confirmedSale = {
      id: 'confirmed-papa', owner: 'papa', status: 'sold', cost: 50,
      saleDetails: { date: '2026-09-30', entryDate: '2026-10-15', isConfirmed: true, price: 100 },
    }
    loadData({ items: [confirmedSale] })
    const jsonBackup = JSON.parse(JSON.stringify(exportData()))
    loadData(jsonBackup)

    expect(state.items[0].saleDetails.isConfirmed).toBe(true)
    expect(state.items[0].saleDetails.entryDate).toBe('2026-10-15')
    expect(getUnconfirmedSalesTotal(state.items)).toBe(0)
  })

  it('reconciles the pending BMW sale into its existing snapshot row without duplication', () => {
    loadData({
      items: [{ id: 'bmw', sid: '55aeffc4-b720-483f-b85e-1d85067f0189', owner: 'payton', status: 'sold', cost: 10, saleDetails: { date: '2026-10-19', price: 15, profit: 5 } }],
      snapshots: [{ date: '2026-10-21', createdAt: '2026-10-21T10:00:00Z', calc: { debt: 20 }, inventory: { value: 100, count: 1 } }],
      ownerRegistry: { papa: {}, payton: { pocketBalance: -290.96, investBalance: 366.54, loans: [{ status: 'active', remaining: 4000 }], snapshotReconcile: { date: '2026-10-21', pendingSaleSid: '55aeffc4-b720-483f-b85e-1d85067f0189' } } },
    })
    saveToLocalStorage()
    expect(state.snapshots.filter((entry) => entry.date === '2026-10-21')).toHaveLength(1)
    expect(state.snapshots.find((entry) => entry.date === '2026-10-21').payton.carValue).toBe(0)
    expect(state.ownerRegistry.payton.snapshotReconcile).toBeNull()
  })

  it('persists currentOwner only in ysp_ui', () => {
    const values = new Map()
    vi.stubGlobal('localStorage', { getItem: (key) => values.get(key) || null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) })
    state.currentOwner = 'payton'
    saveUiStateToLocalStorage()
    expect(JSON.parse(values.get('ysp_ui')).currentOwner).toBe('payton')
    expect(exportData().currentOwner).toBeUndefined()
    state.currentOwner = 'papa'
    loadUiStateFromLocalStorage()
    expect(state.currentOwner).toBe('payton')
  })

  it('adds the active Owner to new business operation-log detail', () => {
    state.currentOwner = 'payton'
    addOperationLog('inventory_edit', '编辑 Payton 商品', { sid: 'S-1' })
    expect(state.operationLogs[0].detail).toMatchObject({ owner: 'payton', sid: 'S-1' })
  })

  it('undo and redo restore Payton account, loan and item ownership as one payload', () => {
    loadData({
      items: [{ id: 'car', owner: 'payton', status: 'inventory', cost: 10 }],
      ownerRegistry: { papa: {}, payton: { pocketBalance: 1, investBalance: 20, loans: [{ id: 'loan', status: 'active', remaining: 5 }], accountTransfers: [] } },
    })
    saveToLocalStorage()
    state.ownerRegistry.payton.investBalance += 15
    state.ownerRegistry.payton.loans[0].remaining += 15
    state.items[0].status = 'sold'
    state.items[0].saleDetails = { date: '2026-10-19', price: 25 }
    saveToLocalStorage()
    expect(state.ownerRegistry.payton.investBalance).toBe(35)
    expect(undoLastChange()).toBeTruthy()
    expect(state.ownerRegistry.payton).toMatchObject({ investBalance: 20, loans: [{ remaining: 5 }] })
    expect(state.items[0].status).toBe('inventory')
    expect(redoLastChange()).toBeTruthy()
    expect(state.ownerRegistry.payton.investBalance).toBe(35)
    expect(state.items[0].status).toBe('sold')
  })
})

describe('批次名历史更名迁移', () => {
  it('loadData 把旧批次名改写为新名，其余字段不变', () => {
    loadData({ items: [{ id: 1, name: 'a', category: '国内', batch: '苏州GTSHOW', cost: 100 }] })
    expect(exportData().items).toEqual([
      { id: 1, name: 'a', category: '国内', batch: '2026苏州', cost: 100, owner: 'papa' },
    ])
  })

  it('旧名匹配大小写与首尾空格不敏感，新名与无关批次名原样保留', () => {
    loadData({
      items: [
        { id: 1, batch: ' 苏州GTShow ' },
        { id: 2, batch: '2026苏州' },
        { id: 3, batch: '2026HK香港' },
        { id: 4 },
      ],
    })
    expect(exportData().items.map((i) => i.batch)).toEqual([
      '2026苏州',
      '2026苏州',
      '2026HK香港',
      undefined,
    ])
  })

  it('纯更名不触发冲突：本地新名与云端旧名视为内容一致', () => {
    const local = { items: [{ id: 1, name: 'a', category: '国内', batch: '2026苏州' }] }
    const cloud = { items: [{ id: 1, name: 'a', category: '国内', batch: '苏州GTSHOW' }] }
    expect(isContentEqual(local, cloud)).toBe(true)
    expect(computeConflictDiff(local, cloud).total).toBe(0)
  })
})

describe('stableSerialize', () => {
  it('should treat objects with different key order as equal', () => {
    const a = { items: [{ name: 'x', cost: 1 }], calc: { debt: 1, wechat: 2 } }
    const b = { calc: { wechat: 2, debt: 1 }, items: [{ cost: 1, name: 'x' }] }
    expect(stableSerialize(a)).toBe(stableSerialize(b))
  })

  it('should distinguish array order', () => {
    expect(stableSerialize([1, 2])).not.toBe(stableSerialize([2, 1]))
  })
})

describe('isContentEqual', () => {
  const base = {
    items: [{ id: 1, sid: 'JP-1', name: '索尼镜头', cost: 1200, status: 'inventory' }],
    calc: { debt: 0, wechat: 0 },
    finance: { records: [{ id: 10, item: '餐费', amount: 50 }], loans: [] },
    transfers: [],
    rushcar: { entries: [], forwarderInfos: [], mattelSiteInfos: [], paymentCards: [] },
  }

  it('should be true when content is identical but key order differs', () => {
    const other = {
      finance: { loans: [], records: [{ amount: 50, item: '餐费', id: 10 }] },
      calc: { wechat: 0, debt: 0 },
      rushcar: { paymentCards: [], mattelSiteInfos: [], forwarderInfos: [], entries: [] },
      transfers: [],
      items: [{ status: 'inventory', cost: 1200, name: '索尼镜头', sid: 'JP-1', id: 1 }],
    }
    expect(isContentEqual(base, other)).toBe(true)
  })

  it('should be true when only updatedAt / version / snapshots differ', () => {
    const newer = {
      ...base,
      version: '9.9.9',
      updatedAt: '2026-08-26T10:00:00.000Z',
      snapshots: [{ date: '2026-08-26', createdAt: 'x', profit: { totalActualProfit: 1 } }],
    }
    expect(isContentEqual(base, newer)).toBe(true)
  })

  it('should be false when an item field differs', () => {
    const changed = { ...base, items: [{ ...base.items[0], cost: 1300 }] }
    expect(isContentEqual(base, changed)).toBe(false)
  })

  it('should be false when an entry is added', () => {
    const added = { ...base, items: [...base.items, { id: 2, name: '新商品' }] }
    expect(isContentEqual(base, added)).toBe(false)
  })
})

describe('computeConflictDiff', () => {
  const local = {
    items: [
      { id: 1, sid: 'JP-1', name: '索尼镜头', cost: 1200, status: 'inventory' },
      { id: 2, sid: 'JP-2', name: '本地独有商品', cost: 100 },
    ],
    calc: { debt: 0, wechat: 0 },
    finance: { records: [], loans: [] },
    transfers: [],
    rushcar: { entries: [], forwarderInfos: [], mattelSiteInfos: [], paymentCards: [] },
  }
  const cloud = {
    items: [
      { id: 1, sid: 'JP-1', name: '索尼镜头', cost: 1200, status: 'sold' },
      { id: 3, sid: 'JP-3', name: '云端独有商品', cost: 200 },
    ],
    calc: { debt: 0, wechat: 0 },
    finance: { records: [], loans: [] },
    transfers: [],
    rushcar: { entries: [], forwarderInfos: [], mattelSiteInfos: [], paymentCards: [] },
  }

  it('should detect modified, localOnly and cloudOnly entries', () => {
    const { entries, total } = computeConflictDiff(local, cloud)
    expect(total).toBe(3)

    const modified = entries.find((e) => e.kind === 'modified')
    expect(modified.collectionLabel).toBe('商品')
    expect(modified.recordLabel).toContain('索尼镜头')
    expect(modified.recordLabel).toContain('JP-1')
    expect(modified.summary).toContain('状态')

    expect(entries.some((e) => e.kind === 'localOnly' && e.recordLabel.includes('本地独有商品'))).toBe(true)
    expect(entries.some((e) => e.kind === 'cloudOnly' && e.recordLabel.includes('云端独有商品'))).toBe(true)
  })

  it('should keep total complete beyond the display limit of 5', () => {
    const manyLocal = { ...local, items: Array.from({ length: 8 }, (_, i) => ({ id: 100 + i, name: `商品${i}` })) }
    const emptyCloud = { ...cloud, items: [] }
    const { entries, total } = computeConflictDiff(manyLocal, emptyCloud)
    expect(total).toBe(8)
    expect(entries.length).toBe(8)
    expect(entries.slice(0, 5).length).toBe(5)
    expect(total - 5).toBe(3)
  })

  it('should not report calc difference (derived data, auto-follows source slots)', () => {
    const diffLocal = { ...local, calc: { debt: 100, wechat: 0 } }
    const diffCloud = { ...cloud, calc: { debt: 50, wechat: 0 } }
    const { entries } = computeConflictDiff(diffLocal, diffCloud)
    const calc = entries.find((e) => e.key === 'calc')
    expect(calc).toBeUndefined()
  })

  it('shows financial and Owner fields when the conflict menu requests object slots', () => {
    const { entries } = computeConflictDiff(
      { calc: { debt: 120.5 }, ownerRegistry: { payton: { pocketBalance: -290.96 } } },
      { calc: { debt: 100.25 }, ownerRegistry: { payton: { pocketBalance: -305.96 } } },
      { includeObjectSlots: true },
    )
    expect(entries).toEqual(expect.arrayContaining([
      expect.objectContaining({ collectionLabel: '财务结算', fieldName: '总负债', cloudValue: '¥100.25', localValue: '¥120.50' }),
      expect.objectContaining({ collectionLabel: 'Owner 资金', fieldName: 'Payton · 零钱余额', cloudValue: '-¥305.96', localValue: '-¥290.96' }),
    ]))
  })

  it('translates sale status and makes changed prices obvious without truncating names', () => {
    const longName = 'AMERICAN CLASSICS 1971 PLYMOUTH GTX 限量收藏版'
    const { entries } = computeConflictDiff(
      { items: [{ id: 1, name: longName, status: 'sold', cost: 100.51, saleDetails: { price: 200.75 } }] },
      { items: [{ id: 1, name: longName, status: 'inventory', cost: 90.01, saleDetails: { price: 180.25 } }] },
    )
    expect(entries.find((entry) => entry.fieldName === '状态')).toMatchObject({ cloudValue: '库存', localValue: '已出售' })
    expect(entries.find((entry) => entry.fieldName === '成本')).toMatchObject({ cloudValue: '¥90.01', localValue: '¥100.51', deltaLabel: '+¥10.50' })
    expect(entries.find((entry) => entry.fieldName === '售价')).toMatchObject({ cloudValue: '¥180.25', localValue: '¥200.75', deltaLabel: '+¥20.50' })
    expect(entries.every((entry) => entry.recordLabel.includes(longName))).toBe(true)
  })

  it('keeps zero and numeric-string prices distinct from missing values', () => {
    const { entries } = computeConflictDiff(
      { items: [{ id: 1, cost: '0.00' }] },
      { items: [{ id: 1, cost: '10.25' }] },
    )
    expect(entries.find((entry) => entry.fieldName === '成本')).toMatchObject({ cloudValue: '¥10.25', localValue: '¥0.00', deltaLabel: '-¥10.25' })
  })

  it('does not show missing default-zero financial fields as real differences', () => {
    const local = { calc: { debt: 120.5, publicExp: 0, unconfirmed: 0 } }
    const cloud = { calc: { debt: 100.25 } }
    const { entries } = computeConflictDiff(local, cloud, { includeObjectSlots: true })
    expect(entries.filter((entry) => entry.collectionLabel === '财务结算').map((entry) => entry.fieldName)).toEqual(['总负债'])
  })

  it('identifies a changed market price as market price instead of sale price', () => {
    const local = { items: [{ id: 1, name: '汽车', marketPrices: [{ price: 120.5, timestamp: '2026-10-23' }] }] }
    const cloud = { items: [{ id: 1, name: '汽车', marketPrices: [{ price: 100.25, timestamp: '2026-10-23' }] }] }
    const { entries } = computeConflictDiff(local, cloud)
    expect(entries).toEqual([expect.objectContaining({ fieldName: '市场价格', cloudValue: '¥100.25', localValue: '¥120.50', deltaLabel: '+¥20.25' })])
  })

  it('should return empty when payloads are content-equal', () => {
    const { entries, total } = computeConflictDiff(local, local)
    expect(total).toBe(0)
    expect(entries).toEqual([])
  })
})

describe('autoBackup 持久化', () => {
  it('保存并恢复 lastDate / lastNotice', () => {
    const storeMap = new Map()
    vi.stubGlobal('localStorage', {
      getItem: (k) => (storeMap.has(k) ? storeMap.get(k) : null),
      setItem: (k, v) => storeMap.set(k, String(v)),
      removeItem: (k) => storeMap.delete(k),
    })

    state.autoBackup.lastDate = '2026-08-31'
    state.autoBackup.lastNotice = '2026-08-31'
    saveUiStateToLocalStorage()
    state.autoBackup.lastDate = ''
    state.autoBackup.lastNotice = ''
    loadUiStateFromLocalStorage()

    expect(state.autoBackup.lastDate).toBe('2026-08-31')
    expect(state.autoBackup.lastNotice).toBe('2026-08-31')
    vi.unstubAllGlobals()
  })
})

describe('cloudRev 持久化', () => {
  it('cloudRev 随 cloudStatus 持久化与恢复', () => {
    const storeMap = new Map()
    vi.stubGlobal('localStorage', {
      getItem: (k) => (storeMap.has(k) ? storeMap.get(k) : null),
      setItem: (k, v) => storeMap.set(k, String(v)),
      removeItem: (k) => storeMap.delete(k),
    })
    state.cloudStatus.cloudRev = { items: 3, calc: 1 }
    saveUiStateToLocalStorage()
    state.cloudStatus.cloudRev = {}
    loadUiStateFromLocalStorage()
    expect(state.cloudStatus.cloudRev).toEqual({ items: 3, calc: 1 })
    vi.unstubAllGlobals()
  })
})

describe('手动同步(force) 智能比对', () => {
  const FULL_CALC = { debt: 0, wechat: 0, publicExp: 0, unconfirmed: 0, fund: 0, forwarderBalance: 0, watchBalance: 0 }
  const CLOUD_PAYLOAD = {
    items: [{ id: 1, sid: 'JP-1', name: '云端商品', cost: 100, status: 'inventory' }],
    calc: { debt: 0, wechat: 0 },
    finance: { records: [], loans: [] },
    transfers: [],
    rushcar: { entries: [], forwarderInfos: [], mattelSiteInfos: [], paymentCards: [] },
  }
  const CLOUD_UPDATED_AT = '2026-09-02T10:00:00.000Z'

  function makeSyncHandler(env) {
    return async (payload, options = {}) => {
      env.calls.push({ reason: options.reason || '', expectedRevision: options.expectedRevision, payload: payload ? JSON.parse(JSON.stringify(payload)) : payload })
      if ((options.reason || '') === 'pre-check') {
        return { updatedAt: env.cloudUpdatedAt || CLOUD_UPDATED_AT, row: env.cloudRow ?? null, payload: env.cloudPayload, revision: env.cloudRow ? (env.revision ?? 0) : null }
      }
      return { updatedAt: env.cloudUpdatedAt || CLOUD_UPDATED_AT, row: { id: 'main' }, payload, revision: (env.revision ?? 0) + 1 }
    }
  }

  function setupCloudEnv({ cloudPayload = CLOUD_PAYLOAD, cloudRow = { id: 'main' } } = {}) {
    const env = { calls: [], cloudPayload, cloudRow, cloudUpdatedAt: CLOUD_UPDATED_AT }
    const storeMap = new Map()
    vi.stubGlobal('localStorage', {
      getItem: (k) => (storeMap.has(k) ? storeMap.get(k) : null),
      setItem: (k, v) => storeMap.set(k, String(v)),
      removeItem: (k) => storeMap.delete(k),
    })
    Object.assign(state.cloudSettings, {
      supabaseUrl: 'https://x.supabase.co',
      supabaseAnonKey: 'anon-key',
      stateId: 'main',
      enabled: true,
      publicRead: true,
    })
    registerCloudSyncHandler(makeSyncHandler(env))
    return env
  }

  afterEach(() => {
    registerCloudSyncHandler(null)
    registerCloudConflictHandler(null)
    registerCloudApplyHandler(null)
    Object.assign(state.cloudSettings, {
      supabaseUrl: '',
      supabaseAnonKey: '',
      stateId: 'main',
      enabled: false,
      publicRead: true,
    })
    vi.unstubAllGlobals()
    loadData({})
  })

  it('云端有更全数据且与本地不同时，必须先走冲突确认，不得静默上传覆盖', async () => {
    loadData({})
    const env = setupCloudEnv()
    let conflictType = ''
    registerCloudConflictHandler(async (type, data) => {
      conflictType = type
      return null // null = 用户取消，整轮跳过
    })

    await syncToCloudNow()

    // 只发生了一次 pre-check(只读)，绝无第二次上传调用
    expect(env.calls.map((c) => c.reason)).toEqual(['pre-check'])
    expect(conflictType).toBe('slot-conflict')
    expect(state.items.length).toBe(0) // 本地保持未被云端覆盖
  })

  it('云端为空(首次使用)时，手动同步应上传本地完成初始化', async () => {
    loadData({ items: [{ id: 1, name: '本地商品', cost: 5 }] })
    const env = setupCloudEnv({ cloudPayload: null, cloudRow: null })
    let conflictCalled = false
    registerCloudConflictHandler(async () => {
      conflictCalled = true
      return null
    })

    await syncToCloudNow()

    expect(env.calls.map((c) => c.reason)).toEqual(['pre-check', 'manual'])
    expect(env.calls[1].expectedRevision).toBeNull()
    expect(conflictCalled).toBe(false)
    expect(state.items.length).toBe(1)
  })

  it('云端抢先写入后重读并合并不同槽位，本地在抢写失败前保持原值', async () => {
    const env = setupCloudEnv()
    const base = {
      ...CLOUD_PAYLOAD,
      items: [{ id: 1, name: 'cloud-old' }],
      finance: { records: [], loans: [] },
      _rev: { items: { rev: 1, at: '' }, 'finance.records': { rev: 1, at: '' } },
    }
    const newer = {
      ...base,
      finance: { records: [{ id: 9, item: 'cloud-new' }], loans: [] },
      _rev: { ...base._rev, 'finance.records': { rev: 2, at: '' } },
    }
    loadData({ ...base, items: [{ id: 1, name: 'local-new' }], _rev: { ...base._rev, items: { rev: 2, at: '' } } })
    state.cloudStatus.cloudRev = { items: 1, 'finance.records': 1 }
    let revision = 7
    let attempts = 0
    registerCloudSyncHandler(async (payload, options = {}) => {
      env.calls.push({ reason: options.reason, expectedRevision: options.expectedRevision, payload })
      if (options.reason === 'pre-check') {
        return { row: { id: 'main' }, payload: revision === 7 ? base : newer, revision, updatedAt: CLOUD_UPDATED_AT }
      }
      attempts++
      if (attempts === 1) {
        expect(state.items[0].name).toBe('local-new')
        revision = 8
        const error = new Error('collision')
        error.code = 'CLOUD_REVISION_CONFLICT'
        throw error
      }
      return { row: { id: 'main' }, payload, revision: 9, updatedAt: CLOUD_UPDATED_AT }
    })
    registerCloudApplyHandler((payload, options) => { if (options.validateOnly) return true; loadData(payload); saveToLocalStorage({ bumpTimestamp: false }); return true })
    const result = await runCloudSyncCheck()
    expect(result).toBeTruthy()
    expect(env.calls.filter((call) => call.reason === 'pre-check')).toHaveLength(2)
    expect(env.calls.filter((call) => call.reason === 'sync').map((call) => call.expectedRevision)).toEqual([7, 8])
    expect(env.calls.at(-1).payload.finance.records[0].item).toBe('cloud-new')
    expect(state.items[0].name).toBe('local-new')
    expect(state.financeRecords[0].item).toBe('cloud-new')
  })

  it('同步请求期间本页再次编辑时保留新编辑并重新核对', async () => {
    const env = setupCloudEnv()
    const base = { ...CLOUD_PAYLOAD, items: [{ id: 1, name: 'cloud' }], _rev: { items: { rev: 1, at: '' } } }
    loadData({ ...base, items: [{ id: 1, name: 'first-edit' }], _rev: { items: { rev: 2, at: '' } } })
    state.cloudStatus.cloudRev = { items: 1 }
    let cloud = base
    let revision = 7
    let writes = 0
    registerCloudSyncHandler(async (payload, options = {}) => {
      if (options.reason === 'pre-check') return { row: { id: 'main' }, payload: cloud, revision, updatedAt: CLOUD_UPDATED_AT }
      writes++
      if (writes === 1) {
        state.items[0].name = 'second-edit'
        saveToLocalStorage()
      }
      cloud = JSON.parse(JSON.stringify(payload))
      revision++
      return { row: { id: 'main' }, payload: cloud, revision, updatedAt: CLOUD_UPDATED_AT }
    })
    registerCloudConflictHandler(async () => ({ decisions: { items: 'local' }, copies: [] }))
    registerCloudApplyHandler((payload, options) => { if (options.validateOnly) return true; loadData(payload); saveToLocalStorage({ bumpTimestamp: false }); return true })
    await runCloudSyncCheck()
    expect(state.items[0].name).toBe('second-edit')
    expect(cloud.items[0].name).toBe('second-edit')
    expect(writes).toBe(2)
  })

  it('云端预检期间本页再次编辑时先重读，不按旧内容对齐', async () => {
    const base = { ...CLOUD_PAYLOAD, items: [{ id: 1, name: 'same' }], _rev: { items: { rev: 1, at: '' } } }
    loadData(base)
    const env = setupCloudEnv({ cloudPayload: base })
    state.cloudStatus.cloudRev = { items: 1 }
    let checks = 0
    registerCloudSyncHandler(async (payload, options = {}) => {
      env.calls.push({ reason: options.reason, expectedRevision: options.expectedRevision, payload })
      if (options.reason === 'pre-check') {
        if (++checks === 1) { state.items[0].name = 'new-edit'; saveToLocalStorage() }
        return { row: { id: 'main' }, payload: base, revision: 3, updatedAt: CLOUD_UPDATED_AT }
      }
      return { row: { id: 'main' }, payload, revision: 4, updatedAt: CLOUD_UPDATED_AT }
    })
    await runCloudSyncCheck()
    expect(checks).toBe(2)
    expect(env.calls.find((call) => call.reason === 'sync')?.payload.items[0].name).toBe('new-edit')
  })

  it('内容相同时将本地较低修订号对齐云端，后续本地编辑不误报双边冲突', async () => {
    const local = { ...CLOUD_PAYLOAD, _rev: { items: { rev: 2, at: '' } } }
    const cloud = { ...CLOUD_PAYLOAD, _rev: { items: { rev: 5, at: '' } } }
    loadData(local)
    const env = setupCloudEnv({ cloudPayload: cloud })
    state.cloudStatus.cloudRev = { items: 2 }
    await runCloudSyncCheck()
    expect(exportData()._rev.items.rev).toBe(5)
    expect(state.cloudStatus.cloudRev.items).toBe(5)
    state.items[0].name = 'edit-after-align'
    saveToLocalStorage()
    let conflicts = 0
    registerCloudConflictHandler(async () => { conflicts++; return null })
    await runCloudSyncCheck()
    expect(conflicts).toBe(0)
    expect(env.calls.some((call) => call.reason === 'sync')).toBe(true)
  })

  it('选择采纳云端期间云端再次变化时重新展示最新差异', async () => {
    loadData({ ...CLOUD_PAYLOAD, items: [{ id: 1, name: 'local' }], _rev: { items: { rev: 2, at: '' } } })
    const env = setupCloudEnv()
    state.cloudStatus.cloudRev = { items: 1 }
    let revision = 5
    let remoteName = 'cloud-old'
    let choices = 0
    registerCloudSyncHandler(async (payload, options = {}) => {
      env.calls.push({ reason: options.reason, expectedRevision: options.expectedRevision })
      if (options.reason === 'pre-check') {
        return {
          row: { id: 'main' }, revision, updatedAt: CLOUD_UPDATED_AT,
          payload: { ...CLOUD_PAYLOAD, items: [{ id: 1, name: remoteName }], _rev: { items: { rev: revision, at: '' } } },
        }
      }
      return { row: { id: 'main' }, payload, revision: revision + 1, updatedAt: CLOUD_UPDATED_AT }
    })
    registerCloudConflictHandler(async () => {
      if (++choices === 1) { revision = 6; remoteName = 'cloud-new' }
      return { decisions: { items: 'cloud' }, copies: [] }
    })
    registerCloudApplyHandler((payload, options) => { if (options.validateOnly) return true; loadData(payload); return true })
    await runCloudSyncCheck()
    expect(choices).toBe(2)
    expect(state.items[0].name).toBe('cloud-new')
    expect(env.calls.filter((call) => call.reason === 'sync')).toHaveLength(0)
  })

  it('云端较新且不同、用户选择 use-cloud 时，应用云端数据覆盖本地', async () => {
    loadData({})
    const env = setupCloudEnv()
    registerCloudConflictHandler(async (type, data) => ({
      decisions: Object.fromEntries(
        Object.keys(data.plan)
          .filter((s) => data.plan[s] === 'adopt-cloud' || data.plan[s] === 'conflict')
          .map((s) => [s, 'cloud']),
      ),
      copies: [],
    }))

    await syncToCloudNow()

    expect(env.calls.map((c) => c.reason)).toEqual(['pre-check', 'sync'])
    expect(state.items).toEqual(CLOUD_PAYLOAD.items.map((item) => ({ ...item, owner: 'papa' })))
  })

  it('内容一致对齐时间戳后不触发新的同步调度（防死循环）', async () => {
    vi.useFakeTimers()
    loadData(CLOUD_PAYLOAD)
    const env = setupCloudEnv()

    await runCloudSyncCheck()

    const callsBefore = env.calls.length
    expect(callsBefore).toBeGreaterThan(0)
    vi.advanceTimersByTime(9000)
    expect(env.calls.length).toBe(callsBefore)
    vi.useRealTimers()
  })

  it('双方都改 items → 弹窗仅列 conflict 槽，用户选云端则采纳该槽', async () => {
    loadData({
      items: [{ id: 1, name: 'local' }],
      calc: {},
      _rev: { items: { rev: 2, at: '' }, calc: { rev: 1, at: '' } },
    })
    const env = setupCloudEnv({
      cloudPayload: {
        ...CLOUD_PAYLOAD,
        items: [{ id: 1, sid: 'JP-1', name: 'cloud', cost: 100, status: 'inventory' }],
        _rev: { items: { rev: 5, at: '' } },
      },
    })
    state.cloudStatus.cloudRev = { items: 1 }
    let conflictSlots = null
    registerCloudConflictHandler(async (type, data) => {
      conflictSlots = Object.keys(data.plan).filter((s) => data.plan[s] === 'conflict')
      return { decisions: { items: 'cloud' }, copies: [] }
    })

    await runCloudSyncCheck()

    expect(conflictSlots).toEqual(['items'])
    expect(state.items[0].name).toBe('cloud')
    const upload = env.calls.find((c) => c.reason === 'sync')?.payload
    expect(upload.items[0].name).toBe('cloud')
    expect(state.cloudStatus.cloudRev.items).toBe(5)
  })

  it('silent 遇 adopt/conflict 槽 → 整轮跳过不上传', async () => {
    loadData({ items: [{ id: 1, name: 'local' }], _rev: { items: { rev: 2, at: '' } } })
    const env = setupCloudEnv({
      cloudPayload: {
        ...CLOUD_PAYLOAD,
        items: [{ id: 1, sid: 'JP-1', name: 'cloud', cost: 100, status: 'inventory' }],
        _rev: { items: { rev: 5, at: '' } },
      },
    })
    state.cloudStatus.cloudRev = { items: 1 }
    await performSyncDecision?.({ reason: 'debounced', silent: true })
    expect(env.calls.filter((c) => c.reason !== 'pre-check')).toHaveLength(0)
  })

  it('markCloudConnected 置 connected 为 true 并清除 lastCloudLoadError', () => {
    const storeMap = new Map()
    vi.stubGlobal('localStorage', {
      getItem: (k) => (storeMap.has(k) ? storeMap.get(k) : null),
      setItem: (k, v) => storeMap.set(k, String(v)),
      removeItem: (k) => storeMap.delete(k),
    })
    state.cloudStatus.connected = false
    state.cloudStatus.lastCloudLoadError = '用户已拒绝云端数据覆盖'

    markCloudConnected()

    expect(state.cloudStatus.connected).toBe(true)
    expect(state.cloudStatus.lastCloudLoadError).toBe('')
  })

  it('云端为空初始化上传成功后建立 cloudRev 基线（M12）', async () => {
    loadData({ items: [{ id: 1, name: '本地商品', cost: 5 }], _rev: { items: { rev: 4, at: '' } } })
    const env = setupCloudEnv({ cloudPayload: null, cloudRow: null })

    await syncToCloudNow()

    expect(env.calls.map((c) => c.reason)).toEqual(['pre-check', 'manual'])
    expect(state.cloudStatus.cloudRev.items).toBe(4)
    expect(state.cloudStatus.cloudRev.calc).toBe(0)
  })

  it('云端 adopt 槽值缺失/错型 → 该槽回退本地并记录日志，其余采纳槽正常（I1）', async () => {
    loadData({
      items: [{ id: 1, name: 'local' }],
      calc: FULL_CALC,
      _rev: { items: { rev: 2, at: '' } },
    })
    const env = setupCloudEnv({
      cloudPayload: {
        ...CLOUD_PAYLOAD,
        items: [{ id: 1, sid: 'JP-1', name: 'cloud', cost: 100, status: 'inventory' }],
        calc: 'not-an-object',
        _rev: { items: { rev: 5, at: '' }, calc: { rev: 3, at: '' } },
      },
    })
    state.cloudStatus.cloudRev = { items: 1, calc: 1 }
    registerCloudConflictHandler(async () => ({
      decisions: { items: 'cloud', calc: 'cloud' },
      copies: [],
    }))

    await runCloudSyncCheck()

    expect(state.items[0].name).toBe('cloud') // items 正常采纳云端
    expect(state.calc).toEqual(FULL_CALC) // calc 错型回退本地
    expect(state.operationLogs.some((l) => l.type === 'cloud_sync' && l.message.includes('云端槽位损坏'))).toBe(true)
  })

  it('pull 模式下本地较新(upload)槽也需决策：选云端则采纳云端、不上传本地（I2）', async () => {
    loadData({
      items: [{ id: 1, name: 'local' }],
      calc: FULL_CALC,
      _rev: { items: { rev: 3, at: '' } },
    })
    const env = setupCloudEnv({
      cloudPayload: {
        ...CLOUD_PAYLOAD,
        items: [{ id: 1, name: 'cloud' }],
        calc: FULL_CALC,
        _rev: { items: { rev: 2, at: '' } },
      },
    })
    state.cloudStatus.cloudRev = { items: 2 }
    let decisionSlots = null
    registerCloudConflictHandler(async (type, data) => {
      decisionSlots = data.decisionSlots
      return { decisions: { items: 'cloud' }, copies: [] }
    })

    await runPullSync()

    expect(decisionSlots).toContain('items')
    expect(state.items[0].name).toBe('cloud')
    expect(env.calls.filter((c) => c.reason === 'sync')).toHaveLength(0) // 不上传本地
  })

  it('pull 模式下 handler 未决策的 upload 槽默认偏云端（I2）', async () => {
    loadData({
      items: [{ id: 1, name: 'local' }],
      calc: FULL_CALC,
      _rev: { items: { rev: 3, at: '' } },
    })
    const env = setupCloudEnv({
      cloudPayload: {
        ...CLOUD_PAYLOAD,
        items: [{ id: 1, name: 'cloud' }],
        calc: FULL_CALC,
        _rev: { items: { rev: 2, at: '' } },
      },
    })
    state.cloudStatus.cloudRev = { items: 2 }
    registerCloudConflictHandler(async () => ({ decisions: {}, copies: [] }))

    await runPullSync()

    expect(state.items[0].name).toBe('cloud') // 未显式决策 → 默认采纳云端
  })

  it('apply 失败分支持久化 cloudStatus（M7）', async () => {
    setupCloudEnv()
    registerCloudApplyHandler(async () => false)
    registerCloudConflictHandler(async () => ({ decisions: { items: 'cloud' }, copies: [] }))

    await runCloudSyncCheck()

    expect(state.cloudStatus.connected).toBe(false)
    expect(state.cloudStatus.lastSyncError).toContain('拒绝')
    state.cloudStatus.connected = true
    state.cloudStatus.lastSyncError = ''
    loadUiStateFromLocalStorage()
    expect(state.cloudStatus.connected).toBe(false)
    expect(state.cloudStatus.lastSyncError).toContain('拒绝')
  })

  it('全对齐且时间戳已一致：真·空操作不落日志、不上传（定期检测不再刷"内容一致"）', async () => {
    loadData({ ...CLOUD_PAYLOAD, calc: FULL_CALC, updatedAt: CLOUD_UPDATED_AT })
    const env = setupCloudEnv({ cloudPayload: exportData() })
    clearOperationLogs()

    await runCloudSyncCheck()
    await runCloudSyncCheck()

    expect(env.calls.filter((c) => c.reason === 'pre-check')).toHaveLength(2)
    expect(env.calls.filter((c) => c.reason === 'sync')).toHaveLength(0)
    expect(state.operationLogs.filter((l) => l.type === 'cloud_sync')).toHaveLength(0)
  })

  it('时间戳真不一致时才落一条"已对齐时间戳"，后续空操作不累加计数', async () => {
    // 本地时间戳比云端旧：第一次真正执行了对齐（应落一条日志），第二次已是空操作（不应累加）
    loadData({ ...CLOUD_PAYLOAD, calc: FULL_CALC, updatedAt: '2026-08-01T00:00:00.000Z' })
    const env = setupCloudEnv({ cloudPayload: exportData() })
    clearOperationLogs()

    await runCloudSyncCheck()
    await runCloudSyncCheck()

    const alignLogs = state.operationLogs.filter((l) => /已对齐时间戳/.test(l.message))
    expect(alignLogs).toHaveLength(1)
    expect(alignLogs[0].message).not.toMatch(/ x\d+$/)
    expect(env.calls.filter((c) => c.reason === 'sync')).toHaveLength(0)
  })
})

describe('blind sync 薄壳（B 方案）', () => {
  const CLOUD_PAYLOAD = {
    items: [], calc: {}, finance: { records: [], loans: [] }, transfers: [],
    rushcar: { entries: [], forwarderInfos: [], mattelSiteInfos: [], paymentCards: [] },
  }
  const CLOUD_UPDATED_AT = '2026-09-02T10:00:00.000Z'
  const FULL_CALC = { debt: 0, wechat: 0, publicExp: 0, unconfirmed: 0, fund: 0, forwarderBalance: 0, watchBalance: 0 }

  function makeSyncHandler(env) {
    return async (payload, options = {}) => {
      env.calls.push({ reason: options.reason || '', keepalive: Boolean(options.keepalive) })
      if ((options.reason || '') === 'pre-check') {
        return { updatedAt: env.cloudUpdatedAt, row: env.cloudRow ?? null, payload: env.cloudPayload }
      }
      return { updatedAt: env.cloudUpdatedAt, row: { id: 'main' }, payload }
    }
  }

  function setupCloudEnv() {
    const env = { calls: [], cloudPayload: CLOUD_PAYLOAD, cloudRow: { id: 'main' }, cloudUpdatedAt: CLOUD_UPDATED_AT }
    const storeMap = new Map()
    vi.stubGlobal('localStorage', {
      getItem: (k) => (storeMap.has(k) ? storeMap.get(k) : null),
      setItem: (k, v) => storeMap.set(k, String(v)),
      removeItem: (k) => storeMap.delete(k),
    })
    Object.assign(state.cloudSettings, {
      supabaseUrl: 'https://x.supabase.co', supabaseAnonKey: 'anon-key', stateId: 'main', enabled: true, publicRead: true,
    })
    registerCloudSyncHandler(makeSyncHandler(env))
    return env
  }

  afterEach(() => {
    registerCloudSyncHandler(null)
    registerCloudConflictHandler(null)
    registerCloudApplyHandler(null)
    Object.assign(state.cloudSettings, { supabaseUrl: '', supabaseAnonKey: '', stateId: 'main', enabled: false, publicRead: true })
    vi.unstubAllGlobals()
    loadData({})
  })

  it('unloadSync: 本地与云端一致时不盲写上传（全 align）', async () => {
    loadData(CLOUD_PAYLOAD)
    const env = setupCloudEnv()
    await unloadSync()
    expect(env.calls.filter((c) => c.reason === 'sync')).toHaveLength(0)
  })

  it('hiddenSync: 本地与云端有分歧槽位 → silent 整轮跳过（不盲写、不弹窗）', async () => {
    loadData({ ...CLOUD_PAYLOAD, items: [{ id: 1, name: 'x' }] })
    const env = setupCloudEnv()
    let conflictCalled = false
    registerCloudConflictHandler(async () => {
      conflictCalled = true
      return null
    })
    await hiddenSync()
    // 本地 items 有内容、云端 items 为空，双方均无 _rev → plan: conflict
    // silent + conflict → 整轮跳过：无 sync 上传、不弹窗
    expect(env.calls.filter((c) => c.reason === 'sync')).toHaveLength(0)
    expect(conflictCalled).toBe(false)
  })

  it('仅批次更名差异不弹冲突窗：云端旧批次名与本地新名同口径视为内容一致', async () => {
    // 云端仍是旧批次名；本地 loadData 已规范化为新名。旧逻辑直接比对原始 payload，
    // 会把该槽判为"rev 未越基线但内容不同 → 保守 conflict"，弹窗于是显示"商品 0 处差异"。
    loadData({
      items: [{ id: 1, sid: 'JP-1', name: 'a', batch: '苏州GTSHOW' }],
      calc: FULL_CALC,
      _rev: { items: { rev: 3, at: '' } },
    })
    expect(state.items[0].batch).toBe('2026苏州')

    const env = setupCloudEnv()
    env.cloudPayload = {
      ...CLOUD_PAYLOAD,
      calc: FULL_CALC,
      items: [{ id: 1, sid: 'JP-1', name: 'a', batch: '苏州GTSHOW' }],
      _rev: { items: { rev: 3, at: '' } },
    }
    state.cloudStatus.cloudRev = { items: 3 }
    let conflictCalled = false
    registerCloudConflictHandler(async () => {
      conflictCalled = true
      return { decisions: {}, copies: [] }
    })

    await runCloudSyncCheck()

    expect(conflictCalled).toBe(false)
    expect(env.calls.map((c) => c.reason)).toEqual(['pre-check'])
    expect(state.items[0].batch).toBe('2026苏州')
  })

  it('rev 相同但内容不同的冲突槽选本地后必须上传，且下一轮收敛不再弹窗', async () => {
    // 双方 _rev 都是 3（等于基线）但内容不同 → plan 判 conflict。用户选本地后
    // merged._rev === cloud._rev，旧逻辑 hasRevEqual 为 true 且无 upload 槽 → 从不上传
    // → 云端永远保留旧内容 → 每次同步都重复弹窗（反复选本地也不生效）。
    const env = setupCloudEnv()
    env.cloudPayload = {
      ...CLOUD_PAYLOAD,
      calc: FULL_CALC,
      items: [{ id: 1, name: 'cloud' }],
      _rev: { items: { rev: 3, at: '' }, calc: { rev: 1, at: '' } },
    }
    registerCloudSyncHandler(async (payload, opts = {}) => {
      const reason = opts.reason || ''
      env.calls.push({ reason, payload: payload ? JSON.parse(JSON.stringify(payload)) : payload })
      if (reason !== 'pre-check') {
        env.cloudPayload = JSON.parse(JSON.stringify(payload))
      }
      return { updatedAt: CLOUD_UPDATED_AT, row: { id: 'main' }, payload: env.cloudPayload }
    })
    loadData({
      items: [{ id: 1, name: 'local' }],
      calc: FULL_CALC,
      _rev: { items: { rev: 3, at: '' }, calc: { rev: 1, at: '' } },
    })
    state.cloudStatus.cloudRev = { items: 3, calc: 1 }

    let conflicts = 0
    registerCloudConflictHandler(async (_type, data) => {
      conflicts++
      expect(data.plan.items).toBe('conflict')
      expect(data.plan.calc).toBe('align')
      return { decisions: { items: 'local' }, copies: [] }
    })

    await runCloudSyncCheck()
    const upload = env.calls.find((c) => c.reason === 'sync')
    expect(upload).toBeDefined()
    expect(upload.payload.items[0].name).toBe('local')

    await runCloudSyncCheck()
    expect(conflicts).toBe(1)
    expect(env.calls.map((c) => c.reason)).toEqual(['pre-check', 'sync', 'pre-check'])
    expect(state.items[0].name).toBe('local')
  })
})

describe('回溯恢复落日志（E 方案）', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    })
    loadData({})
    clearOperationLogs()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('恢复时写入 app_history_restore 日志', () => {
    addOperationLog('app_history_restore', '恢复数据到 2026-09-10 状态', { targetTime: '2026-09-10T00:00:00Z' })
    expect(state.operationLogs[0].type).toBe('app_history_restore')
  })
})

describe('getUnsyncedOperations 只统计真实数据改动', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {}, removeItem: () => {} })
    loadData({})
    clearOperationLogs()
    state.cloudStatus.lastSyncAt = ''
    state.cloudStatus.lastCloudLoadAt = ''
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    state.cloudStatus.lastSyncAt = ''
    state.cloudStatus.lastCloudLoadAt = ''
    loadData({})
  })

  it('同步/备份/导出/登录/配置等记账日志不计入未同步操作', () => {
    addOperationLog('cloud_sync', '同步完成', { reason: 'debounced' })
    addOperationLog('cloud_sync', '内容一致，已对齐时间戳', { cloudUpdatedAt: 'x' })
    addOperationLog('cloud_adopt_before', '采纳云端前已备份槽位「商品」', { slot: 'items' })
    addOperationLog('app_auto_backup', '已生成每日备份 PhtonRing数据_2026-10-13.json', { date: '2026-10-13' })
    addOperationLog('app_export', '导出备份', { fileName: 'a.json' })
    addOperationLog('cloud_settings', '更新云端同步配置', {})

    expect(state.operationLogs).toHaveLength(6)
    expect(getUnsyncedOperations()).toHaveLength(0)
  })

  it('真实数据改动计入未同步操作，而同步日志不再把定期检测拖入自我触发循环', () => {
    addOperationLog('calc_update', '更新参数: 总负债 ¥0→¥100', { field: 'debt', before: 0, after: 100 })
    addOperationLog('cloud_sync', '同步完成', { reason: 'debounced' })

    expect(getUnsyncedOperations().map((l) => l.type)).toEqual(['calc_update'])
  })

  it('早于最近一次同步/拉取时间的改动不计入', () => {
    addOperationLog('calc_update', '更新参数: 总负债 ¥0→¥100', { field: 'debt', before: 0, after: 100 })
    state.cloudStatus.lastSyncAt = new Date(Date.now() + 60000).toISOString()

    expect(getUnsyncedOperations()).toHaveLength(0)
  })
})

describe('localStorage 配额保护：主数据必须能落盘', () => {
  function quotaStorage(limitBytes) {
    const map = new Map()
    return {
      getItem: (k) => (map.has(k) ? map.get(k) : null),
      setItem: (k, v) => {
        const value = String(v)
        const others = [...map.values()].reduce((s, x) => s + x.length, 0) - (map.has(k) ? map.get(k).length : 0)
        if (others + value.length > limitBytes) throw new Error('QuotaExceededError')
        map.set(k, value)
      },
      removeItem: (k) => map.delete(k),
    }
  }

  beforeEach(() => {
    loadData({})
    clearOperationLogs()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    loadData({})
    clearOperationLogs()
  })

  it('配额已满时先牺牲最老的采纳前快照再重试，主数据仍落盘且不抛异常', () => {
    vi.stubGlobal('localStorage', quotaStorage(100 * 1024))
    const pad = 'x'.repeat(30 * 1024)
    localStorage.setItem(ADOPT_STORAGE_KEY, JSON.stringify({ adopts: [
      { adoptId: 'old-3', slot: 'items', before: [{ pad }], time: '2026-01-03T00:00:00Z' },
      { adoptId: 'old-2', slot: 'items', before: [{ pad }], time: '2026-01-02T00:00:00Z' },
      { adoptId: 'old-1', slot: 'items', before: [{ pad }], time: '2026-01-01T00:00:00Z' },
    ] }))

    loadData({ items: [{ id: 1, name: '配额紧张', pad: 'y'.repeat(20 * 1024) }] })
    saveToLocalStorage()

    expect(JSON.parse(localStorage.getItem('ysp_data')).items[0].name).toBe('配额紧张')
    expect(JSON.parse(localStorage.getItem(ADOPT_STORAGE_KEY)).adopts).toHaveLength(2)
    expect(JSON.parse(localStorage.getItem(ADOPT_STORAGE_KEY)).adopts.map((e) => e.adoptId)).not.toContain('old-1')
  })

  it('无快照可牺牲时砍掉 ysp_ui 那份重复的操作日志腾出空间，主数据仍能落盘', () => {
    vi.stubGlobal('localStorage', quotaStorage(60 * 1024))
    localStorage.setItem(ADOPT_STORAGE_KEY, JSON.stringify({ adopts: [] }))
    localStorage.setItem('ysp_ui', JSON.stringify({ operationLogs: [{ pad: 'x'.repeat(45 * 1024) }] }))

    loadData({ items: [{ id: 1, name: '配额吃紧', pad: 'y'.repeat(20 * 1024) }] })
    saveToLocalStorage()

    expect(JSON.parse(localStorage.getItem('ysp_data')).items[0].name).toBe('配额吃紧')
    // ysp_ui 从 45KB 砍回到小体积，腾出的空间才让主数据写进去
    expect(localStorage.getItem('ysp_ui').length).toBeLessThan(5 * 1024)
  })

  it('saveUiStateToLocalStorage 在配额满时静默失败，不把异常抛给调用方', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => { throw new Error('QuotaExceededError') },
      removeItem: () => {},
    })
    expect(() => saveUiStateToLocalStorage()).not.toThrow()
  })

  it('配额满到无法腾挪时不落异常：内存数据保留，下次保存仍会重试', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => { throw new Error('QuotaExceededError') },
      removeItem: () => {},
    })
    expect(() => saveToLocalStorage()).not.toThrow()
  })
})

describe('snapshots 合并（负债历史只增不减）', () => {
  beforeEach(() => {
    loadData({})
    state.snapshots = []
  })

  afterEach(() => {
    state.snapshots = []
  })

  it('loadData 与现有快照按 date 并集，不丢本地独有的更早记录', () => {
    state.snapshots = [
      { date: '2026-07-01', createdAt: '2026-07-01T10:00:00Z', calc: { debt: 100 } },
    ]
    loadData({
      snapshots: [
        { date: '2026-07-02', createdAt: '2026-07-02T10:00:00Z', calc: { debt: 200 } },
      ],
    })
    expect(exportData().snapshots.map((s) => s.date)).toEqual(['2026-07-01', '2026-07-02'])
  })

  it('同日快照保留 createdAt 较新的一条', () => {
    state.snapshots = [
      { date: '2026-07-01', createdAt: '2026-07-01T10:00:00Z', calc: { debt: 100 } },
    ]
    loadData({
      snapshots: [
        { date: '2026-07-01', createdAt: '2026-07-01T12:00:00Z', calc: { debt: 999 } },
      ],
    })
    expect(exportData().snapshots).toHaveLength(1)
    expect(exportData().snapshots[0].calc.debt).toBe(999)
  })

  it('导入的空快照数组不清空现有历史（防止旧备份导入截断）', () => {
    state.snapshots = [
      { date: '2026-07-01', createdAt: '2026-07-01T10:00:00Z', calc: { debt: 100 } },
    ]
    loadData({ snapshots: [] })
    expect(exportData().snapshots).toHaveLength(1)
  })

  it('loadData 不含 snapshots 时保留现有快照（不截断）', () => {
    state.snapshots = [
      { date: '2026-07-01', createdAt: '2026-07-01T10:00:00Z', calc: { debt: 100 } },
    ]
    loadData({ items: [{ id: 1 }] })
    expect(exportData().snapshots).toHaveLength(1)
  })
})

describe('syncing 重入锁卡死防护', () => {
  function setupCloudEnv() {
    const env = { calls: [] }
    Object.assign(state.cloudSettings, {
      supabaseUrl: 'https://x.supabase.co',
      supabaseAnonKey: 'anon-key',
      stateId: 'main',
      enabled: true,
      publicRead: true,
    })
    return env
  }

  afterEach(() => {
    registerCloudSyncHandler(null)
    registerCloudConflictHandler(null)
    registerCloudApplyHandler(null)
    Object.assign(state.cloudSettings, {
      supabaseUrl: '',
      supabaseAnonKey: '',
      stateId: 'main',
      enabled: false,
      publicRead: true,
    })
    vi.unstubAllGlobals()
    vi.useRealTimers()
    loadData({})
  })

  it('启动加载时强制释放上次会话遗留的 syncing=true（跨会话卡死锁）', () => {
    const storeMap = new Map()
    storeMap.set('ysp_ui', JSON.stringify({
      cloudSettings: { supabaseUrl: 'https://x.supabase.co', supabaseAnonKey: 'k', stateId: 'main', enabled: true, publicRead: true },
      cloudSession: { accessToken: '', refreshToken: '', expiresAt: 0, tokenType: 'bearer', user: { id: '', email: '' } },
      cloudStatus: { syncing: true, connected: true, lastSyncAt: '2026-10-07T09:51:36.366+00:00', cloudRev: { items: 111 } },
      operationLogs: [],
      autoBackup: { lastDate: '', lastNotice: '' },
    }))
    vi.stubGlobal('localStorage', {
      getItem: (k) => (storeMap.has(k) ? storeMap.get(k) : null),
      setItem: (k, v) => storeMap.set(k, String(v)),
      removeItem: (k) => storeMap.delete(k),
    })
    loadUiStateFromLocalStorage()
    expect(state.cloudStatus.syncing).toBe(false)
    expect(state.cloudStatus.cloudRev).toEqual({ items: 111 })
    expect(state.cloudStatus.lastSyncAt).toBe('2026-10-07T09:51:36.366+00:00')
  })

  it('syncing 锁持有时长超过阈值时强制释放，后续同步不再被永久拦截', async () => {
    vi.useFakeTimers()
    loadData({ items: [{ id: 1, name: '本地商品', cost: 5 }] })
    const env = setupCloudEnv()
    // pre-check 永久挂起 → 第一次同步卡死，syncing 保持 true
    registerCloudSyncHandler(async (payload, options = {}) => {
      env.calls.push(options.reason || '')
      if ((options.reason || '') === 'pre-check') return new Promise(() => {})
      return { updatedAt: '2026-09-02T10:00:00.000Z', row: { id: 'main' }, payload }
    })

    syncToCloudNow()
    expect(state.cloudStatus.syncing).toBe(true)

    // 推进超过锁超时阈值（120s）
    await vi.advanceTimersByTimeAsync(130000)

    // 再次同步：锁应被强制释放，第二次调用真正进入执行流程（重新置 syncing 并再次发起 pre-check）
    syncToCloudNow()
    expect(state.cloudStatus.syncing).toBe(true)
    const preChecks = env.calls.filter((r) => r === 'pre-check').length
    expect(preChecks).toBeGreaterThanOrEqual(2)
  })
})

describe('taxpayer profile persistence', () => {
  it('imports and exports normalized pairs, persists additions, and rejects reassignment', () => {
    const values = new Map()
    vi.stubGlobal('localStorage', {
      getItem: (key) => values.get(key) || null,
      setItem: (key, value) => values.set(key, String(value)),
      removeItem: (key) => values.delete(key),
    })
    loadData({ taxpayerProfiles: [{ name: ' 主体甲 ', taxId: ' ab123 ' }] })
    expect(exportData().taxpayerProfiles).toEqual([{ name: '主体甲', taxId: 'AB123' }])
    expect(saveTaxpayerProfile('主体甲', 'XY999').conflict.field).toBe('name')
    expect(saveTaxpayerProfile('主体乙', 'AB123').conflict.field).toBe('taxId')
    expect(saveTaxpayerProfile('主体乙', 'XY999').saved).toBe(true)
    expect(exportData().taxpayerProfiles).toHaveLength(2)
    expect(JSON.parse(values.get('ysp_data')).taxpayerProfiles).toHaveLength(2)
    vi.unstubAllGlobals()
  })
})
