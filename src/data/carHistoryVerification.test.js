import { describe, expect, it } from 'vitest'
import { verifyCarHistoryArchive } from './carHistoryVerification'

const makeData = () => ({
  cars: [
    { sid: 'SID-1', name: '蓝色小车', brand: 'Hotwheels', category: 'invest', isSold: false, buyPrice: 20 },
    { sid: 'SID-2', name: '已售投资车', brand: 'Hotwheels', category: 'invest', isSold: true, buyPrice: 30 },
    { sid: 'SID-3', name: '自留小车', brand: 'Hotwheels', category: 'keep', isSold: false, buyPrice: 10 },
    { sid: 'SID-4', name: '已售自留车', brand: 'Hotwheels', category: 'keep', isSold: true, buyPrice: 15 },
  ],
  accounts: { pocket: { transactions: [{ id: 'p1', type: 'income', amount: 10 }] }, invest: { transactions: [{ id: 'i1', type: 'expense', amount: 20 }], loans: [{ id: 'l1', remaining: 5 }] } },
  transferPairs: [{ id: 't1', amount: 2 }], expectedPrices: { '蓝色小车': { value: 30 } }, operationLogs: [{ id: 'o1', action: 'import' }],
})

const uiLayout = {
  roots: ["Payton's 数据", '日常消费', '投资小车'],
  daily: ['收支明细', '自留车库'],
  invest: ['投资明细', '投资车库'],
  loansLocation: 'dashboard',
}

describe('car 历史档案核验', () => {
  it('确认全量数据一致并计算各页显示条数', () => {
    const data = makeData()
    const report = verifyCarHistoryArchive(data, data, uiLayout)

    expect(report.dataPassed).toBe(true)
    expect(report.summary).toMatchObject({ cars: 4, investCars: 2, keepCars: 2, pocketTransactions: 1, investTransactions: 1, loans: 1 })
    expect(report.sections.every(section => section.passed)).toBe(true)
    expect(report.visibleCounts).toEqual({ pocketTransactions: 1, keepGarage: 1, investTransactions: 1, investGarage: 1 })
  })

  it('定位商品字段差异并识别遗漏记录', () => {
    const source = makeData()
    const target = makeData()
    target.cars[0].name = '红色小车'
    target.cars.push({ sid: 'SID-5', name: '多出的车' })
    const report = verifyCarHistoryArchive(source, target, uiLayout)

    expect(report.dataPassed).toBe(false)
    expect(report.carDifferences).toContainEqual(expect.objectContaining({ sid: 'SID-1', field: '商品名称', source: '蓝色小车', archive: '红色小车' }))
    expect(report.carDifferences).toContainEqual(expect.objectContaining({ sid: 'SID-5', kind: '档案多出' }))
  })

  it('把贷款模块位置差异作为提醒显示，主模块及子标签仍通过结构核验', () => {
    const report = verifyCarHistoryArchive(makeData(), makeData(), uiLayout)

    expect(report.structurePassed).toBe(true)
    expect(report.structureWarnings).toContain('贷款入口位于 Payton\'s 数据；旧 car 位于投资小车模块')
  })
})
