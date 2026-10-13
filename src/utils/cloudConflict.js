// 云冲突弹窗主按钮方向判定

function toEpoch(t) {
  if (!t) return 0
  const n = new Date(t).getTime()
  return Number.isFinite(n) ? n : 0
}

/**
 * 根据冲突类型与双方时间戳，决定主操作按钮方向。
 * @param {'upload-local'|'manual-sync'|'recovery'|string} type - 冲突类型
 * @param {string} localAt - 本地数据时间
 * @param {string} cloudAt - 云端数据时间
 * @param {boolean} [localPoorerThanCloud=false] - 内容比对显示本地实际比云端更少/更旧
 * @returns {'upload'|'use-cloud'}
 */
export function primaryConflictAction(type, localAt, cloudAt, localPoorerThanCloud = false) {
  if (type === 'recovery') return 'use-cloud'
  if (type === 'upload-local') return 'upload'
  const local = toEpoch(localAt)
  const cloud = toEpoch(cloudAt)
  // 时间戳缺失/相等时回退"本地"（保持既有语义）
  const byTime = !local || !cloud || local === cloud ? 'upload' : (local > cloud ? 'upload' : 'use-cloud')
  // 时间戳可能因派生数据（如每日快照）被误刷为"今天"。
  // 内容证据明确显示本地更贫瘠/更旧时，时间戳不可信，默认改用云端。
  if (byTime === 'upload' && localPoorerThanCloud) return 'use-cloud'
  return byTime
}
