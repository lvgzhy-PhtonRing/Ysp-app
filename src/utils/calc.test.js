// calc.js 单元测试（基于旧系统真实数据）

import { describe, expect, it } from 'vitest'
import {
  calcAlipayBalance,
  calcItemCost,
  calcPreTransferCost,
  calcProfit,
  calcTransferCost,
} from './calc'

describe('calc utilities', () => {
  it('calcPreTransferCost should match legacy behavior (domestic + fee multiplied)', () => {
    expect(calcPreTransferCost(13400, 0.041924095322153576, 300, 0)).toBeCloseTo(861.782877316858, 6)
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
    expect(calcAlipayBalance(100, 20, 30, 10, 5)).toBeCloseTo(145, 6)
  })
})
