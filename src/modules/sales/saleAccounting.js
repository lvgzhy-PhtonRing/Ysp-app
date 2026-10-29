function toNumber(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

export function getSaleNetProceeds(details = {}) {
  const price = toNumber(details.price)
  return price - toNumber(details.express) - price * toNumber(details.feeRate) - toNumber(details.deduction)
}

export function getSalePendingAmount(item) {
  const details = item?.saleDetails
  if (item?.status !== 'sold' || details?.isConfirmed !== false) return 0
  const price = toNumber(details.price)
  return price - price * toNumber(details.feeRate) - toNumber(details.deduction)
}

export function getUnconfirmedSalesTotal(items = []) {
  if (!Array.isArray(items)) return 0
  return items.reduce((total, item) => total + getSalePendingAmount(item), 0)
}
