export function buildInventorySalePayload(form, index, count) {
  const quantity = Math.max(1, Number(count) || 1)
  const avgPrice = Number(form.price || 0) / quantity
  return {
    price: index === quantity - 1
      ? Number(form.price || 0) - avgPrice * (quantity - 1)
      : avgPrice,
    express: index === 0 ? Number(form.express || 0) : 0,
    feeRate: Number(form.feeRate || 0),
    deduction: index === 0 ? Number(form.deduction || 0) : 0,
    date: form.date,
    shop: form.shop,
  }
}
