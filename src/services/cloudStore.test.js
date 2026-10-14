import { describe, expect, it, vi, afterEach } from 'vitest'
import { signInWithPassword } from './cloudStore'

const CONFIG = {
  supabaseUrl: 'https://test.supabase.co',
  supabaseAnonKey: 'anon-key',
  stateId: 'main',
  enabled: true,
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
    const session = {
      accessToken: 'token',
      refreshToken: '',
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
      tokenType: 'bearer',
      user: { id: '1', email: 'a@b.com' },
    }
    vi.stubGlobal('fetch', vi.fn(async (url, opts) => {
      seen.keepalive = opts?.keepalive
      return { ok: true, status: 200, text: async () => JSON.stringify([{ id: 'main', payload: {}, updated_at: '2026-10-14T00:00:00.000Z' }]) }
    }))
    const { saveCloudState } = await import('./cloudStore')
    const result = await saveCloudState(CONFIG, { items: [] }, { session, makePublic: true, keepalive: true })
    expect(result).toBeDefined()
    expect(result.updatedAt).toBe('2026-10-14T00:00:00.000Z')
    expect(seen.keepalive).toBe(true)
  })
})
