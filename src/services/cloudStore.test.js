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
