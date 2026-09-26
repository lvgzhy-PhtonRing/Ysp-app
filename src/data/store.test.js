// store.js 单元测试：验证 loadData -> exportData 数据无损

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import sampleData from '../__tests__/fixtures/sampleData.json'
import {
  computeConflictDiff,
  exportData,
  hiddenSync,
  isContentEqual,
  loadData,
  loadUiStateFromLocalStorage,
  markCloudConnected,
  performSyncDecision,
  registerCloudApplyHandler,
  registerCloudConflictHandler,
  registerCloudSyncHandler,
  runCloudSyncCheck,
  runPullSync,
  saveToLocalStorage,
  saveUiStateToLocalStorage,
  stableSerialize,
  state,
  syncToCloudNow,
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
    expect(conflictCalled).toBe(false)
    expect(state.items.length).toBe(1)
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
    expect(state.items).toEqual(CLOUD_PAYLOAD.items)
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
})

describe('blind sync 薄壳（B 方案）', () => {
  const CLOUD_PAYLOAD = {
    items: [], calc: {}, finance: { records: [], loans: [] }, transfers: [],
    rushcar: { entries: [], forwarderInfos: [], mattelSiteInfos: [], paymentCards: [] },
  }
  const CLOUD_UPDATED_AT = '2026-09-02T10:00:00.000Z'

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
})