import { describe, expect, it } from 'vitest'
import { getCarHistoryArchiveRows } from './carHistoryArchiveRows'

const data = {
  accounts: {
    pocket: { transactions: [{ id: 'pocket-1', date: '2026-01-01' }, { id: 'pocket-2', date: '2026-02-01' }] },
    invest: { transactions: [{ id: 'invest-1' }], loans: [] },
  },
  cars: [
    { sid: 'keep-active', category: 'keep', isSold: false },
    { sid: 'keep-sold', category: 'keep', isSold: true },
    { sid: 'invest-active', category: 'invest', isSold: false },
    { sid: 'invest-sold', category: 'invest', isSold: true },
  ],
  transferPairs: [],
  expectedPrices: {},
  operationLogs: [],
}

describe('car 历史档案页面数据映射', () => {
  it('日常消费的收支明细显示零钱流水，而不是投资流水', () => {
    expect(getCarHistoryArchiveRows(data, { tab: 'daily', dailyTab: 'transactions' }).map(row => row.id))
      .toEqual(['pocket-2', 'pocket-1'])
  })

  it('投资小车的投资明细显示投资流水', () => {
    expect(getCarHistoryArchiveRows(data, { tab: 'invest', investTab: 'transactions' }).map(row => row.id))
      .toEqual(['invest-1'])
  })

  it('两个车库都隐藏已售车辆', () => {
    expect(getCarHistoryArchiveRows(data, { tab: 'daily', dailyTab: 'garage' }).map(row => row.sid))
      .toEqual(['keep-active'])
    expect(getCarHistoryArchiveRows(data, { tab: 'invest', investTab: 'garage' }).map(row => row.sid))
      .toEqual(['invest-active'])
  })
})
