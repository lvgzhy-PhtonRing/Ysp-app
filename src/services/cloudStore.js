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
  const raw = data?.message || data?.error_description || data?.hint || data?.error || ''
  const suffix = raw ? `: ${raw}` : ` (HTTP ${status})`
  return new Error(`${prefix}${suffix}`)
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
  const resp = await fetch(target, {
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
  const resp = await fetch(target, {
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
  params.set('select', 'id,payload,updated_at,is_public,owner_id')
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

  const resp = await fetch(target, {
    method: 'GET',
    headers: buildJsonHeaders(config, nextSession?.accessToken),
    cache: 'no-store',
  })

  const data = await readJsonResponse(resp)
  if (!resp.ok) {
    throw buildApiError('读取云端数据失败', resp.status, data)
  }

  const rows = Array.isArray(data) ? data : []
  if (!rows.length) {
    return {
      row: null,
      payload: null,
      updatedAt: '',
      session: nextSession,
    }
  }

  const row = rows[0]
  return {
    row,
    payload: row?.payload ?? null,
    updatedAt: row?.updated_at || '',
    session: nextSession,
  }
}

export async function saveCloudState(rawConfig = {}, payload = {}, options = {}) {
  const config = normalizeCloudConfig(rawConfig)
  if (!isCloudConfigReady(config)) {
    throw new Error('云端配置不完整')
  }

  const { session = null, onSession = null, makePublic = true } = options
  const nextSession = await ensureSession(config, session, onSession)
  if (!nextSession?.accessToken) {
    throw new Error('请先登录云端账号')
  }

  const headers = {
    ...buildJsonHeaders(config, nextSession.accessToken),
    Prefer: 'return=representation',
  }

  const patchParams = new URLSearchParams()
  patchParams.set('id', `eq.${config.stateId}`)

  const patchResp = await fetch(`${config.supabaseUrl}/rest/v1/ysp_state?${patchParams.toString()}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({
      payload,
      is_public: Boolean(makePublic),
      updated_at: new Date().toISOString(),
    }),
  })

  const patchData = await readJsonResponse(patchResp)
  if (!patchResp.ok) {
    throw buildApiError('写入云端数据失败', patchResp.status, patchData)
  }

  const patchedRows = Array.isArray(patchData) ? patchData : []
  if (patchedRows.length > 0) {
    return {
      row: patchedRows[0],
      updatedAt: patchedRows[0]?.updated_at || '',
      session: nextSession,
    }
  }

  const insertRow = {
    id: config.stateId,
    payload,
    is_public: Boolean(makePublic),
  }
  if (nextSession?.user?.id) {
    insertRow.owner_id = nextSession.user.id
  }

  const insertResp = await fetch(`${config.supabaseUrl}/rest/v1/ysp_state`, {
    method: 'POST',
    headers,
    body: JSON.stringify([insertRow]),
  })

  const insertData = await readJsonResponse(insertResp)
  if (!insertResp.ok) {
    throw buildApiError('创建云端数据行失败', insertResp.status, insertData)
  }

  const insertedRows = Array.isArray(insertData) ? insertData : []
  return {
    row: insertedRows[0] || null,
    updatedAt: insertedRows[0]?.updated_at || '',
    session: nextSession,
  }
}

export async function readCloudConfigFromPublic(basePath = '/') {
  const safeBasePath = String(basePath || '/')
  const path = safeBasePath.endsWith('/') ? safeBasePath : `${safeBasePath}/`
  const target = `${path}cloud-config.json?t=${Date.now()}`

  const resp = await fetch(target, {
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
