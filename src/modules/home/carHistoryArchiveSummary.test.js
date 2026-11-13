import { describe, expect, it } from 'vitest'
import { getCarHistoryArchiveSummary, getCarHistoryMonthlySpending } from './carHistoryArchiveSummary'

describe('car 历史档案账户与现金流摘要', () => {
  it('按旧 car 口径汇总零钱、投资余额、买卖车与活动贷款', () => {
    const data = {
      accounts: {
        pocket: { name: '零花钱账户', monthlyAllowance: 200, transactions: [{ type: 'income', amount: 40 }, { type: 'expense', amount: 12 }] },
        invest: { transactions: [{ type: 'expense', category: 'car_buy', amount: 80 }, { type: 'income', category: 'car_sell', amount: 150 }], loans: [{ status: 'active', amount: 500 }, { status: 'overdue', amount: 100 }, { status: 'repaid', amount: 200 }] },
      },
    }

    expect(getCarHistoryArchiveSummary(data)).toMatchObject({
      pocketBalance: 28, pocketName: '零花钱账户', monthlyAllowance: 200,
      investBalance: 70, loanTotal: 500, loanCount: 1, carBuySpent: 80, sellIncome: 150,
    })
  })

  it('按旧 car 口径列出最近六个月收入、支出和平衡差额', () => {
    const months = getCarHistoryMonthlySpending([
      { date: '2026-06-02', type: 'income', amount: 100 },
      { date: '2026-06-03', type: 'expense', amount: 30 },
      { date: '2026-11-01', type: 'expense', amount: 10 },
    ], new Date('2026-11-13T12:00:00'))

    expect(months).toHaveLength(6)
    expect(months.map(row => row.key)).toEqual(['2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11'])
    expect(months[0]).toMatchObject({ income: 100, expense: 30, net: 70 })
    expect(months[5]).toMatchObject({ income: 0, expense: 10, net: -10 })
  })
})
