import { afterEach, describe, expect, it, vi } from 'vitest'
import { syncCarArchive } from './carArchiveCloud'

const config = { supabaseUrl: 'https://example.test', supabaseAnonKey: 'key', stateId: 'main' }
const session = { accessToken: 'token', expiresAt: 4102444800, user: { id: 'owner' } }
const archive = { data: { cars: [{ sid: 'a' }], accounts: { pocket: { transactions: [] }, invest: { transactions: [], loans: [] } }, operationLogs: [], transferPairs: [], expectedPrices: {} } }
afterEach(() => vi.unstubAllGlobals())

describe('独立档案云同步', () => {
  it('云端存在不同档案时不写入', async () => {
    const other = structuredClone(archive); other.data.cars[0].sid = 'b'
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => [{ payload: other }] })
    vi.stubGlobal('fetch', fetch)
    await expect(syncCarArchive(config, session, archive)).rejects.toThrow('未覆盖')
    expect(fetch).toHaveBeenCalledTimes(1)
  })
  it('空档案云端只写入独立表且指定当前用户', async () => {
    const fetch = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => [] }).mockResolvedValueOnce({ ok: true })
    vi.stubGlobal('fetch', fetch)
    await syncCarArchive(config, session, archive)
    expect(fetch.mock.calls[1][0]).toContain('/ysp_car_history_archive')
    expect(JSON.parse(fetch.mock.calls[1][1].body).owner_id).toBe('owner')
  })
})
