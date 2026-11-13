import { beforeEach, describe, expect, it, vi } from 'vitest'
import { addCarArchiveToBackup, parseCarArchiveText, readCarArchive, restoreCarArchiveFromBackup, saveCarArchiveOnce, validateCarArchive } from './carHistoryArchive'

const data = () => ({ cars: [{ sid: 'a', name: '旧名' }], accounts: { pocket: { transactions: [] }, invest: { transactions: [], loans: [] } }, operationLogs: [], transferPairs: [], expectedPrices: {} })
beforeEach(() => {
  const values = new Map()
  vi.stubGlobal('localStorage', { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) })
})

describe('独立 car 历史档案', () => {
  it('支持带 BOM 的真实备份编码', () => {
    expect(parseCarArchiveText('\uFEFF' + JSON.stringify(data())).cars[0].sid).toBe('a')
  })
  it('完整备份可恢复且不会与当前商品共用引用', () => {
    saveCarArchiveOnce({ data: data(), sourceFile: 'car.json' })
    const backup = addCarArchiveToBackup({ items: [{ sid: 'a', name: '新名' }] })
    backup.items[0].name = '再次改名'
    expect(readCarArchive().data.cars[0].name).toBe('旧名')
    expect(restoreCarArchiveFromBackup(backup)).toBe(true)
  })
  it('拒绝非法文件和覆盖不同快照', () => {
    expect(() => validateCarArchive({ cars: [] })).toThrow()
    saveCarArchiveOnce({ data: data() })
    const changed = data(); changed.cars[0].name = '不同'
    expect(() => saveCarArchiveOnce({ data: changed })).toThrow('未覆盖')
    expect(readCarArchive().data.cars[0].name).toBe('旧名')
  })
  it('容许 JSON 对象键顺序不同的相同档案', () => {
    const original = data(); saveCarArchiveOnce({ data: original })
    const reordered = { expectedPrices: {}, transferPairs: [], operationLogs: [], accounts: original.accounts, cars: original.cars }
    expect(() => saveCarArchiveOnce({ data: reordered })).not.toThrow()
  })
})
