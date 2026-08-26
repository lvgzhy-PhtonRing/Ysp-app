// 所有业务计算函数（纯函数，不依赖外部状态）

/**
 * 采购预成本：(originalPrice + domesticShipping + fee) × exchangeRate
 * 注：exchangeRate 为分摊比例（totalRMB / 各行原价运费费之和），故各行合计等于 totalRMB
 */
export function calcPreTransferCost(originalPrice, exchangeRate, domesticShipping, fee) {
  const price = Number(originalPrice)
  const rate = Number(exchangeRate)
  const shipping = Number(domesticShipping)
  const handling = Number(fee)
  if (!Number.isFinite(price) || !Number.isFinite(rate)) return 0
  return (price + shipping + handling) * rate
}

/**
 * 分摊转运费：(totalRMB × coefficient) / totalCoefficients
 */
export function calcTransferCost(totalRMB, coefficient, totalCoefficients) {
  return (Number(totalRMB) * Number(coefficient)) / Number(totalCoefficients)
}

/**
 * 单品成本：preTransferCost + transferCost
 */
export function calcItemCost(preTransferCost, transferCost) {
  return Number(preTransferCost) + Number(transferCost)
}

/**
 * 利润：price - express - (price × feeRate) - deduction - cost
 */
export function calcProfit(price, express, feeRate, deduction, cost) {
  const p = Number(price)
  return p - Number(express) - p * Number(feeRate) - Number(deduction) - Number(cost)
}

/**
 * 支付宝应有余额：debt + loanBalance + actualProfit - inventoryValue - unconfirmed + fund - purchaseCost
 */
export function calcAlipayBalance(
  debt,
  loanBalance,
  actualProfit,
  inventoryValue,
  unconfirmed,
  fund,
  purchaseCost,
) {
  return (
    Number(debt) +
    Number(loanBalance) +
    Number(actualProfit) -
    Number(inventoryValue) -
    Number(unconfirmed) +
    Number(fund) -
    Number(purchaseCost)
  )
}
