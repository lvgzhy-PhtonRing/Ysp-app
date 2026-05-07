import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { loadData, state as store } from '../../data/store'
import {
  addPaytonCarByPurchase,
  addPaytonRecord,
  clearCarRefFromRecords,
  deletePaytonRecord,
  editPaytonRecord,
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

  // ========== 库存联动测试 ==========

  it('test7 record creation stores new car fields', () => {
    loadData({})

    const rec = addPaytonRecord({
      type: 'expense',
      category: '买小车',
      account: 'yeb',
      date: '2026-05-01',
      amount: 100,
      note: 'test',
      carId: 123,
      carQty: 2,
      carUnitPrice: 50,
      carName: 'Test Car',
      carBrand: 'Hotwheels',
    })

    expect(rec.carQty).toBe(2)
    expect(rec.carUnitPrice).toBe(50)
    expect(rec.carName).toBe('Test Car')
    expect(rec.carBrand).toBe('Hotwheels')

    const found = store.paytonRecords.find((r) => r.id === rec.id)
    expect(found.carQty).toBe(2)
    expect(found.carUnitPrice).toBe(50)
    expect(found.carName).toBe('Test Car')
    expect(found.carBrand).toBe('Hotwheels')
  })

  it('test8 non-car records do not trigger inventory linkage', () => {
    loadData({})

    const rec = addPaytonRecord({
      type: 'expense',
      category: '生活日常',
      account: 'yeb',
      date: '2026-05-01',
      amount: 50,
      note: '买菜',
    })

    // non-car record has no car fields
    expect(rec.carQty).toBeNull()
    expect(rec.carUnitPrice).toBeNull()

    // delete should not crash
    const result = deletePaytonRecord(rec.id)
    expect(result).toBe(true)
  })

  it('test9 delete buy-car record rolls back weighted average inventory', () => {
    loadData({})

    // initial inventory: 5 cars at avgPrice 10, totalCost 50
    addPaytonCarByPurchase({ name: 'TestCar', brand: 'Hotwheels', qty: 5, avgPrice: 10 })

    expect(store.paytonInventory).toHaveLength(1)
    const car = store.paytonInventory[0]
    expect(car.qty).toBe(5)
    expect(car.avgPrice).toBeCloseTo(10, 2)
    expect(car.totalCost).toBeCloseTo(50, 2)

    // record: buy 2 more at unitPrice 20 → inventory becomes 7 at avgPrice ~12.857
    const rec = addPaytonRecord({
      type: 'expense',
      category: '买小车',
      account: 'yeb',
      date: '2026-05-01',
      amount: 40,
      note: '[买小车] TestCar x2',
      carId: car.id,
      carQty: 2,
      carUnitPrice: 20,
      carName: 'TestCar',
      carBrand: 'Hotwheels',
    })

    // addPaytonRecord alone does NOT merge inventory; addPaytonCarByPurchase was already called
    // The record just stores the data. For this test, simulate the full flow:
    // Actually merge via addPaytonCarByPurchase to match real UI behavior
    addPaytonCarByPurchase({ name: 'TestCar', brand: 'Hotwheels', qty: 2, avgPrice: 20 })

    expect(store.paytonInventory[0].qty).toBe(7)
    expect(store.paytonInventory[0].avgPrice).toBeCloseTo(12.857, 2)

    // now delete the record → inventory should revert from 7 to 5
    deletePaytonRecord(rec.id)

    expect(store.paytonInventory).toHaveLength(1)
    expect(store.paytonInventory[0].qty).toBe(5)
    expect(store.paytonInventory[0].avgPrice).toBeCloseTo(10, 2)
    expect(store.paytonInventory[0].totalCost).toBeCloseTo(50, 2)
  })

  it('test10 delete buy-car record removes entry when inventory qty equals record qty', () => {
    loadData({})

    // add 3 cars to inventory
    addPaytonCarByPurchase({ name: 'UniqueCar', brand: 'Hotwheels', qty: 3, avgPrice: 15 })
    expect(store.paytonInventory).toHaveLength(1)

    // create a record for buying these 3 cars
    const rec = addPaytonRecord({
      type: 'expense',
      category: '买小车',
      account: 'yeb',
      date: '2026-05-01',
      amount: 45,
      note: '[买小车] UniqueCar x3',
      carId: store.paytonInventory[0].id,
      carQty: 3,
      carUnitPrice: 15,
      carName: 'UniqueCar',
      carBrand: 'Hotwheels',
    })

    // now delete the record → removeFromPaytonInventory should remove the entry entirely
    deletePaytonRecord(rec.id)

    expect(store.paytonInventory).toHaveLength(0)
  })

  it('test11 delete sell-car record restores inventory', () => {
    loadData({})

    // start with 5 cars in inventory
    addPaytonCarByPurchase({ name: 'SellCar', brand: 'MINIGT', qty: 5, avgPrice: 20 })
    expect(store.paytonInventory).toHaveLength(1)
    const carId = store.paytonInventory[0].id

    // sell 2 cars (creates a sell record with carQty=2, carUnitPrice=20)
    const sellResult = sellPaytonCar(carId, { qty: 2, sellPrice: 30, account: 'yeb', date: '2026-05-01' })
    expect(sellResult).toBe(true)

    // inventory should now have 3 cars
    expect(store.paytonInventory).toHaveLength(1)
    expect(store.paytonInventory[0].qty).toBe(3)

    // find the sell record
    const sellRecord = store.paytonRecords.find((r) => r.category === '卖小车')
    expect(sellRecord).toBeDefined()
    expect(sellRecord.carQty).toBe(2)
    expect(sellRecord.carUnitPrice).toBe(20)

    // delete the sell record → inventory should restore to 5
    deletePaytonRecord(sellRecord.id)

    expect(store.paytonInventory).toHaveLength(1)
    expect(store.paytonInventory[0].qty).toBe(5)
    expect(store.paytonInventory[0].avgPrice).toBeCloseTo(20, 2)
  })

  it('test12 delete sell-car record recreates inventory entry when car was fully sold', () => {
    loadData({})

    // start with 2 cars
    addPaytonCarByPurchase({ name: 'FullSell', brand: 'Tomica', qty: 2, avgPrice: 25 })
    expect(store.paytonInventory).toHaveLength(1)
    const carId = store.paytonInventory[0].id

    // sell all 2 cars → inventory entry removed entirely
    const sellResult = sellPaytonCar(carId, { qty: 2, sellPrice: 40, account: 'yeb', date: '2026-05-01' })
    expect(sellResult).toBe(true)
    expect(store.paytonInventory).toHaveLength(0)

    // find the sell record
    const sellRecord = store.paytonRecords.find((r) => r.category === '卖小车')
    expect(sellRecord).toBeDefined()
    expect(sellRecord.carQty).toBe(2)
    expect(sellRecord.carUnitPrice).toBe(25)
    expect(sellRecord.carName).toBe('FullSell')
    expect(sellRecord.carBrand).toBe('Tomica')

    // delete the sell record → inventory should be recreated with 2 cars at avgPrice 25
    deletePaytonRecord(sellRecord.id)

    expect(store.paytonInventory).toHaveLength(1)
    expect(store.paytonInventory[0].qty).toBe(2)
    expect(store.paytonInventory[0].avgPrice).toBeCloseTo(25, 2)
    expect(store.paytonInventory[0].totalCost).toBeCloseTo(50, 2)
  })

  it('test13 edit buy-car amount updates inventory weighted average', () => {
    loadData({})

    // start with 5 cars at avgPrice 10 → totalCost 50
    addPaytonCarByPurchase({ name: 'EditTest', brand: 'Hotwheels', qty: 5, avgPrice: 10 })
    const car = store.paytonInventory[0]

    // buy 3 more cars at unitPrice 20 (total 60) via addPaytonCarByPurchase + addPaytonRecord
    addPaytonCarByPurchase({ name: 'EditTest', brand: 'Hotwheels', qty: 3, avgPrice: 20 })
    const rec = addPaytonRecord({
      type: 'expense',
      category: '买小车',
      account: 'yeb',
      date: '2026-05-01',
      amount: 60,
      note: '[买小车] EditTest x3',
      carId: car.id,
      carQty: 3,
      carUnitPrice: 20,
      carName: 'EditTest',
      carBrand: 'Hotwheels',
    })

    // inventory: 8 cars at avgPrice = (50 + 60) / 8 = 13.75
    expect(store.paytonInventory[0].qty).toBe(8)
    expect(store.paytonInventory[0].avgPrice).toBeCloseTo(13.75, 2)

    // edit the amount from 60 to 90 → new unitPrice = 90/3 = 30
    // remove old: 3 at 20 → inventory back to 5 at 10
    // add new: 3 at 30 → inventory = 8 at avgPrice (50 + 90) / 8 = 17.5
    editPaytonRecord(rec.id, { amount: 90 })

    expect(store.paytonInventory[0].qty).toBe(8)
    expect(store.paytonInventory[0].avgPrice).toBeCloseTo(17.5, 2)
    expect(store.paytonInventory[0].totalCost).toBeCloseTo(140, 2)
  })

  it('test14 delete old-style records without car fields still work', () => {
    const original = readDesktopAJson()
    loadData(original)

    // find a buy record from fixture data (no carQty/carUnitPrice)
    const oldBuyRecord = store.paytonRecords.find((r) => r.category === '买小车')
    expect(oldBuyRecord).toBeDefined()
    expect(oldBuyRecord.carQty).toBeUndefined()

    const beforeBalance = Number(store.paytonAccounts.yeb.balance)

    // delete should still rollback balance without crashing
    const result = deletePaytonRecord(oldBuyRecord.id)
    expect(result).toBe(true)

    const afterBalance = Number(store.paytonAccounts.yeb.balance)
    // balance should have changed (rollback applied)
    expect(afterBalance).not.toBeCloseTo(beforeBalance)
  })
})
