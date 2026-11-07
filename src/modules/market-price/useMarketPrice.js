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

/** Owner-specific inventory classification used consistently by display and price linking. */
export function isMarketPriceEligible(item) {
  if (item?.status !== 'inventory') return false
  const owner = item?.owner || 'papa'
  if (owner === 'papa') return item?.isLongTerm === true
  if (owner === 'payton') return item?.isLongTerm !== true
  return false
}

export function getMarketPriceItems() {
  return store.items.filter(i => (i?.owner || 'papa') === store.currentOwner && isMarketPriceEligible(i))
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
 * 查找与指定 item 同 name+brand 且各自符合 Owner 分类规则的在库货品（包括自身）
 */
export function getLinkedItems(item) {
  return store.items.filter(i =>
    isMarketPriceEligible(i) &&
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

/** 将已有的同款市价补给未标价的合资格在库商品；冲突款整组跳过 */
export function syncMissingMarketPrices() {
  const groups = new Map()
  for (const item of store.items) {
    if (!isMarketPriceEligible(item)) continue
    const key = JSON.stringify([item?.name || '', item?.brand || ''])
    if (!groups.has(key)) groups.set(key, { name: item?.name || '', brand: item?.brand || '', items: [] })
    groups.get(key).items.push(item)
  }

  let updatedCount = 0
  let updatedGroupCount = 0
  const conflicts = []
  const now = new Date().toISOString()

  for (const group of groups.values()) {
    const priced = group.items.filter(isPriced)
    const unpriced = group.items.filter(item => !isPriced(item))
    if (!priced.length || !unpriced.length) continue

    const sources = new Map()
    for (const item of priced) {
      const rawPrice = getCurrentPrice(item)
      const price = Number(rawPrice)
      const key = Number.isFinite(price) ? price.toFixed(2) : 'invalid'
      const sourceKey = JSON.stringify([item?.owner || 'papa', key])
      const source = sources.get(sourceKey) || {
        owner: item?.owner || 'papa',
        price: Number.isFinite(price) ? price : null,
        count: 0,
      }
      source.count += 1
      sources.set(sourceKey, source)
    }

    const distinctPrices = new Set([...sources.values()].map(source => Number.isFinite(source.price) ? source.price.toFixed(2) : 'invalid'))
    if (distinctPrices.size > 1 || distinctPrices.has('invalid')) {
      conflicts.push({ name: group.name, brand: group.brand, unpricedCount: unpriced.length, sources: [...sources.values()] })
      continue
    }

    const price = Number(priced[0].marketPrices[0].price)
    for (const item of unpriced) item.marketPrices = [{ price, timestamp: now }]
    updatedCount += unpriced.length
    updatedGroupCount += 1
  }

  if (updatedCount || conflicts.length) {
    if (updatedCount) saveToLocalStorage()
    addOperationLog(
      'market_price_backfill',
      `一键同步已有标价：补齐 ${updatedCount} 件，跳过 ${conflicts.length} 款冲突`,
      { owner: 'all', updatedCount, updatedGroupCount, conflictCount: conflicts.length },
    )
  }

  return { updatedCount, updatedGroupCount, conflicts }
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
    syncMissingMarketPrices,
  }
}
