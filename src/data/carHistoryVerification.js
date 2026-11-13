import { canonicalArchiveValue, validateCarArchive } from './carHistoryArchive.js'

const FIELD_LABELS = {
  sid: 'SID', name: '商品名称', brand: '品牌', category: '归属车库', isSold: '销售状态',
  buyDate: '购买日期', buyPrice: '购买成本', soldDate: '售出日期', sellPrice: '售出金额',
  expectedValue: '预期价格', note: '备注',
}

const REFERENCE_LAYOUT = {
  roots: ["Payton's 数据", '日常消费', '投资小车'],
  daily: ['收支明细', '自留车库'],
  invest: ['投资明细', '投资车库'],
  loansLocation: 'invest',
}

function displayValue(value) {
  if (value == null || value === '') return '（空）'
  if (typeof value === 'object') return JSON.stringify(value)
  if (typeof value === 'boolean') return value ? '是' : '否'
  return value
}

function same(left, right) {
  return canonicalArchiveValue(left) === canonicalArchiveValue(right)
}

function compareCars(sourceCars, archiveCars) {
  const differences = []
  const countSids = cars => cars.reduce((counts, car) => counts.set(car.sid, (counts.get(car.sid) || 0) + 1), new Map())
  const sourceCounts = countSids(sourceCars)
  const archiveCounts = countSids(archiveCars)
  for (const [sid, count] of sourceCounts) if (count > 1) differences.push({ sid, kind: '源文件 SID 重复', source: count, archive: archiveCounts.get(sid) || 0 })
  for (const [sid, count] of archiveCounts) if (count > 1 && !sourceCounts.has(sid)) differences.push({ sid, kind: '档案 SID 重复', source: 0, archive: count })

  const sourceBySid = new Map(sourceCars.map(car => [car.sid, car]))
  const archiveBySid = new Map(archiveCars.map(car => [car.sid, car]))
  for (const [sid, car] of sourceBySid) {
    const archived = archiveBySid.get(sid)
    if (!archived) {
      differences.push({ sid, kind: '档案缺少' })
      continue
    }
    for (const key of [...new Set([...Object.keys(car), ...Object.keys(archived)])].sort()) {
      if (!same(car[key], archived[key])) differences.push({ sid, kind: '字段不同', field: FIELD_LABELS[key] || key, source: displayValue(car[key]), archive: displayValue(archived[key]) })
    }
  }
  for (const [sid] of archiveBySid) if (!sourceBySid.has(sid)) differences.push({ sid, kind: '档案多出' })
  return differences
}

function makeSection(name, source, archive) {
  const entries = value => Array.isArray(value)
    ? value.map((row, index) => [String(row.id ?? row.sid ?? `#${index + 1}`), row])
    : Object.entries(value || {})
  const left = new Map(entries(source))
  const right = new Map(entries(archive))
  const differences = []
  for (const [key, value] of left) {
    if (!right.has(key)) differences.push({ key, kind: '档案缺少' })
    else if (!same(value, right.get(key))) differences.push({ key, kind: '内容不同', source: displayValue(value), archive: displayValue(right.get(key)) })
  }
  for (const [key] of right) if (!left.has(key)) differences.push({ key, kind: '档案多出' })
  return { name, sourceCount: left.size, archiveCount: right.size, passed: differences.length === 0, differences: differences.slice(0, 30), differenceCount: differences.length }
}

function sameLabels(expected, actual) {
  return Array.isArray(actual) && expected.length === actual.length && expected.every((label, index) => label === actual[index])
}

export function verifyCarHistoryArchive(source, archive, uiLayout) {
  validateCarArchive(source)
  validateCarArchive(archive)
  const carDifferences = compareCars(source.cars, archive.cars)
  const sections = [
    { name: '车辆', sourceCount: source.cars.length, archiveCount: archive.cars.length, passed: carDifferences.length === 0 },
    makeSection('零钱收支明细', source.accounts.pocket.transactions, archive.accounts.pocket.transactions),
    makeSection('投资账户明细', source.accounts.invest.transactions, archive.accounts.invest.transactions),
    makeSection('贷款清单', source.accounts.invest.loans, archive.accounts.invest.loans),
    makeSection('账户互转', source.transferPairs, archive.transferPairs),
    makeSection('预期价格', source.expectedPrices, archive.expectedPrices),
    makeSection('操作日志', source.operationLogs, archive.operationLogs),
  ]

  const actualLayout = uiLayout || { ...REFERENCE_LAYOUT, loansLocation: 'dashboard' }
  const structureDifferences = []
  for (const key of ['roots', 'daily', 'invest']) {
    if (!sameLabels(REFERENCE_LAYOUT[key], actualLayout[key])) structureDifferences.push(`${key} 标签与旧 car 不一致`)
  }
  const structureWarnings = actualLayout.loansLocation !== REFERENCE_LAYOUT.loansLocation
    ? ["贷款入口位于 Payton's 数据；旧 car 位于投资小车模块"]
    : []

  const sourceVisibleCounts = {
    pocketTransactions: source.accounts.pocket.transactions.length,
    keepGarage: source.cars.filter(car => car.category === 'keep' && !car.isSold).length,
    investTransactions: source.accounts.invest.transactions.length,
    investGarage: source.cars.filter(car => car.category === 'invest' && !car.isSold).length,
  }
  const visibleCounts = {
    pocketTransactions: archive.accounts.pocket.transactions.length,
    keepGarage: archive.cars.filter(car => car.category === 'keep' && !car.isSold).length,
    investTransactions: archive.accounts.invest.transactions.length,
    investGarage: archive.cars.filter(car => car.category === 'invest' && !car.isSold).length,
  }
  const categories = category => source.cars.filter(car => car.category === category)
  return {
    dataPassed: sections.every(section => section.passed),
    structurePassed: structureDifferences.length === 0,
    sections,
    carDifferences,
    structureDifferences,
    structureWarnings,
    summary: {
      cars: source.cars.length,
      investCars: categories('invest').length,
      keepCars: categories('keep').length,
      pocketTransactions: source.accounts.pocket.transactions.length,
      investTransactions: source.accounts.invest.transactions.length,
      loans: source.accounts.invest.loans.length,
      transferPairs: source.transferPairs.length,
      expectedPrices: Object.keys(source.expectedPrices).length,
      operationLogs: source.operationLogs.length,
    },
    sourceVisibleCounts,
    visibleCounts,
    displayCountsPassed: same(sourceVisibleCounts, visibleCounts),
    expectedLayout: REFERENCE_LAYOUT,
    actualLayout,
  }
}
