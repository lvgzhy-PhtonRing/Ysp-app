// 云端采纳前快照存储（C 方案）：独立于 operationLogs，不参与 500 条截断
// 唯一还原依据，按天数保留（默认 365 天）

export const ADOPT_STORAGE_KEY = 'ysp_adopt_before'

const DEFAULT_MAX_AGE_MS = 365 * 86400000

function readAll() {
  try {
    const raw = localStorage.getItem(ADOPT_STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : null
    return Array.isArray(parsed?.adopts) ? parsed.adopts : []
  } catch (_) {
    return []
  }
}

function writeAll(adopts) {
  try {
    localStorage.setItem(ADOPT_STORAGE_KEY, JSON.stringify({ adopts }))
  } catch (_) {
    // localStorage 满：放弃本次写入，不影响业务采纳逻辑
  }
}

function nowIso(fallbackTime) {
  const d = fallbackTime ? new Date(fallbackTime) : new Date()
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString()
}

/**
 * 落一条采纳前快照。
 * @returns {string} adoptId（生成失败/写入失败仍返回 id 用于日志关联）
 */
export function appendAdoptBefore({ slot = '', before = null, beforeRev = null, cloudRev = null, time = '' }) {
  const adopt = {
    adoptId: `${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    time: nowIso(time),
    slot,
    before: before === null || before === undefined ? null : JSON.parse(JSON.stringify(before)),
    beforeRev,
    cloudRev,
  }
  const current = readAll()
  for (const item of current) {
    if (!item || !item.adoptId) continue
    // 去重：同 slot 同 time 视为重复落档，跳过
    if (item.slot === adopt.slot && item.time === adopt.time) return item.adoptId
  }
  writeAll([adopt, ...current])
  return adopt.adoptId
}

export function getAdoptBeforeById(adoptId) {
  if (!adoptId) return null
  return readAll().find((item) => item && item.adoptId === adoptId) || null
}

export function listAdoptBefore() {
  return readAll()
}

export function pruneAdoptBefore(maxAgeMs = DEFAULT_MAX_AGE_MS) {
  const cutoff = Date.now() - maxAgeMs
  const next = readAll().filter((item) => {
    const t = item && item.time ? new Date(item.time).getTime() : 0
    return Number.isFinite(t) && t >= cutoff
  })
  writeAll(next)
}
