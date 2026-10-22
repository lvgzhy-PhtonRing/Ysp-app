import { beforeEach, describe, expect, it } from 'vitest'
import { h } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { loadData, state as store } from '../../data/store'
import HomeModule from './HomeModule.vue'

describe('HomeModule owner layout and balance display', () => {
  beforeEach(() => {
    loadData({
      items: [],
      calc: { debt: 0, unconfirmed: 0, forwarderBalance: 0, watchBalance: 0 },
      ownerRegistry: {
        papa: {},
        payton: {
          pocketBalance: -290.96,
          investBalance: 366.54,
          loans: [{ id: 'active', status: 'active', remaining: 4000 }, { id: 'paid', status: 'repaid', remaining: 500 }],
        },
      },
    })
  })

  it('places global modules before the current-owner group and shows live Payton formula', async () => {
    const html = await renderToString(h(HomeModule))
    const positions = ['支付宝余额计算器', '商品查询器', '各批次回款统计', 'Owner 经营数据', '本月数据', '近三个月销售数据', '现金流与负债监控'].map((text) => html.indexOf(text))

    expect(positions.every((position) => position >= 0)).toBe(true)
    expect(positions).toEqual([...positions].sort((a, b) => a - b))
    expect(html).toContain('实际支付宝余额')
    expect(html).toContain('−¥290.96')
    expect(html).toContain('¥366.54')
    expect(html).toContain('－ 贷款剩余')
    expect(html).toContain('¥4000.00')
    expect(html).toContain('−¥3924.42')
    expect(store.ownerRegistry.payton.loans).toHaveLength(2)
  })

  it('keeps the Alipay loan and public expense inputs on Papa values when the selected owner changes', async () => {
    loadData({
      finance: { loans: [
        { owner: 'papa', type: 'borrow', amount: 6000 },
        { owner: 'payton', type: 'borrow', amount: 900 },
      ], records: [
        { owner: 'papa', type: 'expense', amount: 20 },
        { owner: 'payton', type: 'expense', amount: 100 },
      ] },
    })

    const renderInputs = async (owner) => {
      store.currentOwner = owner
      const html = await renderToString(h(HomeModule))
      return {
        loan: html.match(/借贷余额<\/label><div[^>]*>([^<]+)/)?.[1],
        publicExpense: html.match(/公共支出<\/label><div[^>]*>([^<]+)/)?.[1],
      }
    }

    expect(await renderInputs('papa')).toEqual({ loan: '6000.00', publicExpense: '20.00' })
    expect(await renderInputs('payton')).toEqual({ loan: '6000.00', publicExpense: '20.00' })
  })
})
