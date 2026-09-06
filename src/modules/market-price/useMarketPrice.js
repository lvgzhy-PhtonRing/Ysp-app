// 市场价格模块逻辑层（无 UI）
import { addOperationLog, saveToLocalStorage, state as store } from '../../data/store'

const MAX_PRICE_HISTORY = 100
const UNCATEGORIZED_BRAND = '(未分类)'

/**
 * 获取当前市价（最新一条）
 */
export function getCurrentPrice(item) {
  if (!item?.marketPrices || !Array.isArray(item.marketPrices) || item.marketPrices.length === 0) return null
  return item.marketPrices[0].price
}

/**
 * 获取涨跌幅 (当前市价 - 成本) / 成本
 */
export function getChangeRate(item) {
  const price = getCurrentPrice(item)
  const cost = Number(item?.cost || 0)
  if (price === null || cost === 0) return null
  return (price - cost) / cost
}

/**
 * 判断是否已标价
 */
export function isPriced(item) {
  return Array.isArray(item?.marketPrices) && item.marketPrices.length > 0
}

/**
 * 获取所有应参与市场价格计算的长线货品（isLongTerm===true）
 */
export function getMarketPriceItems() {
  return store.items.filter(i => i?.isLongTerm === true && i?.status === 'inventory')
}

/**
 * 按 brand 分组，返回 Map<brand, items[]>
 */
export function groupByBrand(items) {
  const map = new Map()
  for (const item of items) {
    const brand = item?.brand || UNCATEGORIZED_BRAND
    if (!map.has(brand)) map.set(brand, [])
    map.get(brand).push(item)
  }
  return map
}

/**
 * 计算品牌统计
 * returns [{ brand, totalValue, totalCost, changeRate, pricedCount, totalCount }]
 */
export function getBrandStats(items) {
  const groups = groupByBrand(items)
  const result = []
  for (const [brand, brandItems] of groups) {
    const priced = brandItems.filter(isPriced)
    const totalValue = priced.reduce((s, i) => s + (getCurrentPrice(i) || 0), 0)
    const totalCost = priced.reduce((s, i) => s + Number(i.cost || 0), 0)
    const changeRate = totalCost > 0 ? (totalValue - totalCost) / totalCost : 0
    result.push({
      brand,
      totalValue,
      totalCost,
      changeRate,
      pricedCount: priced.length,
      totalCount: brandItems.length,
    })
  }
  // 按涨跌幅降序
  result.sort((a, b) => b.changeRate - a.changeRate)
  return result
}

/**
 * 计算全局统计
 */
export function getGlobalStats(items) {
  const priced = items.filter(isPriced)
  const totalValue = priced.reduce((s, i) => s + (getCurrentPrice(i) || 0), 0)
  const totalCost = priced.reduce((s, i) => s + Number(i.cost || 0), 0)
  const profitCount = priced.filter(i => (getChangeRate(i) || 0) > 0).length
  const lossCount = priced.filter(i => (getChangeRate(i) || 0) < 0).length
  return {
    totalValue,
    totalCost,
    totalCount: items.length,
    pricedCount: priced.length,
    unPricedCount: items.length - priced.length,
    totalProfit: totalValue - totalCost,
    totalRate: totalCost > 0 ? (totalValue - totalCost) / totalCost : 0,
    profitCount,
    lossCount,
  }
}

/**
 * 获取涨跌幅排行 TOP N
 */
export function getTopChanges(items, n = 5) {
  const priced = items.filter(isPriced)
  const withRate = priced.map(i => ({ item: i, rate: getChangeRate(i) || 0 }))
  const gainers = [...withRate].sort((a, b) => b.rate - a.rate).slice(0, n)
  const losers = [...withRate].sort((a, b) => a.rate - b.rate).slice(0, n)
  return { gainers, losers }
}

/**
 * 查找与指定 item 同 name+brand 的长线货品（包括自身）
 */
export function getLinkedItems(item) {
  return store.items.filter(i =>
    i?.isLongTerm === true &&
    i?.name === item.name &&
    i?.brand === item.brand
  )
}

/**
 * 更新市场价格：为 item 及其所有联动货品追加一条价格记录
 * @param {object} item - 触发更新的货品
 * @param {number} newPrice - 新市场价格
 * @returns {{ updatedCount: number }} 更新的货品数
 */
export function updateMarketPrice(item, newPrice) {
  const price = Number(newPrice)
  if (!Number.isFinite(price) || price < 0) {
    throw new Error('市场价格必须为有效正数')
  }

  const linked = getLinkedItems(item)
  const now = new Date().toISOString()

  for (const target of linked) {
    if (!Array.isArray(target.marketPrices)) {
      target.marketPrices = []
    }
    target.marketPrices.unshift({ price, timestamp: now })
    // 截断至 MAX_PRICE_HISTORY 条
    if (target.marketPrices.length > MAX_PRICE_HISTORY) {
      target.marketPrices.length = MAX_PRICE_HISTORY
    }
  }

  saveToLocalStorage()
  addOperationLog('market_price_update', `更新市场价格: ${item.name} ¥${price.toFixed(0)}`, {
    sid: item.sid,
    name: item.name,
    brand: item.brand,
    price: price,
    linkedCount: linked.length,
  })

  return { updatedCount: linked.length }
}

/**
 * 聚合函数：返回所有工具函数
 * 保持与 useInventory.js 一致的导出模式
 */
export function useMarketPrice() {
  return {
    getCurrentPrice,
    getChangeRate,
    isPriced,
    getMarketPriceItems,
    groupByBrand,
    getBrandStats,
    getGlobalStats,
    getTopChanges,
    getLinkedItems,
    updateMarketPrice,
  }
}
