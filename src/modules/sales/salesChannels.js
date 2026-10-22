export const SALES_CHANNELS = ['PhtonRIng', '侧空翻棉', '其它']
export const DEFAULT_SALES_CHANNEL = 'PhtonRIng'
const SALES_CHANNEL_CUTOFF = '2026-10-15'

export function isSalesChannel(value) {
  return SALES_CHANNELS.includes(value)
}

export function inferLegacySalesChannel(date) {
  const dateText = String(date || '')
  const isValidDate = /^\d{4}-\d{2}-\d{2}$/.test(dateText) && !Number.isNaN(Date.parse(`${dateText}T00:00:00Z`))
  if (!isValidDate) return '其它'
  return dateText < SALES_CHANNEL_CUTOFF ? '其它' : DEFAULT_SALES_CHANNEL
}

export function filterSalesByShop(items = [], shop = '全部') {
  if (shop === '全部') return items
  return items.filter((item) => item?.saleDetails?.shop === shop)
}
