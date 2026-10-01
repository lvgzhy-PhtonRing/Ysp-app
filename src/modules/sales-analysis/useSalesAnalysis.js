// 销售分析数据聚合和计算逻辑

const DAYS_PER_MONTH = 30.4375

/**
 * 获取聚合 SKU 的 key
 * @param {object} item 商品对象
 * @returns {string} 聚合后的 SKU key
 */
export function getAggregateKey(item) {
  const brand = item.brand || '其它'
  
  // 非 Hotwheels 品牌，直接按品牌聚合
  if (brand !== 'Hotwheels') {
    return brand
  }
  
  // Hotwheels 细分：RLC / 非 RLC
  const name = (item.name || '').toUpperCase()
  if (name.includes('RLC') || name.includes('ELITE')) {
    return 'RLC'
  }
  return 'Hotwheels(非RLC)'
}

/**
 * 计算售出天数
 * @param {object} item 商品对象
 * @returns {number} 售出天数
 */
function calcSoldDays(item) {
  // 入库日期优先级：inventoryDetails.inStockDate > purchaseDetails.date
  const inDateStr = item.inventoryDetails?.inStockDate || item.purchaseDetails?.date
  if (!inDateStr) return 0
  
  const inDate = new Date(inDateStr).getTime()
  const soldDate = new Date(item.saleDetails?.date).getTime()
  
  if (!inDate || !soldDate) return 0
  
  return Math.max(0, (soldDate - inDate) / 86400000)
}

/**
 * 聚合已售商品为 SKU 分析数据
 * @param {Array} items 所有商品
 * @returns {Array} 聚合后的 SKU 数组
 */
export function aggregateSKUs(items = []) {
  // 过滤已售商品
  const soldItems = items.filter(i => i.status === 'sold')
  
  if (soldItems.length === 0) {
    return []
  }
  
  // 按聚合规则分组
  const groups = {}
  soldItems.forEach(item => {
    const skuKey = getAggregateKey(item)
    if (!groups[skuKey]) {
      groups[skuKey] = { key: skuKey, items: [] }
    }
    groups[skuKey].items.push(item)
  })
  
  // 计算每个 SKU 的指标
  const skus = Object.values(groups).map(group => {
    const { key, items } = group
    
    // 基础统计
    const totalQty = items.reduce((s, i) => s + (i.qty || 1), 0)
    const totalCost = items.reduce((s, i) => s + Number(i.cost || 0), 0)
    const totalProfit = items.reduce((s, i) => s + Number(i.saleDetails?.profit || 0), 0)
    const totalRevenue = items.reduce((s, i) => s + Number(i.saleDetails?.price || 0), 0)
    
    // 加权平均售出天数
    const totalWeightedDays = items.reduce((s, i) => {
      const days = calcSoldDays(i)
      const qty = i.qty || 1
      return s + days * qty
    }, 0)
    const avgDays = totalQty > 0 ? totalWeightedDays / totalQty : 0
    
    // 利润率 = 总利润 / 总成本
    const profitRate = totalCost > 0 ? totalProfit / totalCost : 0
    
    // 平均售价
    const avgPrice = totalQty > 0 ? totalRevenue / totalQty : 0
    
    return {
      key,
      totalQty,
      totalCost,
      totalProfit,
      totalRevenue,
      avgDays,
      profitRate,
      avgPrice,
      items: items.map(i => ({
        sid: i.sid,
        name: i.name,
        cost: i.cost,
        qty: i.qty || 1,
        price: i.saleDetails?.price || 0,
        profit: i.saleDetails?.profit || 0,
        soldDate: i.saleDetails?.date,
      })),
    }
  })
  
  // 按总利润降序排列
  return skus.sort((a, b) => b.totalProfit - a.totalProfit)
}

/**
 * 计算帕累托数据
 * @param {Array} skus 聚合后的 SKU 数组
 * @returns {object} { skus, cumulativePercentages, totalProfit }
 */
export function calcParetoData(skus = []) {
  const totalProfit = skus.reduce((s, k) => s + k.totalProfit, 0)
  
  if (totalProfit === 0) {
    return { skus, cumulativePercentages: skus.map(() => 0), totalProfit }
  }
  
  // 累计利润百分比
  let cumulative = 0
  const cumulativePercentages = skus.map(sku => {
    cumulative += sku.totalProfit
    return (cumulative / totalProfit) * 100
  })
  
  return { skus, cumulativePercentages, totalProfit }
}

/**
 * 获取周转速度颜色
 * @param {number} avgDays 平均售出天数
 * @returns {string} 颜色字符串
 */
export function getTurnoverColor(avgDays) {
  const days = Number(avgDays) || 0
  if (days < 90) {
    return 'rgba(34, 197, 94, 0.7)'   // 绿色：周转好
  }
  if (days < 180) {
    return 'rgba(234, 179, 8, 0.7)'   // 黄色：周转预警
  }
  return 'rgba(239, 68, 68, 0.7)'      // 红色：周转很慢
}

/**
 * 计算四象限统计
 * @param {Array} skus 聚合后的 SKU 数组
 * @returns {object} 各象限统计
 */
export function calcQuadrantStats(skus = []) {
  const stats = {
    ideal: { count: 0, profit: 0 },        // 左上：高利润 + 快周转
    highProfitSlow: { count: 0, profit: 0 }, // 右上：高利润 + 慢周转
    lowProfitFast: { count: 0, profit: 0 },  // 左下：低利润 + 快周转
    lowProfitSlow: { count: 0, profit: 0 },  // 右下：低利润 + 慢周转
  }
  
  skus.forEach(sku => {
    const isHighProfit = sku.profitRate >= 0.25
    const isFastTurnover = sku.avgDays < 90
    
    if (isHighProfit && isFastTurnover) {
      stats.ideal.count++
      stats.ideal.profit += sku.totalProfit
    } else if (isHighProfit && !isFastTurnover) {
      stats.highProfitSlow.count++
      stats.highProfitSlow.profit += sku.totalProfit
    } else if (!isHighProfit && isFastTurnover) {
      stats.lowProfitFast.count++
      stats.lowProfitFast.profit += sku.totalProfit
    } else {
      stats.lowProfitSlow.count++
      stats.lowProfitSlow.profit += sku.totalProfit
    }
  })
  
  return stats
}

/**
 * 获取四象限标签
 * @param {object} stats 象限统计
 * @returns {Array} 象限标签数组
 */
export function getQuadrantLabels(stats) {
  return [
    { label: '高利润·快周转', count: stats.ideal.count, profit: stats.ideal.profit, color: 'green' },
    { label: '高利润·慢周转', count: stats.highProfitSlow.count, profit: stats.highProfitSlow.profit, color: 'orange' },
    { label: '低利润·快周转', count: stats.lowProfitFast.count, profit: stats.lowProfitFast.profit, color: 'blue' },
    { label: '低利润·慢周转', count: stats.lowProfitSlow.count, profit: stats.lowProfitSlow.profit, color: 'red' },
  ]
}

/**
 * 计算品类双轴图表数据（加权平均）
 * @param {Array} skus 聚合后的 SKU 数组
 * @returns {Array} 双轴图表数据
 */
export function calcCategoryDualAxisData(skus = []) {
  if (skus.length === 0) return []
  
  return skus.map(sku => {
    // 加权平均利润率 = 总利润 / 总成本
    const profitRate = sku.totalCost > 0 ? sku.totalProfit / sku.totalCost : 0
    
    // 加权平均售出天数（用销售金额加权）
    // 实际上 SKU 聚合后已经计算了 avgDays，这里直接用
    const avgDays = sku.avgDays
    
    return {
      key: sku.key,
      profitRate,
      avgDays,
      totalProfit: sku.totalProfit,
      totalRevenue: sku.totalRevenue,
    }
  })
}

/**
 * 计算利润贡献饼图数据
 * @param {Array} skus 聚合后的 SKU 数组
 * @returns {Array} 饼图数据 + 表格数据
 */
export function calcProfitContributionData(skus = []) {
  const totalProfit = skus.reduce((s, k) => s + k.totalProfit, 0)
  
  if (totalProfit === 0) {
    return {
      pieData: skus.map(s => ({ label: s.key, value: 0 })),
      tableData: skus.map(s => ({ label: s.key, percentage: 0, avgDays: s.avgDays })),
      totalProfit: 0,
    }
  }
  
  return {
    pieData: skus.map(s => ({
      label: s.key,
      value: (s.totalProfit / totalProfit) * 100,
    })),
    tableData: skus.map(s => ({
      label: s.key,
      percentage: (s.totalProfit / totalProfit) * 100,
      avgDays: s.avgDays,
      totalProfit: s.totalProfit,
    })),
    totalProfit,
  }
}
