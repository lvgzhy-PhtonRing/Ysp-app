// cloudConflict.js 单元测试：冲突弹窗主按钮方向判定

import { describe, expect, it } from 'vitest'
import { primaryConflictAction } from './cloudConflict'

const LOCAL = '2026-09-05T05:59:45.000Z'
const CLOUD = '2026-09-05T05:59:34.000Z'
const LATER = '2026-09-05T06:00:00.000Z'

describe('primaryConflictAction', () => {
  it('upload-local 类型始终推荐上传本地', () => {
    expect(primaryConflictAction('upload-local', LOCAL, CLOUD)).toBe('upload')
  })

  it('recovery 类型始终推荐使用云端', () => {
    expect(primaryConflictAction('recovery', LOCAL, CLOUD)).toBe('use-cloud')
  })

  it('manual-sync 且本地时间较新时推荐上传', () => {
    expect(primaryConflictAction('manual-sync', LOCAL, CLOUD)).toBe('upload')
  })

  it('manual-sync 且云端时间较新时推荐下载云端', () => {
    expect(primaryConflictAction('manual-sync', LOCAL, LATER)).toBe('use-cloud')
  })

  it('manual-sync 时间相等或缺失时回退推荐上传', () => {
    expect(primaryConflictAction('manual-sync', LOCAL, LOCAL)).toBe('upload')
    expect(primaryConflictAction('manual-sync', '', CLOUD)).toBe('upload')
    expect(primaryConflictAction('manual-sync', LOCAL, '')).toBe('upload')
  })

  it('未知类型按本地时间是否较新决定', () => {
    expect(primaryConflictAction('other', LOCAL, LATER)).toBe('use-cloud')
    expect(primaryConflictAction('other', LATER, LOCAL)).toBe('upload')
    expect(primaryConflictAction('other', '', '')).toBe('upload')
  })

  it('localPoorerThanCloud 为 true 时，本地时间较新也不推荐上传本地', () => {
    expect(primaryConflictAction('manual-sync', LOCAL, CLOUD, true)).toBe('use-cloud')
  })

  it('localPoorerThanCloud 为 true 且时间缺失/相等时同样回退云端', () => {
    expect(primaryConflictAction('manual-sync', '', CLOUD, true)).toBe('use-cloud')
    expect(primaryConflictAction('manual-sync', LOCAL, LOCAL, true)).toBe('use-cloud')
  })

  it('localPoorerThanCloud 为 true 但云端时间较新时结论不变', () => {
    expect(primaryConflictAction('manual-sync', CLOUD, LATER, true)).toBe('use-cloud')
  })

  it('localPoorerThanCloud 为 true 不覆盖 recovery / upload-local 的固定方向', () => {
    expect(primaryConflictAction('recovery', LOCAL, CLOUD, true)).toBe('use-cloud')
    expect(primaryConflictAction('upload-local', LOCAL, CLOUD, true)).toBe('upload')
  })

  it('不传 localPoorerThanCloud 时保持既有时间戳语义', () => {
    expect(primaryConflictAction('manual-sync', LOCAL, CLOUD)).toBe('upload')
    expect(primaryConflictAction('manual-sync', LOCAL, LATER)).toBe('use-cloud')
    expect(primaryConflictAction('manual-sync', LOCAL, CLOUD, false)).toBe('upload')
  })
})
