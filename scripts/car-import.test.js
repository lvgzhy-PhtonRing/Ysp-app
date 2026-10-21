import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import fixture from '../src/__tests__/fixtures/carImport.json'
import { buildCarImport, parseCarExport, runImport } from './car-import.mjs'

const roots = []
afterEach(async () => Promise.all(roots.splice(0).map((path) => rm(path, { recursive: true, force: true }))))

describe('car import mapping', () => {
  it('reconstructs cutoff inventory, maps owner fields, balances and active loans', () => {
    const { payload, report } = buildCarImport(fixture, {
      items: [{ id: 'old', sid: 'already-payton', owner: 'payton' }],
      snapshots: [{ date: '2026-10-21' }],
      finance: { records: [], loans: [] },
    })
    expect(report.imported).toBe(2)
    expect(report.totalCost).toBe(31.9)
    expect(payload.items.map((item) => item.sid)).toEqual(['already-payton', 'keep-1', '55aeffc4-b720-483f-b85e-1d85067f0189'])
    expect(payload.items[1]).toMatchObject({ owner: 'payton', category: 'payton库存', status: 'inventory', stock: 1, batch: '2026年10月导入', name: '思域超宝', isLongTerm: false, inventoryDetails: { inStockDate: '2026-06-01' } })
    expect(payload.items[2]).toMatchObject({ name: '普卡 宝马507', isLongTerm: true })
    expect(payload.ownerRegistry.payton).toMatchObject({ pocketBalance: 10, investBalance: 20, monthlyAllowance: 200, openingAt: '2026-10-15', snapshotReconcile: { date: '2026-10-21', pendingSaleSid: '55aeffc4-b720-483f-b85e-1d85067f0189' } })
    expect(payload.ownerRegistry.payton.loans).toHaveLength(1)
    expect(report.excludedSold).toEqual(['sold-old'])
  })

  it('rejects duplicate car SIDs and Papa SID conflicts, while preserving existing Payton SID entries', () => {
    const duplicate = structuredClone(fixture)
    duplicate.cars.push({ ...duplicate.cars[0] })
    expect(() => buildCarImport(duplicate, {})).toThrow(/重复 SID/)
    expect(() => buildCarImport(fixture, { items: [{ sid: 'keep-1', owner: 'papa' }] })).toThrow(/SID 冲突/)
    const prior = { id: 'edited', sid: 'keep-1', owner: 'payton', cost: 999, status: 'sold' }
    const result = buildCarImport(fixture, { items: [prior] })
    expect(result.payload.items[0]).toEqual(prior)
    expect(result.report.skipped).toEqual(['keep-1'])
  })

  it('parses BOM exports and rejects invalid export shapes', () => {
    expect(parseCarExport(`\uFEFF${JSON.stringify(fixture)}`).cars).toHaveLength(3)
    expect(() => parseCarExport('{')).toThrow(/JSON/)
    expect(() => parseCarExport('{"cars":[]}')).toThrow(/accounts/)
  })
})

describe('runImport file safety', () => {
  it('backs up exact original bytes, writes report, and refuses input/output collisions', async () => {
    const root = await mkdtemp(join(tmpdir(), 'car-import-'))
    roots.push(root)
    const carPath = join(root, 'car.json')
    const yspPath = join(root, 'ysp.json')
    const outPath = join(root, 'merged.json')
    const carBytes = Buffer.from(`\uFEFF${JSON.stringify(fixture)}`)
    const yspBytes = Buffer.from('{"items":[],"finance":{"records":[],"loans":[]},"snapshots":[]}')
    await writeFile(carPath, carBytes)
    await writeFile(yspPath, yspBytes)
    await runImport({ carPath, yspPath, outPath })
    expect(await readFile(`${outPath}.bak`)).toEqual(yspBytes)
    expect(JSON.parse(await readFile(outPath, 'utf8')).items).toHaveLength(2)
    expect(JSON.parse(await readFile(`${outPath}.report.json`, 'utf8')).imported).toBe(2)
    expect(await readFile(carPath)).toEqual(carBytes)
    expect(await readFile(yspPath)).toEqual(yspBytes)
    await expect(runImport({ carPath, yspPath, outPath: resolve(yspPath) })).rejects.toThrow(/不能与输入路径相同/)
  })

  it('is idempotent when the prior merged payload becomes the next YSP input', async () => {
    const root = await mkdtemp(join(tmpdir(), 'car-import-rerun-'))
    roots.push(root)
    const carPath = join(root, 'car.json')
    const yspPath = join(root, 'ysp.json')
    const firstOut = join(root, 'first.json')
    const secondOut = join(root, 'second.json')
    await writeFile(carPath, JSON.stringify(fixture))
    await writeFile(yspPath, JSON.stringify({ items: [], finance: { records: [], loans: [] }, snapshots: [] }))
    await runImport({ carPath, yspPath, outPath: firstOut })
    const second = await runImport({ carPath, yspPath: firstOut, outPath: secondOut })
    expect(second.report.imported).toBe(0)
    expect(second.report.skipped).toHaveLength(2)
    expect(second.payload.items).toHaveLength(2)
  })
})
