export function getMonthStats(items = [], now = new Date()) {
  const y = now.getFullYear()
  const m = now.getMonth() + 1
  const monthItems = items.filter((i) => {
    if (i?.status !== 'sold') return false
    const d = i?.saleDetails?.date || ''
    if (!d) return false
    const dt = new Date(d)
    return dt.getFullYear() === y && dt.getMonth() + 1 === m
  })

  const revenue = monthItems.reduce((s, i) => s + Number(i?.saleDetails?.price || 0), 0)
  const cost = monthItems.reduce((s, i) => s + Number(i?.cost || 0), 0)
  const profit = monthItems.reduce((s, i) => s + Number(i?.saleDetails?.profit || 0), 0)
  return { revenue, cost, profit }
}

export function getLast3MonthsStats(items = [], now = new Date()) {
  const result = []
  for (let i = 0; i < 3; i += 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const year = d.getFullYear()
    const month = d.getMonth() + 1
    const monthItems = items.filter((it) => {
      if (it?.status !== 'sold') return false
      const sd = it?.saleDetails?.date
      if (!sd) return false
      const dt = new Date(sd)
      return dt.getFullYear() === year && dt.getMonth() + 1 === month
    })

    const revenue = monthItems.reduce((s, it) => s + Number(it?.saleDetails?.price || 0), 0)
    const cost = monthItems.reduce((s, it) => s + Number(it?.cost || 0), 0)
    const profit = monthItems.reduce((s, it) => s + Number(it?.saleDetails?.profit || 0), 0)

    result.push({ year, month, count: monthItems.length, revenue, cost, profit })
  }
  return result
}

export function getPurchaseStatus(items = []) {
  const purchaseItems = items.filter((i) => i?.status === 'purchase')
  const inProgressAmount = purchaseItems.reduce((s, i) => s + Number(i?.cost || 0), 0)
  const purchaseAmount = purchaseItems.reduce((s, i) => s + Number(i?.purchaseDetails?.preTransferCost || 0), 0)
  const transferAmount = purchaseItems.reduce((s, i) => s + Number(i?.purchaseDetails?.transferCost || 0), 0)
  const pendingCount = purchaseItems.filter(
    (i) => (i?.purchaseDetails?.transferStatus || 'pending') === 'pending',
  ).length

  return {
    count: purchaseItems.length,
    inProgressAmount,
    purchaseAmount,
    transferAmount,
    pendingCount,
    totalCost: inProgressAmount,
  }
}

export function getBatchReturnStats(items = []) {
  const batchMap = {}
  const categoryMap = {
    '2025JAPAN': { category: '2025JAPAN', totalCost: 0, revenue: 0 },
    美淘: { category: '美淘', totalCost: 0, revenue: 0 },
    日淘: { category: '日淘', totalCost: 0, revenue: 0 },
    国内: { category: '国内', totalCost: 0, revenue: 0 },
  }

  const categoryOrder = { '2025JAPAN': 1, 美淘: 2, 日淘: 3, 国内: 4 }
  const batchOrder = {
    美淘: { A组上半年: 1, A组下半年: 2, B组下半年: 3, '26上半年': 4 },
    日淘: { a批: 1, b批: 2, d批: 3, 预订: 4, 预订批: 4, '26d批': 5, '26e批': 6, '26f批': 7 },
  }

  // 成本口径：批次/分类/汇总统一使用「全量成本」

  const allCostMap = {}
  const allCategoryCostMap = {}
  items.forEach((item) => {
    const key = `${item?.category}|${item?.batch}`
    allCostMap[key] = (allCostMap[key] || 0) + Number(item?.cost || 0)
    allCategoryCostMap[item?.category] = (allCategoryCostMap[item?.category] || 0) + Number(item?.cost || 0)
    if (!batchMap[key]) {
      batchMap[key] = {
        category: item?.category,
        batch: item?.batch,
        totalCost: 0,
        revenue: 0,
      }
    }
  })

  // 旧版关键口径：销售额先按 sid+日期 去重分组，按单笔成交累加
  const saleGroups = {}
  items.forEach((item) => {
    if (item?.status !== 'sold') return
    const groupKey = `${item?.sid || ''}|${item?.saleDetails?.date || ''}`
    if (!saleGroups[groupKey]) {
      saleGroups[groupKey] = {
        sid: item?.sid,
        category: item?.category,
        batch: item?.batch,
        price: Number(item?.totalPrice || item?.saleDetails?.price || 0),
      }
    }
  })

  Object.values(saleGroups).forEach((sale) => {
    const key = `${sale.category}|${sale.batch}`
    if (!batchMap[key]) {
      batchMap[key] = { category: sale.category, batch: sale.batch, totalCost: 0, revenue: 0 }
    }
    batchMap[key].revenue += sale.price

    if (categoryMap[sale.category]) {
      categoryMap[sale.category].revenue += sale.price
    }
  })

  Object.keys(batchMap).forEach((key) => {
    batchMap[key].totalCost = Number(allCostMap[key] || 0)
  })

  Object.keys(categoryMap).forEach((cat) => {
    categoryMap[cat].totalCost = Number(allCategoryCostMap[cat] || 0)
  })

  const categoryResults = Object.values(categoryMap)
    .map((c) => ({
      ...c,
      batch: '',
      isCategory: true,
      rate: c.totalCost > 0 ? (c.revenue / c.totalCost) * 100 : 0,
    }))
    .filter((c) => c.totalCost > 0)

  const batchResults = Object.values(batchMap).map((b) => ({
    ...b,
    rate: b.totalCost > 0 ? (b.revenue / b.totalCost) * 100 : 0,
  }))

  const sortedBatches = batchResults.sort((a, b) => {
    const catOrderA = categoryOrder[a.category] || 99
    const catOrderB = categoryOrder[b.category] || 99
    if (catOrderA !== catOrderB) return catOrderA - catOrderB

    const orderA = batchOrder[a.category]?.[a.batch] || 99
    const orderB = batchOrder[b.category]?.[b.batch] || 99
    return orderA - orderB
  })

  const sortedCategories = categoryResults.sort((a, b) => {
    const orderA = categoryOrder[a.category] || 99
    const orderB = categoryOrder[b.category] || 99
    return orderA - orderB
  })

  const result = []
  sortedCategories.forEach((cat) => {
    result.push(cat)
    result.push(...sortedBatches.filter((b) => b.category === cat.category))
  })

  let allTotalCost = 0
  let allRevenue = 0
  Object.keys(allCostMap).forEach((k) => {
    allTotalCost += Number(allCostMap[k] || 0)
  })
  Object.values(batchMap).forEach((b) => {
    allRevenue += b.revenue
  })

  result.push({
    category: '汇总',
    batch: '',
    totalCost: allTotalCost,
    revenue: allRevenue,
    rate: allTotalCost > 0 ? (allRevenue / allTotalCost) * 100 : 0,
    isCategory: false,
    isSummary: true,
  })

  return result
}

function normalizeText(v = '') {
  return String(v || '')
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[\-_/.,，。；;:：()（）\[\]【】]/g, '')
}

function isSubsequence(query = '', target = '') {
  if (!query || !target) return false
  let qi = 0
  for (let i = 0; i < target.length && qi < query.length; i += 1) {
    if (target[i] === query[qi]) qi += 1
  }
  return qi === query.length
}

function statusKeywords(status = '') {
  if (status === 'sold') return ['sold', '已售']
  if (status === 'inventory') return ['inventory', '库存', '在库']
  if (status === 'purchase') return ['purchase', '采购', '采购中']
  return [String(status || '')]
}

function itemSearchText(item = {}) {
  const purchase = item?.purchaseDetails || {}
  return [
    item?.sid,
    item?.name,
    item?.brand,
    item?.category,
    item?.batch,
    purchase?.website,
    purchase?.websiteAccount,
    purchase?.paymentAccount,
    purchase?.paymentBatch,
    ...statusKeywords(item?.status),
  ]
    .filter(Boolean)
    .join(' ')
}

export function searchItems(items = [], keyword = '') {
  const raw = String(keyword || '').trim().toLowerCase()
  if (!raw) return []

  const normalizedKw = normalizeText(raw)
  const tokens = raw.split(/\s+/).filter(Boolean)
  const normalizedTokens = tokens.map((t) => normalizeText(t)).filter(Boolean)

  const scored = items
    .map((item) => {
      const sid = String(item?.sid || '').toLowerCase()
      const name = String(item?.name || '').toLowerCase()
      const brand = String(item?.brand || '').toLowerCase()
      const text = itemSearchText(item).toLowerCase()

      const sidNorm = normalizeText(sid)
      const nameNorm = normalizeText(name)
      const brandNorm = normalizeText(brand)
      const textNorm = normalizeText(text)

      let score = 0
      const reasons = new Set()

      // 精确匹配优先级最高
      if (sid === raw) {
        score += 300
        reasons.add('SID精确')
      }
      if (sidNorm === normalizedKw) {
        score += 260
        reasons.add('SID标准化')
      }
      if (name === raw) {
        score += 220
        reasons.add('名称精确')
      }
      if (nameNorm === normalizedKw) {
        score += 180
        reasons.add('名称标准化')
      }
      if (brand === raw) {
        score += 140
        reasons.add('品牌精确')
      }

      // 常规包含匹配
      if (sid.includes(raw)) {
        score += 160
        reasons.add('SID命中')
      }
      if (name.includes(raw)) {
        score += 120
        reasons.add('名称命中')
      }
      if (brand.includes(raw)) {
        score += 90
        reasons.add('品牌命中')
      }
      if (text.includes(raw)) {
        score += 50
        reasons.add('综合字段命中')
      }

      if (sidNorm.includes(normalizedKw)) {
        score += 120
        reasons.add('SID模糊')
      }
      if (nameNorm.includes(normalizedKw)) {
        score += 80
        reasons.add('名称模糊')
      }
      if (textNorm.includes(normalizedKw)) {
        score += 40
        reasons.add('字段模糊')
      }

      // 子序列匹配（容错：如 idq7 / yhjdf50）
      if (isSubsequence(normalizedKw, sidNorm)) {
        score += 70
        reasons.add('SID联想')
      }
      if (isSubsequence(normalizedKw, nameNorm)) {
        score += 50
        reasons.add('名称联想')
      }

      // 多关键词匹配（每个词在任意字段命中）
      const tokenHitCount = normalizedTokens.reduce((hit, token) => {
        if (!token) return hit
        return textNorm.includes(token) || isSubsequence(token, textNorm) ? hit + 1 : hit
      }, 0)
      if (normalizedTokens.length > 1 && tokenHitCount > 0) {
        score += tokenHitCount * 25
        reasons.add('多词命中')
      }
      if (normalizedTokens.length > 1 && tokenHitCount === normalizedTokens.length) {
        score += 60
        reasons.add('多词全中')
      }

      return { item, score, reasons: Array.from(reasons) }
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)

  const mergedMap = new Map()
  const mergedList = []

  function mergeKeyOf(item = {}) {
    const status = String(item?.status || '')
    if (!['purchase', 'inventory'].includes(status)) return null
    const p = item?.purchaseDetails || {}
    const cost = Number(item?.cost || 0)
    const transferCost = Number(p?.transferCost || 0)
    return [
      String(item?.sid || ''),
      status,
      cost.toFixed(4),
      String(p?.transferStatus || ''),
      String(p?.transferBatch || ''),
      transferCost.toFixed(4),
    ].join('|')
  }

  scored.forEach(({ item, score, reasons }) => {
    const key = mergeKeyOf(item)
    const reasonSet = new Set(reasons || [])

    if (!key) {
      mergedList.push({
        ...item,
        _isMerged: false,
        _groupCount: 1,
        _groupTotalCost: Number(item?.cost || 0),
        _groupItems: [item],
        _searchMatchTypes: Array.from(reasonSet).slice(0, 3),
      })
      return
    }

    const existing = mergedMap.get(key)
    if (!existing) {
      const record = {
        ...item,
        _isMerged: true,
        _groupCount: 1,
        _groupTotalCost: Number(item?.cost || 0),
        _groupItems: [item],
        _searchScore: score,
        _reasonSet: reasonSet,
      }
      mergedMap.set(key, record)
      mergedList.push(record)
      return
    }

    existing._groupCount += 1
    existing._groupTotalCost += Number(item?.cost || 0)
    existing._groupItems.push(item)
    if (score > Number(existing._searchScore || 0)) {
      existing._searchScore = score
    }
    reasonSet.forEach((r) => existing._reasonSet.add(r))
  })

  return mergedList
    .sort((a, b) => Number(b._searchScore || 0) - Number(a._searchScore || 0))
    .map((x) => ({
      ...x,
      _searchMatchTypes: Array.from(x._reasonSet || x._searchMatchTypes || []).slice(0, 3),
      _groupTotalCost: Number(x._groupTotalCost || 0),
      _searchScore: undefined,
      _reasonSet: undefined,
    }))
}
