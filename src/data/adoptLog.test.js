import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  appendAdoptBefore, getAdoptBeforeById, listAdoptBefore, pruneAdoptBefore, ADOPT_STORAGE_KEY,
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
    const id = appendAdoptBefore({ slot: 'items', before: [{ id: 'a' }], beforeRev: 2, cloudRev: 3 })
    expect(typeof id).toBe('string')
    expect(id.length).toBeGreaterThan(0)
    const got = getAdoptBeforeById(id)
    expect(got.slot).toBe('items')
    expect(got.before[0].id).toBe('a')
    expect(got.beforeRev).toBe(2)
    expect(got.cloudRev).toBe(3)
  })

  it('支持 __full_import__ 槽位（D 方案导入前快照）：before 为完整导出 payload（嵌套对象）', () => {
    const id = appendAdoptBefore({ slot: '__full_import__', before: { items: [], calc: {} } })
    const got = getAdoptBeforeById(id)
    expect(got.slot).toBe('__full_import__')
    expect(got.before).toEqual({ items: [], calc: {} })
  })

  it('list 按时间倒序', () => {
    appendAdoptBefore({ slot: 'items', before: [], time: '2026-01-01T00:00:00Z' })
    appendAdoptBefore({ slot: 'calc', before: {}, time: '2026-01-02T00:00:00Z' })
    const list = listAdoptBefore()
    expect(list[0].slot).toBe('calc')
  })

  it('prune 清理超过 1 天的旧记录', () => {
    const oldId = appendAdoptBefore({ slot: 'items', before: [], time: new Date(Date.now() - 2 * 86400000).toISOString() })
    const newId = appendAdoptBefore({ slot: 'calc', before: {}, time: new Date().toISOString() })
    pruneAdoptBefore(86400000)
    expect(getAdoptBeforeById(oldId)).toBeNull()
    expect(getAdoptBeforeById(newId)).not.toBeNull()
  })
})
