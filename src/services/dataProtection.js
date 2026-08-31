// 数据保护纯函数：覆盖警告检测、每日备份判断、同步决策依据
// 与 DOM / 同步协议解耦，便于单测

export const OVERWRITE_THRESHOLD_MIN = 5 // 数量骤减阈值下限（条）
export const OVERWRITE_THRESHOLD_RATIO = 0.1 // 阈值比例；实际阈值 = max(5, 本地数量×10%)，取较大者

function itemCount(payload) {
  return Array.isArray(payload?.items) ? payload.items.length : null
}

function lastSaleDate(payload) {
  if (!Array.isArray(payload?.items)) return ''
  let latest = ''
  for (const item of payload.items) {
    const d = item?.saleDetails?.date
    if (typeof d === 'string' && d && d > latest) latest = d
  }
  return latest
}

/**
 * 检测"云端覆盖本地"前是否应警告。
 * 触发条件：云端商品数比本地少 ≥ max(5, 本地×10%)，或云端最后销售日期早于本地。
 * @returns {{ shouldWarn: boolean, reasons: string[], countDiff: number, lastSaleLocal: string, lastSaleCloud: string }}
 */
export function shouldWarnBeforeOverwrite(localPayload, cloudPayload) {
  const reasons = []
  const localCount = itemCount(localPayload)
  const cloudCount = itemCount(cloudPayload)
  const lastSaleLocal = lastSaleDate(localPayload)
  const lastSaleCloud = lastSaleDate(cloudPayload)

  if (localCount !== null && cloudCount !== null) {
    const minReduction = Math.max(OVERWRITE_THRESHOLD_MIN, Math.floor(localCount * OVERWRITE_THRESHOLD_RATIO))
    const reduction = localCount - cloudCount
    if (reduction >= minReduction) {
      reasons.push(`云端商品数比本地少 ${reduction} 条（本地 ${localCount} → 云端 ${cloudCount}）`)
    }
  }

  if (lastSaleLocal && lastSaleCloud && lastSaleCloud < lastSaleLocal) {
    reasons.push(`云端最后销售日期早于本地（本地 ${lastSaleLocal} → 云端 ${lastSaleCloud}）`)
  }

  return {
    shouldWarn: reasons.length > 0,
    reasons,
    countDiff: localCount !== null && cloudCount !== null ? localCount - cloudCount : 0,
    lastSaleLocal,
    lastSaleCloud,
  }
}

/** 是否该触发今日自动备份（今日未备份过则触发） */
export function isBackupDue(todayStr, lastBackupDate) {
  return lastBackupDate !== todayStr
}

/**
 * 将覆盖警告结果映射为 cloud_conflict 日志的决策依据字段。
 * 字段名对齐 spec：countDiff / lastSaleBefore / lastSaleAfter / reasons。
 */
export function buildSyncRationale(warn) {
  return {
    countDiff: warn?.countDiff ?? 0,
    lastSaleBefore: warn?.lastSaleLocal ?? '',
    lastSaleAfter: warn?.lastSaleCloud ?? '',
    reasons: Array.isArray(warn?.reasons) ? warn.reasons : [],
  }
}
