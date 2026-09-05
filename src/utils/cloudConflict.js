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
 * @returns {'upload'|'use-cloud'}
 */
export function primaryConflictAction(type, localAt, cloudAt) {
  if (type === 'recovery') return 'use-cloud'
  if (type === 'upload-local') return 'upload'
  const local = toEpoch(localAt)
  const cloud = toEpoch(cloudAt)
  if (!local || !cloud || local === cloud) return 'upload'
  return local > cloud ? 'upload' : 'use-cloud'
}
