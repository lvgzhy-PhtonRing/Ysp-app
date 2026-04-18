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
    .filter((item) => item?.status === 'inventory' && item?.isLongTerm !== true)
    .map((item) => {
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
        id: item?.id,
        sid: item?.sid,
        name: item?.name,
        brand: item?.brand,
        category,
        batch,
        cost: Number(item?.cost || 0),
        source,
        inStockDate,
        purchaseDate,
        transferId,
        monthsInStock,
      }
    })
}
