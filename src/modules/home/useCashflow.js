// 现金流与负债数据按月聚合（纯函数，无副作用）

/**
 * 判断日期字符串是否匹配指定年/月
 */
function monthMatch(dateStr, year, month) {
  if (!dateStr) return false
  const d = new Date(dateStr)
  return !isNaN(d.getTime()) && d.getFullYear() === year && d.getMonth() + 1 === month
}

/**
 * 生成最近 n 个月的年/月数组（按时间顺序，旧→新）
 */
function getLastNMonths(now, n) {
  const months = []
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    months.push({ year: d.getFullYear(), month: d.getMonth() + 1 })
  }
  return months
}

/**
 * 获取某月的前一个月
 */
function prevMonth(year, month) {
  if (month === 1) return { year: year - 1, month: 12 }
  return { year, month: month - 1 }
}

/**
 * 主函数：按月聚合净回款、库存消化、采购投入、新增负债
 * @param {object} store - reactive state from store.js
 * @param {Date}   now   - 当前日期
 * @returns {{ current, last5Months }}
 */
export function getCashflowData(store, now = new Date()) {
  const items = store.items || []
  const snapshots = store.snapshots || []

  // 当月借贷余额（从 live state 实时计算）
  const loanBalance = (store.loanRecords || []).reduce((sum, l) => {
    if (l?.isRepaid || l?.repaid) return sum
    return sum + (l?.type === 'borrow' ? Number(l?.amount || 0) : -Number(l?.amount || 0))
  }, 0)
  // 当月负债总规模 = 挖财总负债 + 借贷余额
  const currentDebt = Number(store.calc?.debt || 0) + loanBalance

  // 当月净回款（profit + cost，利用已有利润结果避免重复计算费率/扣减）
  function netCollection(year, month) {
    return items
      .filter(i => i?.status === 'sold' && monthMatch(i?.saleDetails?.date, year, month))
      .reduce((s, i) => s + Number(i?.saleDetails?.profit || 0) + Number(i?.cost || 0), 0)
  }

  // 当月库存消化（售出商品 cost 总和）
  function inventoryDigestion(year, month) {
    return items
      .filter(i => i?.status === 'sold' && monthMatch(i?.saleDetails?.date, year, month))
      .reduce((s, i) => s + Number(i?.cost || 0), 0)
  }

  // 当月采购总投入（按 purchaseDetails.date 聚合，日淘+美淘+国内统算）
  function procurement(year, month) {
    return items
      .filter(i => monthMatch(i?.purchaseDetails?.date, year, month))
      .reduce((s, i) => s + Number(i?.cost || 0), 0)
  }

  // 某月负债总规模（从快照取月最后一条记录的 calc.debt + finance.loanBalance）
  function absoluteDebt(year, month) {
    const monthSnaps = snapshots
      .filter(s => monthMatch(s?.date, year, month))
      .sort((a, b) => (b?.date || '').localeCompare(a?.date || ''))
    if (monthSnaps.length === 0) return null
    const last = monthSnaps[0]
    return Number(last.calc?.debt || 0) + Number(last.finance?.loanBalance || 0)
  }

  // 某月新增负债 = 当月总负债 - 上月总负债
  function newDebt(year, month, liveDebt) {
    const cur = (liveDebt !== undefined) ? liveDebt : absoluteDebt(year, month)
    const pm = prevMonth(year, month)
    const prev = absoluteDebt(pm.year, pm.month)
    if (cur == null || prev == null) return null
    return cur - prev
  }

  // 构建单月数据对象（debt 字段 = 新增负债）
  function buildMonth(year, month, liveDebt) {
    return {
      year,
      month,
      netCollection: netCollection(year, month),
      inventoryDigestion: inventoryDigestion(year, month),
      procurement: procurement(year, month),
      debt: newDebt(year, month, liveDebt),
    }
  }

  const curYear = now.getFullYear()
  const curMonth = now.getMonth() + 1

  // 当月
  const current = buildMonth(curYear, curMonth, currentDebt)

  // 最近 5 个月（旧→新），当月用 live 负债
  const last5Months = getLastNMonths(now, 5).map(m =>
    buildMonth(m.year, m.month, (m.year === curYear && m.month === curMonth) ? currentDebt : undefined)
  )

  return { current, last5Months }
}
