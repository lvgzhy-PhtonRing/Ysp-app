const AVG_DAYS_PER_MONTH = 30.4375

export const BATCH_FALLBACK_DATES = {
  '2025JAPAN / 2025JAPAN': '2025-08-01',
  '美淘 / A组下半年': '2025-11-01',
  '美淘 / B组下半年': '2025-12-30',
  '日淘 / a批': '2025-11-02',
  '日淘 / b批': '2025-12-30',
  '日淘 / d批': '2026-01-15',
  '日淘 / 预订': '2025-12-15',
}

function toDateOnly(value = '') {
  return String(value || '').trim().slice(0, 10)
}

function getTime(dateStr = '') {
  const t = new Date(dateStr).getTime()
  return Number.isFinite(t) ? t : NaN
}

function calcMonthsFromInStockDate(inStockDate, nowTs) {
  const inStockTs = getTime(inStockDate)
  if (!Number.isFinite(inStockTs)) return 0
  return Math.max(0, (nowTs - inStockTs) / (1000 * 60 * 60 * 24 * AVG_DAYS_PER_MONTH))
}

function buildTransferDateMap(transfers = []) {
  const map = new Map()
  ;(transfers || []).forEach((t) => {
    const transferId = String(t?.transferId || '').trim()
    const date = toDateOnly(t?.date)
    if (!transferId || !date) return
    if (!map.has(transferId)) {
      map.set(transferId, date)
      return
    }
    // 同 transferId 多条时，取最早日期作为入库参考
    const prev = map.get(transferId)
    map.set(transferId, String(date) < String(prev) ? date : prev)
  })
  return map
}

export function buildInventoryAgingRows(items = [], transfers = [], now = new Date()) {
  const transferDateMap = buildTransferDateMap(transfers)
  const nowTs = now.getTime()

  return (items || [])
    // 带源数组索引：数据存在重复 id，不能用 id 当唯一键
    .map((item, sourceIndex) => ({ item, sourceIndex }))
    .filter(({ item }) => item?.status === 'inventory')
    .map(({ item, sourceIndex }) => {
      const category = String(item?.category || '未分类')
      const batch = String(item?.batch || '未分批')
      const pd = item?.purchaseDetails || {}
      const transferId = String(pd?.transferId || '').trim()
      const purchaseDate = toDateOnly(pd?.date)

      const inStockDateFromRecord = toDateOnly(item?.inventoryDetails?.inStockDate)
      let source = '未知'
      let inStockDate = ''

      if (inStockDateFromRecord) {
        source = '入库日'
        inStockDate = inStockDateFromRecord
      } else if (transferId && transferDateMap.has(transferId)) {
        source = '转运日'
        inStockDate = transferDateMap.get(transferId)
      } else if (purchaseDate) {
        source = '采购日'
        inStockDate = purchaseDate
      } else {
        const fallbackKey = `${category} / ${batch}`
        const fallbackDate = BATCH_FALLBACK_DATES[fallbackKey]
        if (fallbackDate) {
          source = '批次'
          inStockDate = fallbackDate
        }
      }

      // 统一口径：库龄只从“入库日期(inStockDate)”开始计算
      const monthsInStock = calcMonthsFromInStockDate(inStockDate, nowTs)

      return {
        // 唯一行键：源数组索引。数据里存在重复 id（同一 id 多条记录），
        // 用 id 当 Vue key 会让 diff 错乱——切换 短线/长线 视图时行残留显示
        rowKey: sourceIndex,
        id: item?.id,
        sid: item?.sid,
        name: item?.name,
        brand: item?.brand,
        category,
        batch,
        cost: Number(item?.cost || 0),
        qty: Number(item?.qty || 1),
        isLongTerm: item?.isLongTerm === true,
        source,
        inStockDate,
        purchaseDate,
        transferId,
        monthsInStock,
      }
    })
}

/**
 * 按 sid|name 合并账龄行（与库存列表 mergeItemsBySidName 口径一致）。
 * - qty：组内求和
 * - cost：单价，取组内第一条
 * - 货值：单价 × 总数量
 * - monthsInStock：按金额加权的平均库龄（货值大的一批权重高）
 * - inStockDate / source：取组内最早入库日期
 * - rowKey：沿用组内首条的 rowKey（仍唯一）
 */
export function groupInventoryAgingRows(rows = []) {
  const map = new Map()
  for (const r of rows) {
    if (!r) continue
    const key = `${r.sid || ''}|${r.name || ''}`
    const amount = Number(r.cost || 0) * Number(r.qty || 1)
    if (!map.has(key)) {
      map.set(key, {
        ...r,
        qty: Number(r.qty || 1),
        totalAmount: amount,
        weightedMonths: amount * Number(r.monthsInStock || 0),
        // 组内最大库龄 = 最早入库那批的库龄，作为金额为 0 时的退化值
        maxMonths: Number(r.monthsInStock || 0),
        earliestDate: r.inStockDate,
      })
      continue
    }
    const g = map.get(key)
    g.qty += Number(r.qty || 1)
    g.totalAmount += amount
    g.weightedMonths += amount * Number(r.monthsInStock || 0)
    g.maxMonths = Math.max(g.maxMonths, Number(r.monthsInStock || 0))
    if (r.inStockDate && (!g.earliestDate || String(r.inStockDate) < String(g.earliestDate))) {
      g.earliestDate = r.inStockDate
      g.inStockDate = r.inStockDate
      g.source = r.source
    }
  }
  return Array.from(map.values()).map((g) => ({
    ...g,
    // 金额权重全为 0（cost=0）时，加权平均无定义，
    // 退化为组内最大库龄，避免把真实库龄清零
    monthsInStock: g.totalAmount > 0 ? g.weightedMonths / g.totalAmount : g.maxMonths,
    // 清理合并过程中的中间字段
    totalAmount: undefined,
    weightedMonths: undefined,
    maxMonths: undefined,
    earliestDate: undefined,
  }))
}
