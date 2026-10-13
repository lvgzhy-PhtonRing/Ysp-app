import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  appendAdoptBefore, getAdoptBeforeById, listAdoptBefore, pruneAdoptBefore, latestFullImportSnapshot, ADOPT_STORAGE_KEY,
  shrinkToFit, writeAllRetry, evictOldestAdoptBefore, trimAdoptBeforeToBudget, MAX_TOTAL_BYTES, MAX_ENTRIES,
} from './adoptLog'

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

describe('adoptLog（C 方案）', () => {
  beforeEach(() => {
    const storeMap = new Map()
    vi.stubGlobal('localStorage', {
      getItem: (k) => (storeMap.has(k) ? storeMap.get(k) : null),
      setItem: (k, v) => storeMap.set(k, String(v)),
      removeItem: (k) => storeMap.delete(k),
    })
    if (typeof localStorage !== 'undefined') localStorage.removeItem(ADOPT_STORAGE_KEY)
  })

  it('append 生成唯一 id 并可按 id 读取', () => {
    // before 存槽位内容本身（数组），与 slotValue(payload, slot) 一致
    const res = appendAdoptBefore({ slot: 'items', before: [{ id: 'a' }], beforeRev: 2, cloudRev: 3 })
    expect(typeof res.adoptId).toBe('string')
    expect(res.adoptId.length).toBeGreaterThan(0)
    expect(res.persisted).toBe(true)
    const got = getAdoptBeforeById(res.adoptId)
    expect(got.slot).toBe('items')
    expect(got.before[0].id).toBe('a')
    expect(got.beforeRev).toBe(2)
    expect(got.cloudRev).toBe(3)
  })

  it('支持 __full_import__ 槽位（D 方案导入前快照）：before 为完整导出 payload（嵌套对象）', () => {
    const res = appendAdoptBefore({ slot: '__full_import__', before: { items: [], calc: {} } })
    expect(res.persisted).toBe(true)
    const got = getAdoptBeforeById(res.adoptId)
    expect(got.slot).toBe('__full_import__')
    expect(got.before).toEqual({ items: [], calc: {} })
  })

  it('list 按时间倒序', () => {
    appendAdoptBefore({ slot: 'items', before: [], time: '2026-01-01T00:00:00Z' })
    appendAdoptBefore({ slot: 'calc', before: {}, time: '2026-01-02T00:00:00Z' })
    const list = listAdoptBefore()
    expect(list[0].slot).toBe('calc')
  })

  it('同 slot 同 time 去重：返回既有 adoptId 且 persisted 为 true', () => {
    const first = appendAdoptBefore({ slot: 'items', before: [{ id: 'a' }], time: '2026-01-01T00:00:00Z' })
    const second = appendAdoptBefore({ slot: 'items', before: [{ id: 'b' }], time: '2026-01-01T00:00:00Z' })
    expect(second.adoptId).toBe(first.adoptId)
    expect(second.persisted).toBe(true)
    expect(listAdoptBefore()).toHaveLength(1)
  })

  it('setItem 抛异常（存储满）时 persisted 为 false，仍返回 id 且不落库', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => { throw new Error('quota exceeded') },
      removeItem: () => {},
    })
    const res = appendAdoptBefore({ slot: 'items', before: [{ id: 'a' }] })
    expect(typeof res.adoptId).toBe('string')
    expect(res.persisted).toBe(false)
    expect(getAdoptBeforeById(res.adoptId)).toBeNull()
  })

  it('prune 清理超过 1 天的旧记录', () => {
    const oldRes = appendAdoptBefore({ slot: 'items', before: [], time: new Date(Date.now() - 2 * 86400000).toISOString() })
    const newRes = appendAdoptBefore({ slot: 'calc', before: {}, time: new Date().toISOString() })
    pruneAdoptBefore(86400000)
    expect(getAdoptBeforeById(oldRes.adoptId)).toBeNull()
    expect(getAdoptBeforeById(newRes.adoptId)).not.toBeNull()
  })

  it('append 时自动清理超过默认保留期（365 天）的旧记录', () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
      const oldRes = appendAdoptBefore({ slot: 'items', before: [{ id: 'old' }] })
      expect(getAdoptBeforeById(oldRes.adoptId)).not.toBeNull()
      vi.setSystemTime(new Date('2026-01-01T00:00:00Z').getTime() + 400 * 86400000)
      const newRes = appendAdoptBefore({ slot: 'calc', before: {} })
      expect(getAdoptBeforeById(oldRes.adoptId)).toBeNull()
      expect(getAdoptBeforeById(newRes.adoptId)).not.toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('latestFullImportSnapshot 返回最新 __full_import__ before，无则 null，非导入记录忽略', () => {
    expect(latestFullImportSnapshot()).toBeNull()
    appendAdoptBefore({ slot: 'items', before: [{ id: 'a' }], time: '2026-01-01T00:00:00Z' })
    expect(latestFullImportSnapshot()).toBeNull()
    appendAdoptBefore({ slot: '__full_import__', before: { items: [{ id: 'old' }], calc: {} }, time: '2026-01-02T00:00:00Z' })
    appendAdoptBefore({ slot: '__full_import__', before: { items: [{ id: 'newer' }], calc: {} }, time: '2026-01-03T00:00:00Z' })
    expect(latestFullImportSnapshot()).toEqual({ items: [{ id: 'newer' }], calc: {} })
  })
})

describe('adoptLog 容量闸（配额是整站共享的，只按天数挡不住体积）', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('shrinkToFit 双闸：超条数保留最新 MAX_ENTRIES 份，超容量逐条淘汰但保住最新一份', () => {
    expect(MAX_TOTAL_BYTES).toBe(1024 * 1024)
    expect(MAX_ENTRIES).toBe(20)

    const many = Array.from({ length: 30 }, (_, i) => ({
      slot: 'items', before: [], time: new Date(Date.now() - i * 1000).toISOString(),
    }))
    expect(shrinkToFit(many)).toHaveLength(MAX_ENTRIES)

    const big = 'y'.repeat(2000)
    const pool = [
      { slot: 'items', before: [{ pad: big }], time: '2026-03-01T00:00:00Z' },
      { slot: 'items', before: [{ pad: big }], time: '2026-02-01T00:00:00Z' },
      { slot: 'items', before: [{ pad: big }], time: '2026-01-01T00:00:00Z' },
    ]
    const shrank = shrinkToFit(pool, { maxBytes: 5000, maxEntries: 20 })
    expect(JSON.stringify({ adopts: shrank }).length).toBeLessThanOrEqual(5000)
    expect(shrank[0].time).toBe('2026-03-01T00:00:00Z')
  })

  it('shrinkToFit 超容量时优先淘汰整份导入前快照（体积最大、回溯价值最低）', () => {
    const big = 'z'.repeat(2000)
    const pool = [
      { slot: 'items', before: [{ pad: big }], time: '2026-03-01T00:00:00Z' },
      { slot: '__full_import__', before: { pad: big }, time: '2026-02-01T00:00:00Z' },
      { slot: 'items', before: [{ pad: big }], time: '2026-01-01T00:00:00Z' },
    ]
    const shrank = shrinkToFit(pool, { maxBytes: 5000, maxEntries: 20 })
    expect(shrank.every((e) => e.slot !== '__full_import__')).toBe(true)
    expect(shrank.length).toBe(2)
  })

  it('配额不足时 writeAllRetry 牺牲最老快照保住最新一份，且落盘成功', () => {
    const pad = 'x'.repeat(20 * 1024)
    vi.stubGlobal('localStorage', quotaStorage(60 * 1024))
    appendAdoptBefore({ slot: 'items', before: [{ pad }], time: '2026-01-01T00:00:00Z' })
    appendAdoptBefore({ slot: 'calc', before: { pad }, time: '2026-01-02T00:00:00Z' })
    const newest = appendAdoptBefore({ slot: 'items', before: [{ pad }], time: '2026-01-03T00:00:00Z' })

    expect(newest.persisted).toBe(true)
    expect(listAdoptBefore()).toHaveLength(2)
    expect(getAdoptBeforeById(newest.adoptId)).not.toBeNull()
    expect(listAdoptBefore().every((e) => e.time !== '2026-01-01T00:00:00Z')).toBe(true)
  })

  it('setItem 恒抛时 writeAllRetry 返回 false，不写空集冒充成功', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => JSON.stringify({ adopts: [{ slot: 'items', before: [] }] }),
      setItem: () => { throw new Error('QuotaExceededError') },
      removeItem: () => {},
    })
    expect(writeAllRetry([{ slot: 'items', before: [] }])).toBe(false)
  })

  it('evictOldestAdoptBefore 优先删整份导入前快照而非最老的槽位快照；删空后返回 false', () => {
    const pad = 'x'.repeat(20 * 1024)
    const at = (i) => new Date(Date.UTC(2026, 0, i)).toISOString()
    vi.stubGlobal('localStorage', quotaStorage(80 * 1024))
    appendAdoptBefore({ slot: 'items', before: [{ pad }], time: at(1) })
    appendAdoptBefore({ slot: 'items', before: [{ pad }], time: at(2) })
    appendAdoptBefore({ slot: '__full_import__', before: { pad }, time: at(3) })
    expect(listAdoptBefore()).toHaveLength(3)

    expect(evictOldestAdoptBefore()).toBe(true)
    const afterFirst = listAdoptBefore()
    expect(afterFirst).toHaveLength(2)
    expect(afterFirst.every((e) => e.slot === 'items')).toBe(true)
    expect(afterFirst.some((e) => e.time === at(1))).toBe(true)

    expect(evictOldestAdoptBefore()).toBe(true)
    expect(listAdoptBefore()).toHaveLength(1)
    expect(evictOldestAdoptBefore()).toBe(true)
    expect(evictOldestAdoptBefore()).toBe(false)
  })

  it('trimAdoptBeforeToBudget 按更紧的预算强制裁剪', () => {
    const pad = 'x'.repeat(20 * 1024)
    vi.stubGlobal('localStorage', quotaStorage(60 * 1024))
    appendAdoptBefore({ slot: 'items', before: [{ pad }], time: '2026-01-01T00:00:00Z' })
    appendAdoptBefore({ slot: 'items', before: [{ pad }], time: '2026-01-02T00:00:00Z' })
    appendAdoptBefore({ slot: 'items', before: [{ pad }], time: '2026-01-03T00:00:00Z' })

    expect(trimAdoptBeforeToBudget({ maxBytes: 25 * 1024 })).toBe(true)
    expect(listAdoptBefore()).toHaveLength(1)
  })
})
