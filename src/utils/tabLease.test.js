// tabLease.js 单元测试：跨标签页编辑租约判定

import { describe, expect, it } from 'vitest'
import { TAB_LEASE_TTL_MS, parseTabLease, shouldWarnEditorLock } from './tabLease'

const NOW = Date.parse('2026-09-26T10:00:00.000Z')

function tab(id, atOffset, touchOffset) {
  return { id, at: NOW + atOffset, touch: NOW + touchOffset }
}

describe('parseTabLease', () => {
  it('空值或非法 JSON 返回 null', () => {
    expect(parseTabLease('')).toBe(null)
    expect(parseTabLease(null)).toBe(null)
    expect(parseTabLease('not-json')).toBe(null)
  })

  it('解析合法租约并补齐数字字段', () => {
    expect(parseTabLease(JSON.stringify({ id: 'a', at: 1, touch: 2 }))).toEqual({ id: 'a', at: 1, touch: 2 })
    expect(parseTabLease(JSON.stringify({ id: 'a', at: 5, touch: null }))).toEqual({ id: 'a', at: 5, touch: 0 })
    expect(parseTabLease(JSON.stringify({ id: '', at: 0, touch: 0 }))).toEqual({ id: '', at: 0, touch: 0 })
  })
})

describe('shouldWarnEditorLock', () => {
  it('无对方或无本页 → false', () => {
    expect(shouldWarnEditorLock(null, tab('own', 0, 0), NOW)).toBe(false)
    expect(shouldWarnEditorLock(tab('other', 0, 0), null, NOW)).toBe(false)
  })

  it('对方即本页 → false', () => {
    expect(shouldWarnEditorLock(tab('same', 0, 100), tab('same', 0, 0), NOW)).toBe(false)
  })

  it('对方心跳已过期（超 TTL）→ false', () => {
    expect(shouldWarnEditorLock(tab('o', -(TAB_LEASE_TTL_MS + 100), -10), tab('own', 0, 0), NOW)).toBe(false)
  })

  it('对方从未交互（touch=0）→ false', () => {
    const idleOther = { id: 'o', at: NOW - 1000, touch: 0 }
    expect(shouldWarnEditorLock(idleOther, tab('own', 0, -2000), NOW)).toBe(false)
  })

  it('对方新鲜且比本页更活跃 → true', () => {
    expect(shouldWarnEditorLock(tab('o', -500, -500), tab('own', 0, -5000), NOW)).toBe(true)
  })

  it('本页最近更活跃 → false（避免互相锁定）', () => {
    expect(shouldWarnEditorLock(tab('o', -500, -5000), tab('own', 0, -500), NOW)).toBe(false)
  })
})