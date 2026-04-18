import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadData, exportData } from '../src/data/store.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')

function readJsonByArg(argPath = 'a.json') {
  const candidates = [
    path.isAbsolute(argPath) ? argPath : path.resolve(projectRoot, argPath),
    path.resolve(projectRoot, '..', argPath),
  ]

  for (const p of candidates) {
    if (fs.existsSync(p)) {
      return {
        filePath: p,
        data: JSON.parse(fs.readFileSync(p, 'utf8')),
      }
    }
  }

  throw new Error(`找不到数据文件: ${argPath}`)
}

function approxEqual(a, b, eps) {
  return Math.abs(Number(a) - Number(b)) <= eps
}

let passed = 0
let failed = 0

function report(name, ok, details = []) {
  if (ok) {
    passed += 1
    console.log(`✅ ${name}`)
  } else {
    failed += 1
    console.log(`❌ ${name}`)
    details.slice(0, 30).forEach((d) => console.log(`   - ${d}`))
    if (details.length > 30) {
      console.log(`   ... 还有 ${details.length - 30} 条差异未展示`)
    }
  }
}

function compareItemBase(oldItem, newItem, idx, diffs) {
  const sid = oldItem?.sid || `index:${idx}`
  const strictFields = [
    'id',
    'sid',
    'name',
    'brand',
    'category',
    'batch',
    'status',
    'isManual',
    'isDefect',
    'isLongTerm',
  ]

  strictFields.forEach((f) => {
    if (oldItem?.[f] !== newItem?.[f]) {
      diffs.push(`item[${idx}] sid=${sid} 字段 ${f} 不一致: old=${JSON.stringify(oldItem?.[f])}, new=${JSON.stringify(newItem?.[f])}`)
    }
  })

  const oldCost = oldItem?.cost
  const newCost = newItem?.cost
  if (oldCost === undefined && newCost === undefined) {
    // both absent: treat as equal
  } else if (!approxEqual(oldCost, newCost, 0.001)) {
    diffs.push(`item[${idx}] sid=${sid} 字段 cost 不一致: old=${oldCost}, new=${newCost}`)
  }

  const oldStock = oldItem?.stock
  const newStock = newItem?.stock
  if (oldStock === undefined && newStock === undefined) {
    // both absent: treat as equal
  } else if (!approxEqual(oldStock, newStock, 0.001)) {
    diffs.push(`item[${idx}] sid=${sid} 字段 stock 不一致: old=${oldStock}, new=${newStock}`)
  }
}

function compareSaleDetails(oldItem, newItem, idx, diffs) {
  const sid = oldItem?.sid || `index:${idx}`
  const oldSale = oldItem?.saleDetails
  const newSale = newItem?.saleDetails

  if ((oldSale == null) !== (newSale == null)) {
    diffs.push(`item[${idx}] sid=${sid} saleDetails 存在性不一致`)
    return
  }
  if (!oldSale || !newSale) return

  ;['price', 'express', 'feeRate', 'deduction'].forEach((f) => {
    if (oldSale[f] !== newSale[f]) {
      diffs.push(`item[${idx}] sid=${sid} saleDetails.${f} 不一致: old=${oldSale[f]}, new=${newSale[f]}`)
    }
  })

  if (!approxEqual(oldSale.profit, newSale.profit, 0.01)) {
    diffs.push(`item[${idx}] sid=${sid} saleDetails.profit 不一致: old=${oldSale.profit}, new=${newSale.profit}`)
  }
}

function comparePurchaseDetails(oldItem, newItem, idx, diffs) {
  const sid = oldItem?.sid || `index:${idx}`
  const oldPd = oldItem?.purchaseDetails
  const newPd = newItem?.purchaseDetails

  if ((oldPd == null) !== (newPd == null)) {
    diffs.push(`item[${idx}] sid=${sid} purchaseDetails 存在性不一致`)
    return
  }
  if (!oldPd || !newPd) return

  const numericEpsFields = ['originalPrice', 'exchangeRate', 'domesticShipping', 'fee', 'preTransferCost']
  numericEpsFields.forEach((f) => {
    if (!approxEqual(oldPd[f], newPd[f], 0.001)) {
      diffs.push(`item[${idx}] sid=${sid} purchaseDetails.${f} 不一致: old=${oldPd[f]}, new=${newPd[f]}`)
    }
  })

  const keys = new Set([...Object.keys(oldPd), ...Object.keys(newPd)])
  keys.forEach((k) => {
    if (numericEpsFields.includes(k)) return
    if (oldPd[k] !== newPd[k]) {
      diffs.push(`item[${idx}] sid=${sid} purchaseDetails.${k} 不一致: old=${JSON.stringify(oldPd[k])}, new=${JSON.stringify(newPd[k])}`)
    }
  })
}

function deepStrictEqualArrayByIndex(oldArr, newArr, label) {
  const diffs = []
  if (oldArr.length !== newArr.length) {
    diffs.push(`${label} 长度不一致: old=${oldArr.length}, new=${newArr.length}`)
    return diffs
  }

  for (let i = 0; i < oldArr.length; i += 1) {
    const a = JSON.stringify(oldArr[i])
    const b = JSON.stringify(newArr[i])
    if (a !== b) {
      diffs.push(`${label}[${i}] 不一致`)
    }
  }

  return diffs
}

function run() {
  const inputArg = process.argv[2] || 'a.json'
  const { filePath, data: oldData } = readJsonByArg(inputArg)

  console.log(`使用数据文件: ${filePath}`)

  loadData(oldData)
  const newData = exportData()

  // 1) items 长度
  report(
    'items 数组长度',
    oldData.items.length === newData.items.length,
    [`old=${oldData.items.length}, new=${newData.items.length}`],
  )

  // 2) items 逐字段
  const itemDiffs = []
  const minLen = Math.min(oldData.items.length, newData.items.length)
  for (let i = 0; i < minLen; i += 1) {
    const oldItem = oldData.items[i]
    const newItem = newData.items[i]
    compareItemBase(oldItem, newItem, i, itemDiffs)
    compareSaleDetails(oldItem, newItem, i, itemDiffs)
    comparePurchaseDetails(oldItem, newItem, i, itemDiffs)
  }
  report('items 逐字段对比', itemDiffs.length === 0, itemDiffs)

  // 3) finance.records
  const financeRecordDiffs = deepStrictEqualArrayByIndex(
    oldData.finance?.records || [],
    newData.finance?.records || [],
    'finance.records',
  )
  report('finance.records 对比', financeRecordDiffs.length === 0, financeRecordDiffs)

  // 4) finance.loans
  const financeLoanDiffs = deepStrictEqualArrayByIndex(
    oldData.finance?.loans || [],
    newData.finance?.loans || [],
    'finance.loans',
  )
  report('finance.loans 对比', financeLoanDiffs.length === 0, financeLoanDiffs)

  // 5) transfers
  const transferDiffs = deepStrictEqualArrayByIndex(oldData.transfers || [], newData.transfers || [], 'transfers')
  report('transfers 对比', transferDiffs.length === 0, transferDiffs)

  // 6) payton.records 长度
  const oldPaytonRecords = oldData.payton?.records || []
  const newPaytonRecords = newData.payton?.records || []
  report(
    'payton.records 长度',
    oldPaytonRecords.length === newPaytonRecords.length,
    [`old=${oldPaytonRecords.length}, new=${newPaytonRecords.length}`],
  )

  // 7) payton.inventory 长度
  const oldPaytonInventory = oldData.payton?.inventory || []
  const newPaytonInventory = newData.payton?.inventory || []
  report(
    'payton.inventory 长度',
    oldPaytonInventory.length === newPaytonInventory.length,
    [`old=${oldPaytonInventory.length}, new=${newPaytonInventory.length}`],
  )

  // 8) calc 字段
  const calcDiffs = []
  const calcKeys = new Set([...Object.keys(oldData.calc || {}), ...Object.keys(newData.calc || {})])
  calcKeys.forEach((k) => {
    if ((oldData.calc || {})[k] !== (newData.calc || {})[k]) {
      calcDiffs.push(`calc.${k} 不一致: old=${(oldData.calc || {})[k]}, new=${(newData.calc || {})[k]}`)
    }
  })
  report('calc 字段对比', calcDiffs.length === 0, calcDiffs)

  console.log(`\n集成验证完成：${passed}项通过，${failed}项失败`)

  if (failed === 0) {
    console.log('✅ 新旧程序数据完全一致，可以进入 UI 开发')
  } else {
    console.log('❌ 存在不一致，请根据上述差异修复后重试')
    process.exitCode = 1
  }
}

run()
