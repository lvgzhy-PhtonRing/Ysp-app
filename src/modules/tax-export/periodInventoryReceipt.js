import JSZip from 'jszip'
import templateUrl from './templates/period-inventory-intake-a3-template.xlsx?url'
import { resolvePurchaseDate } from './purchaseDate'

function amount(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

function dateOnly(value) {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString().slice(0, 10)
  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Date(Date.UTC(1899, 11, 30) + value * 86400000).toISOString().slice(0, 10)
  }
  const match = String(value || '').match(/^(\d{4}-\d{2}-\d{2})/)
  if (!match) return ''
  const date = new Date(`${match[1]}T00:00:00.000Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === match[1] ? match[1] : ''
}

function escapeXml(value) {
  return String(value ?? '').replace(/[<>&"']/g, (character) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[character])
}

function hasPurchaseData(purchase) {
  return ['date', 'paymentBatch', 'purchaseGroupId', 'preTransferCost', 'originalPrice', 'totalRMB']
    .some((key) => purchase?.[key] !== undefined && purchase[key] !== '')
}

function statusNote(status, inStockDate) {
  if (inStockDate) return status === 'sold' ? '已入库后售出' : status === 'unlisted' ? '已入库后下架' : ''
  if (status === 'purchase') return '采购中，尚未实际入库'
  if (status === 'sold') return '已售；YSP未记录实际入库日期'
  if (status === 'unlisted') return '已下架；YSP未记录实际入库日期'
  return 'YSP未记录实际入库日期'
}

export function combineInventoryNote(statusText, purchaseNote) {
  const status = String(statusText || '').trim()
  const note = String(purchaseNote || '').trim()
  if (!status) return note ? `购买组备注：${note}` : ''
  if (!note) return status
  return `${status}；购买组备注：${note}`
}

export function buildPeriodInventoryReceipt(payload = {}, { startDate = '', endDate = '' } = {}) {
  const items = Array.isArray(payload.items) ? payload.items : []
  const missingDateCount = items.filter((item) => hasPurchaseData(item?.purchaseDetails) && !resolvePurchaseDate(item)).length
  const rows = items.flatMap((item) => {
    const purchase = item?.purchaseDetails
    const purchaseDate = resolvePurchaseDate(item)
    if (!purchaseDate || purchaseDate < startDate || purchaseDate > endDate) return []
    const inStockDate = dateOnly(item?.inventoryDetails?.inStockDate)
    const unitCost = amount(item.cost) || amount(purchase.preTransferCost)
    return [{
      sid: item.sid || '',
      name: item.name || '',
      purchaseDate,
      supplier: purchase.website || '',
      note: combineInventoryNote(statusNote(item.status, inStockDate), purchase.note),
      paymentBatch: purchase.paymentBatch || '',
      batch: [item.category, item.batch].filter(Boolean).join('\\'),
      brand: item.brand || '',
      unitCost,
      inStockDate,
      websiteAccount: [purchase.website, purchase.websiteAccount].filter(Boolean).join(' / '),
      purchaseInProgress: item.status === 'purchase',
    }]
  }).sort((a, b) => a.purchaseDate.localeCompare(b.purchaseDate)
    || a.paymentBatch.localeCompare(b.paymentBatch, 'zh-CN')
    || a.sid.localeCompare(b.sid)
    || a.name.localeCompare(b.name, 'zh-CN'))

  return {
    rows,
    missingDateCount,
    totals: {
      quantity: rows.length,
      cost: rows.reduce((sum, row) => sum + row.unitCost, 0),
      pendingInventoryCount: rows.filter((row) => row.purchaseInProgress).length,
    },
  }
}

function replaceCell(xml, reference, value, type = 'str') {
  const pattern = new RegExp(`<ns0:c r="${reference}"([^>]*?)(?:\\s*/>|>([\\s\\S]*?)<\\/ns0:c>)`)
  return xml.replace(pattern, (match, rawAttributes = '') => {
    const attributes = rawAttributes.replace(/\s+t="[^"]*"/g, '').replace(/\s*\/$/, '')
    if (value === '' || value === null || value === undefined) return `<ns0:c r="${reference}"${attributes}/>`
    const typeAttribute = type ? ` t="${type}"` : ''
    const body = type === 'n' ? `<ns0:v>${value}</ns0:v>` : `<ns0:v>${escapeXml(value)}</ns0:v>`
    return `<ns0:c r="${reference}"${attributes}${typeAttribute}>${body}</ns0:c>`
  })
}

function buildDetailRow(templateRow, rowNumber, item, index) {
  let rowXml = templateRow.replace('<ns0:row r="8"', `<ns0:row r="${rowNumber}"`).replace(/ r="([A-Z]+)8"/g, ` r="$1${rowNumber}"`)
  const values = {
    A: [index + 1, 'n'], B: [item.sid, 'str'], C: [item.name, 'str'], D: ['件', 'str'], E: [1, 'n'],
    F: [item.unitCost, 'n'], G: [item.purchaseDate, 'd'], H: [item.supplier, 'str'], I: ['', 'str'],
    J: [item.note, 'str'], K: [item.paymentBatch, 'str'], L: [item.batch, 'str'], M: [item.brand, 'str'],
    N: [item.unitCost, 'n'], O: [item.inStockDate, 'd'], P: [item.websiteAccount, 'str'],
  }
  Object.entries(values).forEach(([column, [value, type]]) => {
    rowXml = replaceCell(rowXml, `${column}${rowNumber}`, value, type)
  })
  return rowXml
}

async function replaceZipText(zip, path, update) {
  const file = zip.file(path)
  if (!file) return
  zip.file(path, update(await file.async('string')))
}

export async function writePeriodInventoryReceipt(payload, options, filename) {
  const data = buildPeriodInventoryReceipt(payload, options)
  const response = await fetch(templateUrl)
  if (!response.ok) throw new Error('无法读取 A3 入库单模板')
  const zip = await JSZip.loadAsync(await response.arrayBuffer())
  const sheetPath = 'xl/worksheets/sheet1.xml'
  const sheetFile = zip.file(sheetPath)
  if (!sheetFile) throw new Error('A3 入库单模板缺少明细工作表')

  let sheetXml = await sheetFile.async('string')
  const sheetDataMatch = sheetXml.match(/<ns0:sheetData>([\s\S]*?)<\/ns0:sheetData>/)
  if (!sheetDataMatch) throw new Error('A3 入库单模板结构无法识别')
  const templateRows = [...sheetDataMatch[1].matchAll(/<ns0:row r="(\d+)"[^>]*>[\s\S]*?<\/ns0:row>/g)]
  const retainedRows = templateRows.filter((match) => Number(match[1]) >= 2 && Number(match[1]) <= 7).map((match) => match[0])
  const rowTemplate = templateRows.find((match) => Number(match[1]) === 8)?.[0]
  if (!rowTemplate) throw new Error('A3 入库单模板缺少商品行样式')

  const compactRange = `${options.startDate.replaceAll('-', '')}-${options.endDate.replaceAll('-', '')}`
  const formRows = new Map([
    [2, `${compactRange} 期间入库清单`],
    [3, `采购日期范围：${options.startDate} 至 ${options.endDate}`],
    [4, `接收方：${options.taxpayerName || '上海市宝山区大荒文化艺术商行（个体工商户）'}    统一社会信用代码：${options.taxpayerId || '92310113MAKNXURF0B'}    经营地址：微店及闲鱼平台`],
    [5, '清单口径：选定期间内发生采购即列入，不以 YSP 是否完成实际入库为筛选条件。'],
    [6, `总件数：${data.totals.quantity} 件    总金额：¥${data.totals.cost.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`],
  ])
  const headerTitles = { E: '入库数量', F: '入库总成本' }
  const updatedHeader = replaceCell(retainedRows.find((row) => /r="7"/.test(row)), 'E7', headerTitles.E)
  const headerRow = replaceCell(updatedHeader, 'F7', headerTitles.F)
    .replace('r="H7" s="97"', 'r="H7" s="60"')
    .replace('r="O7" s="97"', 'r="O7" s="60"')
  const rowsWithMetadata = retainedRows.map((row) => {
    const rowNumber = Number(row.match(/<ns0:row r="(\d+)"/)?.[1])
    if (rowNumber === 7) return headerRow
    if (!formRows.has(rowNumber)) return row
    return replaceCell(row, `A${rowNumber}`, formRows.get(rowNumber))
  })
  const startRow = 8
  const lastRow = startRow + data.rows.length - 1
  const detailRows = data.rows.map((item, index) => buildDetailRow(rowTemplate, startRow + index, item, index))
  const sheetData = `<ns0:sheetData>${[...rowsWithMetadata, ...detailRows].join('')}</ns0:sheetData>`
  sheetXml = sheetXml.replace(sheetDataMatch[0], sheetData)
  sheetXml = sheetXml.replace(/<ns0:dimension ref="[^"]+"\s*\/>/, `<ns0:dimension ref="A2:P${Math.max(7, lastRow)}" />`)
  await replaceZipText(zip, sheetPath, () => sheetXml)

  const tableEnd = Math.max(7, lastRow)
  await replaceZipText(zip, 'xl/tables/table1.xml', (xml) => xml
    .replace(/name="OpeningInventoryLedger"/g, 'name="PeriodInventoryIntake"')
    .replace(/displayName="OpeningInventoryLedger"/g, 'displayName="PeriodInventoryIntake"')
    .replace(/ref="A7:P\d+"/, `ref="A7:P${tableEnd}"`)
    .replace('name="转入数量"', 'name="入库数量"')
    .replace('name="转入总成本"', 'name="入库总成本"'))
  await replaceZipText(zip, 'xl/workbook.xml', (xml) => xml
    .replace(/<x:sheet name="字段对应与核对"[^>]*\/>/, '')
    .replaceAll('期初存货台账', '期间入库清单')
    .replace(/\$A\$1:\$P\$\d+/, `$A$1:$P$${tableEnd}`))
  await replaceZipText(zip, 'xl/_rels/workbook.xml.rels', (xml) => xml.replace(/<Relationship(?=[^>]*Target="\/xl\/worksheets\/sheet2\.xml")[^>]*\/>/, ''))
  await replaceZipText(zip, '[Content_Types].xml', (xml) => xml.replace(/<Override(?=[^>]*PartName="\/xl\/worksheets\/sheet2\.xml")[^>]*\/>/, ''))
  zip.remove('xl/worksheets/sheet2.xml')
  zip.remove('xl/worksheets/_rels/sheet2.xml.rels')

  const blob = await zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.style.display = 'none'
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  return data
}
