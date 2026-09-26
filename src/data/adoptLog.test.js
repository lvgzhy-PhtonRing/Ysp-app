import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  appendAdoptBefore, getAdoptBeforeById, listAdoptBefore, pruneAdoptBefore, latestFullImportSnapshot, ADOPT_STORAGE_KEY,
} from './adoptLog'

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
