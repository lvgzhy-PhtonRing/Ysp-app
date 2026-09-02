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

function arrayCount(arr) {
  return Array.isArray(arr) ? arr.length : null
}

function checkReduction(label, localArr, cloudArr, reasons) {
  const lc = arrayCount(localArr)
  const cc = arrayCount(cloudArr)
  if (lc === null || cc === null) return
  const minReduction = Math.max(OVERWRITE_THRESHOLD_MIN, Math.floor(lc * OVERWRITE_THRESHOLD_RATIO))
  const reduction = lc - cc
  if (reduction >= minReduction) {
    reasons.push(`云端${label}比本地少 ${reduction} 条（本地 ${lc} → 云端 ${cc}）`)
  }
}

/**
 * 检测"云端覆盖本地"前是否应警告。
 * 触发条件：云端各集合记录数比本地少 ≥ max(5, 本地×10%)，或云端最后销售日期早于本地。
 * @returns {{ shouldWarn: boolean, reasons: string[], countDiff: number, lastSaleLocal: string, lastSaleCloud: string }}
 */
export function shouldWarnBeforeOverwrite(localPayload, cloudPayload) {
  const reasons = []
  const localCount = itemCount(localPayload)
  const cloudCount = itemCount(cloudPayload)
  const lastSaleLocal = lastSaleDate(localPayload)
  const lastSaleCloud = lastSaleDate(cloudPayload)

  checkReduction('商品数', localPayload?.items, cloudPayload?.items, reasons)
  checkReduction('收支记录', localPayload?.finance?.records, cloudPayload?.finance?.records, reasons)
  checkReduction('借贷记录', localPayload?.finance?.loans, cloudPayload?.finance?.loans, reasons)
  checkReduction('转运记录', localPayload?.transfers, cloudPayload?.transfers, reasons)
  checkReduction('美淘记录', localPayload?.rushcar?.entries, cloudPayload?.rushcar?.entries, reasons)

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

/**
 * 下载 JSON 备份到浏览器 Downloads。
 * 非用户手势调用可能被浏览器静默拦截（调用方需提供手动下载兜底入口）。
 * @returns {boolean} 是否真正触发了下载（无 document 时返回 false）
 */
export function downloadJsonBackup(data, filename) {
  if (typeof document === 'undefined') return false
  try {
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    return true
  } catch (err) {
    console.error('[autoBackup] 下载失败:', err)
    return false
  }
}
