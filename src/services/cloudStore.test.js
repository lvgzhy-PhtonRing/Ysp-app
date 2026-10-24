import { describe, expect, it, vi, afterEach } from 'vitest'
import { fetchCloudState, saveCloudState, signInWithPassword } from './cloudStore'

const CONFIG = {
  supabaseUrl: 'https://test.supabase.co',
  supabaseAnonKey: 'anon-key',
  stateId: 'main',
  enabled: true,
}

const SESSION = {
  accessToken: 'token', refreshToken: '', expiresAt: Math.floor(Date.now() / 1000) + 3600,
  tokenType: 'bearer', user: { id: '1', email: 'a@b.com' },
}

function mockFetchOnce(status, body) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  }))
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('signInWithPassword 错误信息', () => {
  it('Supabase 新版错误格式（error_code/msg）应展示具体原因', async () => {
    mockFetchOnce(400, { code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' })
    const err = await signInWithPassword(CONFIG, 'a@b.com', 'wrong').catch((e) => e)
    expect(err.message).toContain('Invalid login credentials')
  })

  it('无错误详情时回退为 HTTP 状态码', async () => {
    mockFetchOnce(400, null)
    const err = await signInWithPassword(CONFIG, 'a@b.com', 'wrong').catch((e) => e)
    expect(err.message).toContain('(HTTP 400)')
  })
})

describe('网络请求超时（防 syncing 重入锁卡死）', () => {
  it('请求永久挂起时超时抛出明确错误', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn((url, opts) => new Promise((_, reject) => {
      opts?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
    })))
    const pending = signInWithPassword(CONFIG, 'a@b.com', 'wrong')
    const assertion = expect(pending).rejects.toThrow('云端请求超时')
    await vi.advanceTimersByTimeAsync(30000)
    await assertion
  })
})

describe('saveCloudState keepalive 透传', () => {
  it('keepalive=true 的兜底上传请求正常完成（不破坏页面卸载保底逻辑）', async () => {
    const seen = {}
    vi.stubGlobal('fetch', vi.fn(async (url, opts) => {
      seen.keepalive = opts?.keepalive
      seen.url = url
      seen.body = JSON.parse(opts.body)
      return { ok: true, status: 200, text: async () => JSON.stringify([{ id: 'main', revision: 4, payload: {}, updated_at: '2026-10-14T00:00:00.000Z' }]) }
    }))
    const result = await saveCloudState(CONFIG, { items: [] }, { session: SESSION, makePublic: true, keepalive: true, expectedRevision: 3 })
    expect(result).toBeDefined()
    expect(result.updatedAt).toBe('2026-10-14T00:00:00.000Z')
    expect(result.revision).toBe(4)
    expect(seen.keepalive).toBe(true)
    expect(seen.url).toContain('revision=eq.3')
    expect(seen.body.revision).toBe(4)
  })
})

describe('cloud revision compare-and-swap', () => {
  it('returns the main row revision on read', async () => {
    mockFetchOnce(200, [{ id: 'main', payload: { items: [] }, revision: 7, updated_at: 't' }])
    const result = await fetchCloudState(CONFIG, { session: SESSION, publicOnly: false })
    expect(result.revision).toBe(7)
    expect(fetch.mock.calls[0][0]).toContain('revision')
  })

  it('refuses a main row without revision instead of allowing an unsafe write', async () => {
    mockFetchOnce(200, [{ id: 'main', payload: { items: [] }, updated_at: 't' }])
    await expect(fetchCloudState(CONFIG, { session: SESSION, publicOnly: false })).rejects.toThrow('云端版本')
  })

  it('explains a missing database revision column without modifying cloud data', async () => {
    mockFetchOnce(400, { code: '42703', message: 'column revision does not exist' })
    await expect(fetchCloudState(CONFIG, { session: SESSION, publicOnly: false })).rejects.toThrow('数据库版本迁移')
  })

  it('a zero-row conditional update is a conflict and never becomes an insert', async () => {
    const called = vi.fn(async () => ({ ok: true, status: 200, text: async () => '[]' }))
    vi.stubGlobal('fetch', called)
    const err = await saveCloudState(CONFIG, { items: [] }, { session: SESSION, expectedRevision: 7 }).catch((error) => error)
    expect(err.code).toBe('CLOUD_REVISION_CONFLICT')
    expect(called).toHaveBeenCalledTimes(1)
  })

  it('only an explicitly absent row can be initialized at revision zero', async () => {
    let seen
    vi.stubGlobal('fetch', vi.fn(async (url, options) => {
      seen = { url, method: options.method, body: JSON.parse(options.body) }
      return { ok: true, status: 201, text: async () => JSON.stringify([{ id: 'main', revision: 0, payload: { items: [] }, updated_at: 't' }]) }
    }))
    const result = await saveCloudState(CONFIG, { items: [] }, { session: SESSION, expectedRevision: null })
    expect(seen.method).toBe('POST')
    expect(seen.body[0].revision).toBe(0)
    expect(result.revision).toBe(0)
  })

  it('requires an explicit revision argument', async () => {
    vi.stubGlobal('fetch', vi.fn())
    await expect(saveCloudState(CONFIG, { items: [] }, { session: SESSION })).rejects.toThrow('云端版本')
    expect(fetch).not.toHaveBeenCalled()
  })
})
