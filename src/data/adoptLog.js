// 云端采纳前快照存储（C 方案）：独立于 operationLogs，不参与 500 条截断
// 唯一还原依据。保留策略为「天数 + 容量」双闸：配额是整个 origin 共享的，
// 只按天数修剪挡不住「一次采纳 = 上千条商品的完整载荷」。

export const ADOPT_STORAGE_KEY = 'ysp_adopt_before'

const DEFAULT_MAX_AGE_MS = 365 * 86400000
export const MAX_TOTAL_BYTES = 1024 * 1024 // 默认 1MB 容量上限
export const MAX_ENTRIES = 20               // 默认最多保留 20 份
const FULL_IMPORT_SLOT = '__full_import__' // 整份应用载荷，体积最大、回溯价值最低

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
    return true
  } catch (_) {
    // localStorage 满：放弃本次写入，不影响业务采纳逻辑
    return false
  }
}

function totalBytes(adopts) {
  return JSON.stringify({ adopts }).length
}

function isFullImport(item) {
  return !!(item && item.slot === FULL_IMPORT_SLOT)
}

/** 最该被牺牲的一条下标：优先整份导入前快照，其次最老的一条（数组按时间倒序）。无则 -1 */
function victimIndex(pool) {
  for (let i = pool.length - 1; i >= 0; i--) {
    if (isFullImport(pool[i])) return i
  }
  return pool.length > 0 ? pool.length - 1 : -1
}

/** 按容量裁剪：先卡条数上限，再在总字节超限时逐条淘汰最该牺牲的快照 */
export function shrinkToFit(adopts, opts = {}) {
  const { maxBytes = MAX_TOTAL_BYTES, maxEntries = MAX_ENTRIES } = opts
  const next = adopts.slice(0, maxEntries)
  while (totalBytes(next) > maxBytes) {
    const i = victimIndex(next)
    if (i < 0) break
    next.splice(i, 1)
  }
  return next
}

/**
 * 写入并落盘；配额不足时逐条牺牲旧快照后重试，尽力保住最新一份。
 * 一份都放不下时不写空集冒充成功，返回 false。
 */
export function writeAllRetry(adopts, opts = {}) {
  const pool = shrinkToFit(adopts, opts)
  for (;;) {
    if (pool.length === 0) return false
    if (writeAll(pool)) return true
    pool.splice(victimIndex(pool), 1)
  }
}

/** 丢弃最该牺牲的一条快照以腾配额（整份导入前快照优先，其次最老的）。返回是否真的删掉了 */
export function evictOldestAdoptBefore() {
  const pool = readAll()
  const i = victimIndex(pool)
  if (i < 0) return false
  const next = pool.slice(0, i).concat(pool.slice(i + 1))
  return writeAll(next)
}

/** 按更紧的容量强制裁剪并落盘（主数据写入失败时腾配额用） */
export function trimAdoptBeforeToBudget(opts = {}) {
  return writeAllRetry(readAll(), opts)
}

function nowIso(fallbackTime) {
  const d = fallbackTime ? new Date(fallbackTime) : new Date()
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString()
}

/**
 * 落一条采纳前快照。
 * @returns {{ adoptId: string, persisted: boolean }} adoptId 用于日志关联；persisted 标记是否成功持久化
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
    if (item.slot === adopt.slot && item.time === adopt.time) return { adoptId: item.adoptId, persisted: true }
  }
  const persisted = writeAllRetry([adopt, ...current])
  pruneAdoptBefore()
  return { adoptId: adopt.adoptId, persisted }
}

export function getAdoptBeforeById(adoptId) {
  if (!adoptId) return null
  return readAll().find((item) => item && item.adoptId === adoptId) || null
}

export function listAdoptBefore() {
  return readAll()
}

/**
 * 取最近一次导入前的完整快照（slot 为 __full_import__）。
 * @returns {object|null} 完整 exportData payload；无导入前快照时返回 null
 */
export function latestFullImportSnapshot() {
  const snap = readAll()
    .filter((item) => item && item.slot === FULL_IMPORT_SLOT && item.before !== null && item.before !== undefined)
    .sort((a, b) => new Date(b.time) - new Date(a.time))[0]
  return snap ? JSON.parse(JSON.stringify(snap.before)) : null
}

export function pruneAdoptBefore(maxAgeMs = DEFAULT_MAX_AGE_MS) {
  const cutoff = Date.now() - maxAgeMs
  const aged = readAll().filter((item) => {
    const t = item && item.time ? new Date(item.time).getTime() : 0
    return Number.isFinite(t) && t >= cutoff
  })
  return writeAllRetry(aged)
}
