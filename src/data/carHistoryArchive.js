export const CAR_ARCHIVE_KEY = 'ysp_car_history_archive_v1'

export function canonicalArchiveValue(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalArchiveValue).join(',')}]`
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalArchiveValue(value[key])}`).join(',')}}`
  return JSON.stringify(value)
}

export function validateCarArchive(data) {
  if (!data || typeof data !== 'object' || !Array.isArray(data.cars) ||
      !data.accounts?.pocket || !data.accounts?.invest ||
      !Array.isArray(data.accounts.pocket.transactions) || !Array.isArray(data.accounts.invest.transactions) ||
      !Array.isArray(data.accounts.invest.loans) || !Array.isArray(data.transferPairs) ||
      !Array.isArray(data.operationLogs) || !data.expectedPrices || typeof data.expectedPrices !== 'object') {
    throw new Error('文件不是完整的 car 备份，未保存档案')
  }
  return data
}

export function parseCarArchiveText(text) {
  return validateCarArchive(JSON.parse(String(text).replace(/^\uFEFF/, '')))
}

export function readCarArchive() {
  const raw = localStorage.getItem(CAR_ARCHIVE_KEY)
  if (!raw) return null
  const archive = JSON.parse(raw)
  validateCarArchive(archive.data)
  return archive
}

export function saveCarArchiveOnce(archive) {
  validateCarArchive(archive?.data)
  const existing = readCarArchive()
  if (existing) {
    if (canonicalArchiveValue(existing.data) !== canonicalArchiveValue(archive.data)) throw new Error('本机已有不同的历史档案，未覆盖')
    return existing
  }
  localStorage.setItem(CAR_ARCHIVE_KEY, JSON.stringify(archive))
  return readCarArchive()
}

export function markCarArchiveCloudSynced(at = new Date().toISOString()) {
  const archive = readCarArchive()
  if (!archive) return null
  const updated = { ...archive, cloudSyncedAt: at }
  localStorage.setItem(CAR_ARCHIVE_KEY, JSON.stringify(updated))
  return updated
}

export function addCarArchiveToBackup(payload) {
  const archive = readCarArchive()
  return archive ? { ...payload, carHistoryArchive: archive } : payload
}

export function restoreCarArchiveFromBackup(payload) {
  if (!payload?.carHistoryArchive) return false
  saveCarArchiveOnce(payload.carHistoryArchive)
  return true
}
