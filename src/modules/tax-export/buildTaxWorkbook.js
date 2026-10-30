import { DEFAULT_SALES_CHANNEL, inferLegacySalesChannel, isSalesChannel } from '../sales/salesChannels'

function toAmount(value) {
  const amount = Number(value)
  return Number.isFinite(amount) ? amount : 0
}

function isDateOnly(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00.000Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}

function inPeriod(date, startDate, endDate) {
  return isDateOnly(date) && date >= startDate && date <= endDate
}

function salesChannelOf(sale) {
  return isSalesChannel(sale?.shop) ? sale.shop : inferLegacySalesChannel(sale?.date)
}

function sheet(name, headers, rows) {
  return { name, headers, rows }
}

export function buildTaxWorkbookData(payload = {}, options = {}) {
  const startDate = options.startDate || ''
  const endDate = options.endDate || ''
  const periodValid = isDateOnly(startDate) && isDateOnly(endDate) && startDate <= endDate
  const selectedChannels = Array.isArray(options.channels)
    ? new Set(options.channels.filter(isSalesChannel))
    : new Set([DEFAULT_SALES_CHANNEL])
  const taxpayerName = String(options.taxpayerName || '').trim()
  const taxpayerId = String(options.taxpayerId || '').trim()
  const issues = []
  if (!periodValid) issues.push({ id: 'period', issue: '申报期间为空、格式无效或开始日期晚于结束日期，请先修正期间。' })
  if (!taxpayerName) issues.push({ id: 'taxpayer-name', issue: '纳税主体名称尚未填写，请人工核实。' })
  if (!taxpayerId) issues.push({ id: 'taxpayer-id', issue: '纳税人识别号尚未填写，请人工核实。' })

  const allSales = (Array.isArray(payload.items) ? payload.items : []).filter((item) => item?.status === 'sold' && item?.saleDetails && selectedChannels.has(salesChannelOf(item.saleDetails)))
  const sales = []
  allSales.forEach((item) => {
    const sale = item.saleDetails
    if (sale.isConfirmed !== true) {
      issues.push({ id: item.id, sid: item.sid || '', name: item.name || '', issue: '销售尚未确认到账，不计入所选期间。' })
      return
    }
    if (!isDateOnly(sale.entryDate)) {
      issues.push({ id: item.id, sid: item.sid || '', name: item.name || '', issue: sale.entryDate ? '入账日期无效，不能归入申报期间。' : '缺少入账日期，不能归入申报期间。' })
      return
    }
    if (!periodValid || !inPeriod(sale.entryDate, startDate, endDate)) return
    const price = toAmount(sale.price)
    const cost = toAmount(item.cost)
    const platformFee = price * toAmount(sale.feeRate)
    const express = toAmount(sale.express)
    const adjustment = toAmount(sale.deduction)
    sales.push({
      id: item.id,
      entryDate: sale.entryDate,
      name: item.name || '',
      sid: item.sid || '',
      batch: item.batch || '',
      price,
      cost,
      platformFee,
      express,
      adjustment,
      referenceProfit: price - cost - platformFee - express - adjustment,
    })
  })

  if (sales.length) issues.push({ id: 'tax-classification', issue: '本期销售没有税务分类、开票类型及开票金额字段，请逐项对照税务系统预填数据核对。' })

  const financeRecords = []
  ;(Array.isArray(payload.financeRecords) ? payload.financeRecords : payload.finance?.records || []).forEach((record) => {
    if (!isDateOnly(record?.date)) {
      issues.push({ id: record?.id || '', name: record?.item || '', issue: '收支记录缺少有效日期，未计入期间明细。' })
      return
    }
    if (!periodValid || !inPeriod(record.date, startDate, endDate)) return
    financeRecords.push({
      id: record.id || '', date: record.date, type: record.type || '',
      item: record.item || '', amount: toAmount(record.amount), note: record.note || '', taxCategory: '待人工确认',
    })
    issues.push({ id: record.id || '', name: record.item || '', issue: '收支税务性质与凭证状态未分类；请人工核实后再决定是否用于申报。' })
  })

  const totals = sales.reduce((sum, row) => ({
    revenue: sum.revenue + row.price,
    cost: sum.cost + row.cost,
    platformFee: sum.platformFee + row.platformFee,
    express: sum.express + row.express,
    adjustment: sum.adjustment + row.adjustment,
    referenceProfit: sum.referenceProfit + row.referenceProfit,
  }), { revenue: 0, cost: 0, platformFee: 0, express: 0, adjustment: 0, referenceProfit: 0 })
  const createdAt = new Date().toISOString()
  const readingRows = [
    { field: '纳税主体名称', value: taxpayerName || '待填写' },
    { field: '纳税人识别号', value: taxpayerId || '待填写' },
    { field: '申报期间（起止日均包含）', value: periodValid ? `${startDate} 至 ${endDate}` : '期间无效' },
    { field: '生成时间', value: createdAt },
    { field: '用途', value: '仅用于申报准备与人工复核；不自动判断税额、不提交、不缴税。' },
    { field: '销售期间口径', value: '仅按已确认销售的入账日期归期。' },
    { field: '经营利润参考', value: '售价 − 单品成本 − 平台手续费 − 快递费 − 补差；不等于应纳税所得额或税额。' },
    { field: '税务复核', value: '以当期电子税务局预填数据、适用政策及实际凭证为准。' },
  ]
  const steps = [
    { process: '增值税及附加税费（小规模）', step: '核对电子税务局预填发票数据；补充未开票收入（如有）。', check: '未核对' },
    { process: '增值税及附加税费（小规模）', step: '确认式核对，或切换填表式核对主表与附表。', check: '未核对' },
    { process: '增值税及附加税费（小规模）', step: '核对附加税费减免，预览并按当前系统提示提交。', check: '未核对' },
    { process: '经营所得个人所得税 A 表', step: '确认申报年度、被投资单位和税款所属期。', check: '未核对' },
    { process: '经营所得个人所得税 A 表', step: '核对收入、成本费用、亏损弥补及扣除项目，避免重复扣除。', check: '未核对' },
    { process: '经营所得个人所得税 A 表', step: '核对减免事项和申报结果，按当前系统提示提交。', check: '未核对' },
  ]
  const vatRows = [
    { metric: '已确认销售笔数', amount: sales.length, check: '对照税务系统预填' },
    { metric: '成交总额（经营数据参考）', amount: totals.revenue, check: '核对含税/不含税及开票口径' },
    { metric: '平台手续费（参考）', amount: totals.platformFee, check: '核对凭证与税务分类' },
    { metric: '快递费（按入账日关联）', amount: totals.express, check: '核对费用性质与凭证' },
    { metric: '销售补差（独立列示）', amount: totals.adjustment, check: '正数为卖方补给买家，负数为买家补给卖方' },
    { metric: '税务分类/开票金额', amount: '', check: '待人工填写；YSP 暂无来源字段' },
    { metric: '税务系统预填收入/差异说明', amount: '', check: '待人工填写' },
  ]
  const aRows = [
    { metric: '销售收入', amount: totals.revenue, check: '成交总额参考；与增值税系统及发票核对' },
    { metric: '商品成本参考（个别实际成本）', amount: totals.cost, check: '核对凭证及税务处理' },
    { metric: '平台手续费参考', amount: totals.platformFee, check: '核对凭证及费用性质' },
    { metric: '快递费参考', amount: totals.express, check: '核对凭证及费用性质' },
    { metric: '补差合计（单列核对）', amount: totals.adjustment, check: '不可默认与费用或收入抵销' },
    { metric: '经营利润参考（非应纳税所得额）', amount: totals.referenceProfit, check: '仅经营参考，不代表税务计算结果' },
    { metric: '以前年度亏损弥补', amount: '', check: '待人工核对填写' },
    { metric: '减除费用/专项扣除/减免项目', amount: '', check: '按税务系统页面和实际情况人工核对' },
    { metric: '应纳税所得额/税额', amount: '', check: '不由本工作簿自动计算' },
  ]

  return {
    issues,
    period: { startDate, endDate, taxpayerName, taxpayerId },
    totals: { ...totals, salesCount: sales.length, expenseRows: financeRecords.length },
    sheets: [
      sheet('阅读说明', ['项目', '内容'], readingRows),
      sheet('申报步骤清单', ['申报流程', '步骤', '核对状态'], steps),
      sheet('增值税核对', ['核对项目', '金额/数量', '人工核对/补录'], vatRows),
      sheet('A表经营数据', ['经营参考项目', '金额', '人工核对'], aRows),
      sheet('销售明细', ['入账日期', '商品名称', 'SID', '批次', '成交总价', '单品成本', '平台手续费', '快递费', '补差（正数为卖方支出）', '经营利润参考'], sales.map((row) => ({
        id: row.id, entryDate: row.entryDate, name: row.name, sid: row.sid, batch: row.batch,
        price: row.price, cost: row.cost, platformFee: row.platformFee, express: row.express, adjustment: row.adjustment, referenceProfit: row.referenceProfit,
      }))),
      sheet('收支明细', ['日期', '类型', '项目', '金额', '备注', '税务归类'], financeRecords),
      sheet('补差明细', ['入账日期', '商品名称', 'SID', '补差金额', '方向说明'], sales.filter((row) => row.adjustment !== 0).map((row) => ({
        entryDate: row.entryDate, name: row.name, sid: row.sid, adjustment: row.adjustment,
        direction: row.adjustment > 0 ? '卖方补给买家' : '买家补给卖方',
      }))),
      sheet('待确认事项', ['记录ID', 'SID', '名称/项目', '待确认原因'], issues),
    ],
  }
}

export function createTaxWorkbook(workbookData, XLSX) {
  const workbook = XLSX.utils.book_new()
  workbookData.sheets.forEach(({ name, headers, rows }) => {
    const sheetRows = [headers, ...rows.map((row) => {
      if (name === '阅读说明') return [row.field, row.value]
      if (name === '申报步骤清单') return [row.process, row.step, row.check]
      if (name === '增值税核对' || name === 'A表经营数据') return [row.metric, row.amount, row.check]
      if (name === '销售明细') return [row.entryDate, row.name, row.sid, row.batch, row.price, row.cost, row.platformFee, row.express, row.adjustment, row.referenceProfit]
      if (name === '收支明细') return [row.date, row.type, row.item, row.amount, row.note, row.taxCategory]
      if (name === '补差明细') return [row.entryDate, row.name, row.sid, row.adjustment, row.direction]
      return [row.id, row.sid, row.name || row.item || '', row.issue]
    })]
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(sheetRows), name)
  })
  return workbook
}

export async function writeTaxWorkbook(workbookData, filename) {
  const XLSX = await import('xlsx')
  const workbook = createTaxWorkbook(workbookData, XLSX)
  XLSX.writeFile(workbook, filename)
}
