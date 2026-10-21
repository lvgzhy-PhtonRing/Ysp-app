import { readFile, writeFile, copyFile, access } from 'node:fs/promises'
import { resolve, basename } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { migratePayload } from '../src/data/migrations/index.js'

export const CUTOFF_DATE = '2026-10-15'
export const BMW_507_SID = '55aeffc4-b720-483f-b85e-1d85067f0189'

export function parseCarExport(text) {
  let payload
  try {
    payload = JSON.parse(String(text).replace(/^\uFEFF/, ''))
  } catch (error) {
    throw new Error(`car JSON 解析失败：${error.message}`)
  }
  if (!payload || !Array.isArray(payload.cars)) throw new Error('car JSON 缺少 cars 数组')
  if (!payload.accounts?.pocket || !payload.accounts?.invest) throw new Error('car JSON 缺少 accounts.pocket/invest')
  for (const name of ['pocket', 'invest']) {
    if (!Array.isArray(payload.accounts[name].transactions)) throw new Error(`car JSON accounts.${name}.transactions 不是数组`)
  }
  if (!Array.isArray(payload.accounts.invest.loans)) throw new Error('car JSON accounts.invest.loans 不是数组')
  return payload
}

function round2(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100
}

function accountBalance(account) {
  return round2(account.transactions
    .filter((transaction) => transaction?.date && transaction.date <= CUTOFF_DATE)
    .reduce((balance, transaction) => balance + (transaction.type === 'income' ? 1 : transaction.type === 'expense' ? -1 : 0) * Number(transaction.amount || 0), 0))
}

function mapCar(car, usedIds) {
  const sid = String(car.sid)
  const subCategory = String(car.subCategory || '').trim()
  const originalName = String(car.name || '').trim()
  const name = subCategory && !originalName.toLocaleLowerCase().includes(subCategory.toLocaleLowerCase())
    ? `${subCategory} ${originalName}`.trim()
    : originalName
  let id = `car_${sid}`
  for (let suffix = 2; usedIds.has(id); suffix++) id = `car_${sid}_${suffix}`
  usedIds.add(id)
  return {
    id, sid, name, brand: car.brand || '', note: car.note || '', cost: Number(car.buyPrice || 0),
    status: 'inventory', stock: 1, category: 'payton库存', batch: '2026年10月导入', owner: 'payton',
    isLongTerm: car.category === 'keep', inventoryDetails: { inStockDate: car.buyDate || '' },
  }
}

export function buildCarImport(carPayload, yspPayload) {
  const car = typeof carPayload === 'string' ? parseCarExport(carPayload) : carPayload
  if (!car || !Array.isArray(car.cars) || !car.accounts?.pocket || !car.accounts?.invest) {
    throw new Error('car 数据结构无效，需包含 cars 与 pocket/invest 账户')
  }
  const payload = migratePayload(yspPayload)
  const cutoffCars = car.cars.filter((item) => !item.isSold || (item.soldDate && item.soldDate > CUTOFF_DATE))
  const seen = new Set()
  const duplicateSids = []
  for (const item of cutoffCars) {
    const sid = String(item.sid || '')
    if (!sid || seen.has(sid)) duplicateSids.push(sid || '(空 SID)')
    seen.add(sid)
  }
  if (duplicateSids.length) throw new Error(`存在重复 SID：${duplicateSids.join(', ')}`)

  const bySid = new Map()
  for (const item of payload.items) {
    if (!item?.sid) continue
    const existing = bySid.get(String(item.sid)) || []
    existing.push(item)
    bySid.set(String(item.sid), existing)
  }
  const conflicts = []
  const skipped = []
  const importedCars = []
  const usedIds = new Set(payload.items.map((item) => String(item?.id)))
  for (const item of cutoffCars) {
    const sid = String(item.sid)
    const existing = bySid.get(sid) || []
    if (existing.length) {
      if (existing.every((record) => record.owner === 'payton')) skipped.push(sid)
      else conflicts.push(sid)
      continue
    }
    importedCars.push(mapCar(item, usedIds))
  }
  if (conflicts.length) throw new Error(`与 YSP 现有商品 SID 冲突：${conflicts.join(', ')}`)

  const registryCandidate = yspPayload?.ownerRegistry?.payton
  const existingRegistry = registryCandidate && (
    registryCandidate.source === 'car-import' || registryCandidate.openingAt ||
    Number(registryCandidate.pocketBalance) !== 0 || Number(registryCandidate.investBalance) !== 0 ||
    registryCandidate.loans?.length || registryCandidate.accountTransfers?.length
  ) ? payload.ownerRegistry.payton : null
  const latestSnapshot = payload.snapshots?.map((snapshot) => snapshot?.date).filter(Boolean).sort().at(-1) || ''
  const bmw = cutoffCars.find((item) => String(item.sid) === BMW_507_SID)
  const paytonRegistry = existingRegistry || {
    label: 'Payton', source: 'car-import',
    pocketBalance: accountBalance(car.accounts.pocket), investBalance: accountBalance(car.accounts.invest),
    monthlyAllowance: Number(car.accounts.pocket.monthlyAllowance || car.accounts.invest.monthlyAllowance || 200),
    loans: car.accounts.invest.loans.filter((loan) => loan?.status === 'active').map((loan) => ({ ...loan, events: Array.isArray(loan.events) ? loan.events : [] })),
    accountTransfers: [], openingAt: CUTOFF_DATE,
    snapshotReconcile: bmw && latestSnapshot ? { date: latestSnapshot, pendingSaleSid: BMW_507_SID } : null,
  }
  payload.ownerRegistry.payton = paytonRegistry
  payload.items.push(...importedCars)

  const excludedSold = car.cars.filter((item) => item.isSold && item.soldDate && item.soldDate <= CUTOFF_DATE).map((item) => String(item.sid))
  const report = {
    cutoffDate: CUTOFF_DATE, imported: importedCars.length, skipped, excludedSold,
    totalCost: round2(importedCars.reduce((sum, item) => sum + item.cost, 0)),
    pocketBalance: paytonRegistry.pocketBalance, investBalance: paytonRegistry.investBalance,
    activeLoans: paytonRegistry.loans.length, pendingSaleSid: paytonRegistry.snapshotReconcile?.pendingSaleSid || '',
  }
  return { payload, report }
}

async function exists(path) {
  try { await access(path); return true } catch { return false }
}

export async function runImport({ carPath, yspPath, outPath }) {
  if (!carPath || !yspPath || !outPath) throw new Error('必须提供 --car、--ysp、--out')
  const car = resolve(carPath)
  const ysp = resolve(yspPath)
  const out = resolve(outPath)
  if ([car, ysp].some((input) => input.toLocaleLowerCase() === out.toLocaleLowerCase())) throw new Error('输出路径不能与输入路径相同')
  const carBytes = await readFile(car)
  const yspBytes = await readFile(ysp)
  const { payload, report } = buildCarImport(parseCarExport(carBytes.toString('utf8')), JSON.parse(yspBytes.toString('utf8').replace(/^\uFEFF/, '')))
  const backupPath = `${out}.bak`
  if (!(await exists(backupPath))) await copyFile(ysp, backupPath)
  await writeFile(out, `${JSON.stringify(payload, null, 2)}\n`, { flag: 'w' })
  const reportPath = `${out}.report.json`
  await writeFile(reportPath, `${JSON.stringify({ ...report, output: basename(out), backup: basename(backupPath) }, null, 2)}\n`)
  return { payload, report, outPath: out, backupPath, reportPath }
}

function parseArgs(args) {
  const result = {}
  for (let i = 0; i < args.length; i++) {
    const key = args[i]
    if (['--car', '--ysp', '--out'].includes(key)) result[key.slice(2) + (key === '--out' ? 'Path' : 'Path')] = args[++i]
  }
  return result
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  runImport(parseArgs(process.argv.slice(2))).then(({ report, outPath }) => {
    console.log(JSON.stringify({
      cutoffDate: report.cutoffDate, imported: report.imported, skipped: report.skipped.length,
      excludedSold: report.excludedSold.length, totalCost: report.totalCost,
      pocketBalance: report.pocketBalance, investBalance: report.investBalance,
      activeLoans: report.activeLoans, outPath,
    }, null, 2))
  }).catch((error) => {
    console.error(error.message)
    process.exitCode = 1
  })
}
