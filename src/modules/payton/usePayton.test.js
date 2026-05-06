import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { loadData, state as store } from '../../data/store'
import {
  addPaytonRecord,
  clearCarRefFromRecords,
  deletePaytonRecord,
  getPaytonStats,
  sellPaytonCar,
  syncPaytonRecordsForCarRename,
} from './usePayton'

function readDesktopAJson() {
  const __filename = fileURLToPath(import.meta.url)
  const __dirname = path.dirname(__filename)
  const filePath = path.resolve(__dirname, '../../../../a.json')
  const raw = fs.readFileSync(filePath, 'utf8')
  return JSON.parse(raw)
}

describe('usePayton logic', () => {
  beforeEach(() => {
    loadData({})

    const localStorageMock = {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
    }
    vi.stubGlobal('localStorage', localStorageMock)
  })

  it('test1 addPaytonRecord should affect account balance', () => {
    const original = readDesktopAJson()
    loadData(original)

    const before = Number(store.paytonAccounts.yeb.balance)
    addPaytonRecord({
      type: 'expense',
      category: '测试',
      account: 'yeb',
      date: '2026-04-01',
      amount: 100,
      note: 'test',
    })

    const after = Number(store.paytonAccounts.yeb.balance)
    expect(after).toBeCloseTo(before - 100, 2)
  })

  it('test2 deletePaytonRecord should rollback balance', () => {
    const original = readDesktopAJson()
    loadData(original)

    const before = Number(store.paytonAccounts.yeb.balance)
    const rec = addPaytonRecord({
      type: 'expense',
      category: '测试',
      account: 'yeb',
      date: '2026-04-01',
      amount: 100,
      note: 'test',
    })

    deletePaytonRecord(rec.id)
    const after = Number(store.paytonAccounts.yeb.balance)
    expect(after).toBeCloseTo(before, 2)
  })

  it('test4 addPaytonRecord should store carId', () => {
    const original = readDesktopAJson()
    loadData(original)

    const rec = addPaytonRecord({
      type: 'expense',
      category: '买小车',
      account: 'yeb',
      date: '2026-04-01',
      amount: 200,
      note: 'test car',
      carId: 12345,
    })

    expect(rec.carId).toBe(12345)
    const found = store.paytonRecords.find((r) => r.id === rec.id)
    expect(found.carId).toBe(12345)
  })

  it('test5 syncPaytonRecordsForCarRename updates record notes', () => {
    const original = readDesktopAJson()
    loadData(original)

    // Create a record with a carId
    addPaytonRecord({
      type: 'expense',
      category: '买小车',
      account: 'yeb',
      date: '2026-04-01',
      amount: 100,
      note: '[买小车] GTR R34 x2',
      carId: 999,
    })

    syncPaytonRecordsForCarRename(999, 'GTR R34', 'Skyline GTR')

    const record = store.paytonRecords.find((r) => r.carId === 999)
    expect(record.note).toContain('Skyline GTR')
    expect(record.note).not.toContain('GTR R34')
  })

  it('test6 clearCarRefFromRecords sets carId to null', () => {
    const original = readDesktopAJson()
    loadData(original)

    addPaytonRecord({
      type: 'expense',
      category: '买小车',
      account: 'yeb',
      date: '2026-04-01',
      amount: 100,
      note: '[买小车] Test x1',
      carId: 777,
    })

    clearCarRefFromRecords(777)

    const record = store.paytonRecords.find((r) => r.note && r.note.includes('Test'))
    expect(record.carId).toBeNull()
  })

  it('test3 getPaytonStats', () => {
    const original = readDesktopAJson()
    loadData(original)

    const stats = getPaytonStats(
      store.paytonAccounts,
      store.paytonRecords,
      store.paytonInventory,
    )

    const expectedCars = store.paytonInventory.reduce((sum, car) => sum + Number(car.qty || 0), 0)

    expect(stats.totalCars).toBe(expectedCars)
    expect(stats.inventoryValue).toBeGreaterThan(0)
  })
})
