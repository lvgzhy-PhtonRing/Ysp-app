import fs from 'node:fs'
import path from 'node:path'

function pct(n, d) {
  if (!d) return '0.00%'
  return `${((n * 100) / d).toFixed(2)}%`
}

function safeStr(v) {
  return typeof v === 'string' ? v : (v ?? '').toString()
}

function main() {
  const input = process.argv[2] || 'D:/Projects/a.json'
  const filePath = path.isAbsolute(input) ? input : path.resolve(process.cwd(), input)

  const raw = fs.readFileSync(filePath, 'utf-8')
  const data = JSON.parse(raw)

  const items = Array.isArray(data.items) ? data.items : []
  const transfers = Array.isArray(data.transfers) ? data.transfers : []

  const transferMap = new Map()
  for (const t of transfers) {
    const tid = safeStr(t?.transferId).trim()
    if (!tid) continue
    if (!transferMap.has(tid)) transferMap.set(tid, [])
    transferMap.get(tid).push(t)
  }

  const target = items.filter((i) => i?.status === 'inventory' && i?.isLongTerm !== true)

  const A = [] // 转运日
  const B = [] // 采购日
  const C = [] // 未知
  let missingTransferIdCount = 0
  const multiTransferIds = new Set()

  for (const it of target) {
    const pd = it?.purchaseDetails || {}
    const purchaseDate = safeStr(pd?.date).trim()
    const transferId = safeStr(pd?.transferId).trim()

    let matchedTransferDate = ''
    let fromTransferDate = false

    if (transferId) {
      const list = transferMap.get(transferId)
      if (!list || list.length === 0) {
        missingTransferIdCount += 1
      } else {
        if (list.length > 1) multiTransferIds.add(transferId)
        const dates = list
          .map((x) => safeStr(x?.date).trim())
          .filter(Boolean)
          .sort()
        if (dates.length) {
          matchedTransferDate = dates[0]
          fromTransferDate = true
        }
      }
    }

    const row = {
      sid: safeStr(it?.sid),
      name: safeStr(it?.name),
      category: safeStr(it?.category),
      batch: safeStr(it?.batch),
      purchaseDate,
      transferId,
      matchedTransferDate,
    }

    if (fromTransferDate) A.push(row)
    else if (purchaseDate) B.push(row)
    else C.push(row)
  }

  const total = target.length

  console.log('===== 入库日期来源覆盖率（非长线库存）=====')
  console.log(`数据文件: ${filePath}`)
  console.log(`总条目数: ${total}`)
  console.log(`A 转运日: ${A.length} (${pct(A.length, total)})`)
  console.log(`B 采购日: ${B.length} (${pct(B.length, total)})`)
  console.log(`C 未知:   ${C.length} (${pct(C.length, total)})`)
  console.log(`有 transferId 但 transfers 找不到记录: ${missingTransferIdCount}`)
  console.log(`transferId 匹配到多条 transfer 记录: ${multiTransferIds.size}`)

  if (multiTransferIds.size > 0) {
    console.log('多匹配 transferId 示例(前10):')
    for (const x of [...multiTransferIds].slice(0, 10)) {
      console.log(`- ${x}`)
    }
  }

  function printSamples(label, arr) {
    console.log(`\n===== ${label} 示例(前5) =====`)
    const samples = arr.slice(0, 5)
    if (samples.length === 0) {
      console.log('(无)')
      return
    }
    samples.forEach((s, idx) => {
      console.log(
        `${idx + 1}. sid=${s.sid} | name=${s.name} | ${s.category}/${s.batch} | purchaseDate=${s.purchaseDate || '-'} | transferId=${s.transferId || '-'} | matchedTransferDate=${s.matchedTransferDate || '-'}`,
      )
    })
  }

  printSamples('A 转运日', A)
  printSamples('B 采购日', B)
  printSamples('C 未知', C)
}

main()
