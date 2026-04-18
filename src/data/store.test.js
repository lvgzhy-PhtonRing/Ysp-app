// store.js 单元测试：验证 a.json 的 loadData -> exportData 数据无损

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeEach, describe, expect, it } from 'vitest'
import { exportData, loadData } from './store'

function readDesktopAJson() {
  const __filename = fileURLToPath(import.meta.url)
  const __dirname = path.dirname(__filename)
  const filePath = path.resolve(__dirname, '../../../a.json')
  const raw = fs.readFileSync(filePath, 'utf8')
  return JSON.parse(raw)
}

describe('data store', () => {
  beforeEach(() => {
    // 每个测试前重置到空状态
    loadData({})
  })

  it('should keep data lossless from loadData to exportData', () => {
    const original = readDesktopAJson()

    loadData(original)
    const output = exportData()

    // items
    expect(output.items.length).toBe(407)
    expect(output.items.length).toBe(original.items.length)

    output.items.forEach((item, index) => {
      expect(item.id).toEqual(original.items[index].id)
      expect(item.sid).toEqual(original.items[index].sid)
      expect(item.cost).toEqual(original.items[index].cost)
    })

    // finance.records
    expect(output.finance.records.length).toBe(original.finance.records.length)

    // transfers
    expect(output.transfers.length).toBe(original.transfers.length)

    // payton.inventory
    expect(output.payton.inventory.length).toBe(original.payton.inventory.length)
  })
})
