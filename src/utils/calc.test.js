// calc.js 单元测试（基于旧系统真实数据）

import { describe, expect, it } from 'vitest'
import {
  buildAlipayBreakdown,
  calcAlipayBalance,
  calcItemCost,
  calcPreTransferCost,
  calcProfit,
  calcTransferCost,
} from './calc'

describe('calc utilities', () => {
  it('calcPreTransferCost should multiply domestic + fee by rate', () => {
    // 分摊口径：(原价 + 国内运费 + 手续费) × 分摊汇率（各行合计 = totalRMB）
    expect(calcPreTransferCost(13400, 0.041924095322153576, 300, 0)).toBeCloseTo(574.360105913504, 6)
    expect(calcPreTransferCost(25, 7.2, 1.6, 0)).toBeCloseTo(191.52, 6)
  })

  it('calcProfit should match real data (±0.01)', () => {
    const result = calcProfit(1793.41, 0, 0, 0, 1654.69)
    expect(result).toBeCloseTo(138.72, 2)
  })

  it('calcTransferCost should allocate by coefficient', () => {
    expect(calcTransferCost(100, 2, 5)).toBeCloseTo(40, 6)
  })

  it('calcItemCost should sum costs', () => {
    expect(calcItemCost(120.5, 30.25)).toBeCloseTo(150.75, 6)
  })

  it('calcAlipayBalance should compute expected formula', () => {
    // 新公式（与 HomeModule 界面一致）：
    // debt + loanBalance + actualProfit - inventoryValue - unconfirmed + fund - purchaseCost
    expect(calcAlipayBalance(100, 20, 30, 10, 5, 2, 8)).toBeCloseTo(129, 6)
  })

  it('buildAlipayBreakdown should group by incoming/outgoing with subtotals', () => {
    const b = buildAlipayBreakdown(108504.41, 6000, 21512, 94821.31, 1006, -4887.14, 37398.38)
    expect(b.incoming.map((x) => x.label)).toEqual(['挖财总负债', '借贷余额', '总实盈利润'])
    expect(b.outgoing.map((x) => x.label)).toEqual(['库存总货值', '采购中金额', '未确认交易', "Payton's基金"])
    expect(b.inSubtotal).toBeCloseTo(136016.41, 2)
    expect(b.outSubtotal).toBeCloseTo(-138112.83, 2)
    // 基金是负值(借出)，出栏中直接取 fund
    expect(b.outgoing[3].value).toBe(-4887.14)
    // 两栏小计与应有余额恒等式：进 + 出 = 应有余额
    expect(b.inSubtotal + b.outSubtotal).toBeCloseTo(
      calcAlipayBalance(108504.41, 6000, 21512, 94821.31, 1006, -4887.14, 37398.38),
      2,
    )
  })
})
