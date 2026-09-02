// store.js 单元测试：验证 loadData -> exportData 数据无损

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import sampleData from '../__tests__/fixtures/sampleData.json'
import {
  computeConflictDiff,
  exportData,
  isContentEqual,
  loadData,
  loadUiStateFromLocalStorage,
  registerCloudApplyHandler,
  registerCloudConflictHandler,
  registerCloudSyncHandler,
  saveUiStateToLocalStorage,
  stableSerialize,
  state,
  syncToCloudNow,
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

  it('should report calc difference as a single modified entry', () => {
    const diffLocal = { ...local, calc: { debt: 100, wechat: 0 } }
    const diffCloud = { ...cloud, calc: { debt: 50, wechat: 0 } }
    const { entries } = computeConflictDiff(diffLocal, diffCloud)
    const calc = entries.find((e) => e.key === 'calc')
    expect(calc).toBeTruthy()
    expect(calc.summary).toContain('总负债')
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

describe('手动同步(force) 智能比对', () => {
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
      env.calls.push({ reason: options.reason || '', payload: payload ? JSON.parse(JSON.stringify(payload)) : payload })
      if ((options.reason || '') === 'pre-check') {
        return { updatedAt: env.cloudUpdatedAt || CLOUD_UPDATED_AT, row: env.cloudRow ?? null, payload: env.cloudPayload }
      }
      return { updatedAt: env.cloudUpdatedAt || CLOUD_UPDATED_AT, row: { id: 'main' }, payload }
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
    registerCloudConflictHandler(async (type) => {
      conflictType = type
      return 'cancel'
    })

    await syncToCloudNow()

    // 只发生了一次 pre-check(只读)，绝无第二次上传调用
    expect(env.calls.map((c) => c.reason)).toEqual(['pre-check'])
    expect(conflictType).toBe('manual-sync')
    expect(state.items.length).toBe(0) // 本地保持未被云端覆盖
  })

  it('云端为空(首次使用)时，手动同步应上传本地完成初始化', async () => {
    loadData({ items: [{ id: 1, name: '本地商品', cost: 5 }] })
    const env = setupCloudEnv({ cloudPayload: null, cloudRow: null })
    let conflictCalled = false
    registerCloudConflictHandler(async () => {
      conflictCalled = true
      return 'cancel'
    })

    await syncToCloudNow()

    expect(env.calls.map((c) => c.reason)).toEqual(['pre-check', 'manual'])
    expect(conflictCalled).toBe(false)
    expect(state.items.length).toBe(1)
  })

  it('云端较新且不同、用户选择 use-cloud 时，应用云端数据覆盖本地', async () => {
    loadData({})
    const env = setupCloudEnv()
    registerCloudConflictHandler(async () => 'use-cloud')

    await syncToCloudNow()

    expect(env.calls.map((c) => c.reason)).toEqual(['pre-check'])
    expect(state.items).toEqual(CLOUD_PAYLOAD.items)
  })
})