// 网络请求统一超时：防止 fetch 永久挂起导致 syncing 重入锁卡死（同步瘫痪 + 假成功）
const FETCH_TIMEOUT_MS = 30000

async function fetchWithTimeout(url, options = {}, timeoutMs = FETCH_TIMEOUT_MS) {
  const controller = new AbortController()
  const timer = timeoutMs ? setTimeout(() => controller.abort(), timeoutMs) : null
  try {
    const signal = options.signal && typeof AbortSignal.any === 'function'
      ? AbortSignal.any([options.signal, controller.signal])
      : controller.signal
    return await fetch(url, { ...options, signal })
  } catch (err) {
    if (controller.signal.aborted && !options.signal?.aborted) {
      throw new Error('云端请求超时，请检查网络后重试')
    }
    throw err
  } finally {
    if (timer) clearTimeout(timer)
  }
}

function trimString(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeBaseUrl(url) {
  return trimString(url).replace(/\/+$/, '')
}

export function normalizeCloudConfig(raw = {}) {
  return {
    supabaseUrl: normalizeBaseUrl(raw.supabaseUrl || raw.url),
    supabaseAnonKey: trimString(raw.supabaseAnonKey || raw.anonKey),
    stateId: trimString(raw.stateId) || 'main',
    enabled: Boolean(raw.enabled),
    publicRead: raw.publicRead !== false,
  }
}

export function isCloudConfigReady(raw = {}) {
  const config = normalizeCloudConfig(raw)
  return Boolean(config.supabaseUrl && config.supabaseAnonKey && config.stateId)
}

function buildJsonHeaders(config, accessToken = '') {
  const bearer = accessToken || config.supabaseAnonKey
  return {
    apikey: config.supabaseAnonKey,
    Authorization: `Bearer ${bearer}`,
    'Content-Type': 'application/json',
  }
}

async function readJsonResponse(resp) {
  const text = await resp.text()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch (_) {
    return { message: text }
  }
}

function buildApiError(prefix, status, data) {
  const raw = data?.msg || data?.message || data?.error_description || data?.hint || data?.error || data?.error_code || ''
  const suffix = raw ? `: ${raw}` : ` (HTTP ${status})`
  return new Error(`${prefix}${suffix}`)
}

function requireCloudRevision(value) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error('云端版本信息缺失或无效，请先执行数据库版本迁移；已停止写入以保护数据')
  }
  return value
}

function revisionConflict() {
  const error = new Error('云端数据已被其他设备更新，正在重新核对')
  error.code = 'CLOUD_REVISION_CONFLICT'
  return error
}

function mapSession(data = {}, fallbackEmail = '') {
  const expiresIn = Number(data.expires_in || 0)
  const expiresAt = Number(data.expires_at || 0) || Math.floor(Date.now() / 1000) + expiresIn
  return {
    accessToken: data.access_token || '',
    refreshToken: data.refresh_token || '',
    expiresAt,
    tokenType: data.token_type || 'bearer',
    user: {
      id: data.user?.id || '',
      email: data.user?.email || fallbackEmail || '',
    },
  }
}

export function hasValidSession(session, safeWindowSeconds = 60) {
  if (!session?.accessToken) return false
  const expiresAt = Number(session.expiresAt || 0)
  if (!Number.isFinite(expiresAt) || expiresAt <= 0) return false
  return expiresAt - safeWindowSeconds > Math.floor(Date.now() / 1000)
}

/**
 * 服务端登出：调用 Supabase /auth/v1/logout 吊销会话令牌。
 * 尽力而为：网络失败或令牌已失效时不抛错，本地清理由调用方负责。
 */
export async function signOutCloudSession(rawConfig = {}, session = null) {
  const config = normalizeCloudConfig(rawConfig)
  if (!isCloudConfigReady(config)) return
  let token = trimString(session?.accessToken)
  if (!token) return

  // access token 若已过期，先用 refresh token 换新后再登出，确保吊销生效
  if (!hasValidSession(session)) {
    try {
      const refreshed = await refreshCloudSession(config, session)
      if (refreshed?.accessToken) token = refreshed.accessToken
    } catch (_) {
      // 刷新失败：仍尝试用原 token 登出（可能失败，尽力而为）
    }
  }

  try {
    await fetchWithTimeout(`${config.supabaseUrl}/auth/v1/logout`, {
      method: 'POST',
      headers: buildJsonHeaders(config, token),
    })
  } catch (_) {
    // 尽力而为，网络异常不抛给上层
  }
}

export async function signInWithPassword(rawConfig = {}, email = '', password = '') {
  const config = normalizeCloudConfig(rawConfig)
  if (!isCloudConfigReady(config)) {
    throw new Error('云端配置不完整')
  }

  const userEmail = trimString(email)
  const userPassword = String(password || '')
  if (!userEmail || !userPassword) {
    throw new Error('请填写云端账号和密码')
  }

  const target = `${config.supabaseUrl}/auth/v1/token?grant_type=password`
  const resp = await fetchWithTimeout(target, {
    method: 'POST',
    headers: buildJsonHeaders(config),
    body: JSON.stringify({
      email: userEmail,
      password: userPassword,
    }),
  })

  const data = await readJsonResponse(resp)
  if (!resp.ok) {
    throw buildApiError('云端登录失败', resp.status, data)
  }
  return mapSession(data, userEmail)
}

export async function refreshCloudSession(rawConfig = {}, session = null) {
  const config = normalizeCloudConfig(rawConfig)
  if (!isCloudConfigReady(config)) {
    throw new Error('云端配置不完整')
  }
  const refreshToken = trimString(session?.refreshToken)
  if (!refreshToken) {
    throw new Error('云端登录已过期，请重新登录')
  }

  const target = `${config.supabaseUrl}/auth/v1/token?grant_type=refresh_token`
  const resp = await fetchWithTimeout(target, {
    method: 'POST',
    headers: buildJsonHeaders(config),
    body: JSON.stringify({
      refresh_token: refreshToken,
    }),
  })

  const data = await readJsonResponse(resp)
  if (!resp.ok) {
    throw buildApiError('刷新云端会话失败', resp.status, data)
  }

  const next = mapSession(data, session?.user?.email || '')
  if (!next.user?.id && session?.user?.id) {
    next.user.id = session.user.id
  }
  if (!next.user?.email && session?.user?.email) {
    next.user.email = session.user.email
  }
  return next
}

async function ensureSession(rawConfig = {}, session = null, onSession = null) {
  if (!session?.accessToken) return null
  if (hasValidSession(session)) return session

  const refreshed = await refreshCloudSession(rawConfig, session)
  if (typeof onSession === 'function') {
    onSession(refreshed)
  }
  return refreshed
}

function buildStateQuery(config, { publicOnly = true } = {}) {
  const params = new URLSearchParams()
  params.set('id', `eq.${config.stateId}`)
  if (publicOnly) {
    params.set('is_public', 'eq.true')
  }
  params.set('select', 'id,payload,updated_at,is_public,owner_id,revision')
  params.set('limit', '1')
  return `${config.supabaseUrl}/rest/v1/ysp_state?${params.toString()}`
}

export async function fetchCloudState(rawConfig = {}, options = {}) {
  const config = normalizeCloudConfig(rawConfig)
  if (!isCloudConfigReady(config)) {
    throw new Error('云端配置不完整')
  }

  const { session = null, onSession = null, publicOnly = true } = options
  const nextSession = await ensureSession(config, session, onSession)
  const target = buildStateQuery(config, {
    publicOnly: Boolean(publicOnly) && !nextSession?.accessToken,
  })

  const resp = await fetchWithTimeout(target, {
    method: 'GET',
    headers: buildJsonHeaders(config, nextSession?.accessToken),
    cache: 'no-store',
  })

  const data = await readJsonResponse(resp)
  if (!resp.ok) {
    if (data?.code === '42703' && String(data?.message || '').includes('revision')) {
      throw new Error('云端缺少版本字段，请先执行数据库版本迁移；已停止同步以保护数据')
    }
    throw buildApiError('读取云端数据失败', resp.status, data)
  }

  const rows = Array.isArray(data) ? data : []
  if (!rows.length) {
    return {
      row: null,
      payload: null,
      updatedAt: '',
      revision: null,
      session: nextSession,
    }
  }

  const row = rows[0]
  return {
    row,
    payload: row?.payload ?? null,
    updatedAt: row?.updated_at || '',
    revision: requireCloudRevision(row?.revision),
    session: nextSession,
  }
}

export async function saveCloudState(rawConfig = {}, payload = {}, options = {}) {
  const config = normalizeCloudConfig(rawConfig)
  if (!isCloudConfigReady(config)) {
    throw new Error('云端配置不完整')
  }

  const { session = null, onSession = null, makePublic = true, keepalive = false, expectedRevision } = options
  if (expectedRevision !== null) requireCloudRevision(expectedRevision)
  const nextSession = await ensureSession(config, session, onSession)
  if (!nextSession?.accessToken) {
    throw new Error('请先登录云端账号')
  }

  const headers = {
    ...buildJsonHeaders(config, nextSession.accessToken),
    Prefer: 'return=representation',
  }

  if (expectedRevision !== null) {
    const patchParams = new URLSearchParams()
    patchParams.set('id', `eq.${config.stateId}`)
    patchParams.set('revision', `eq.${expectedRevision}`)
    const patchResp = await fetchWithTimeout(`${config.supabaseUrl}/rest/v1/ysp_state?${patchParams.toString()}`, {
      method: 'PATCH', headers,
      body: JSON.stringify({ payload, is_public: Boolean(makePublic), revision: expectedRevision + 1 }),
      keepalive,
    }, keepalive ? null : FETCH_TIMEOUT_MS)
    const patchData = await readJsonResponse(patchResp)
    if (!patchResp.ok) throw buildApiError('写入云端数据失败', patchResp.status, patchData)
    const patchedRows = Array.isArray(patchData) ? patchData : []
    if (!patchedRows.length) throw revisionConflict()
    requireCloudRevision(patchedRows[0]?.revision)
    return {
      row: patchedRows[0],
      updatedAt: patchedRows[0]?.updated_at || '',
      payload: patchedRows[0]?.payload ?? payload,
      revision: patchedRows[0].revision,
      session: nextSession,
    }
  }

  const insertRow = {
    id: config.stateId,
    payload,
    is_public: Boolean(makePublic),
    revision: 0,
  }
  if (nextSession?.user?.id) {
    insertRow.owner_id = nextSession.user.id
  }

  const insertResp = await fetchWithTimeout(`${config.supabaseUrl}/rest/v1/ysp_state`, {
    method: 'POST',
    headers,
    body: JSON.stringify([insertRow]),
    keepalive,
  }, keepalive ? null : FETCH_TIMEOUT_MS)

  const insertData = await readJsonResponse(insertResp)
  if (insertResp.status === 409) throw revisionConflict()
  if (!insertResp.ok) {
    throw buildApiError('创建云端数据行失败', insertResp.status, insertData)
  }

  const insertedRows = Array.isArray(insertData) ? insertData : []
  if (!insertedRows.length) throw new Error('云端初始化未返回数据，已停止同步')
  requireCloudRevision(insertedRows[0]?.revision)
  return {
    row: insertedRows[0] || null,
    updatedAt: insertedRows[0]?.updated_at || '',
    payload: insertedRows[0]?.payload ?? payload,
    revision: insertedRows[0].revision,
    session: nextSession,
  }
}

export async function readCloudConfigFromPublic(basePath = '/') {
  const safeBasePath = String(basePath || '/')
  const path = safeBasePath.endsWith('/') ? safeBasePath : `${safeBasePath}/`
  const target = `${path}cloud-config.json?t=${Date.now()}`

  const resp = await fetchWithTimeout(target, {
    method: 'GET',
    cache: 'no-store',
  })

  if (!resp.ok) {
    throw new Error('未找到 cloud-config.json')
  }

  const data = await readJsonResponse(resp)
  if (!data || typeof data !== 'object') {
    throw new Error('cloud-config.json 格式错误')
  }

  return normalizeCloudConfig(data)
}
