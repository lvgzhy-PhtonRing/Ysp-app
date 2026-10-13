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

function checkReduction(label, fromName, toName, fromArr, toArr, reasons) {
  const fc = arrayCount(fromArr)
  const tc = arrayCount(toArr)
  if (fc === null || tc === null) return
  const minReduction = Math.max(OVERWRITE_THRESHOLD_MIN, Math.floor(fc * OVERWRITE_THRESHOLD_RATIO))
  const reduction = fc - tc
  if (reduction >= minReduction) {
    reasons.push(`${toName}${label}比${fromName}少 ${reduction} 条（${fromName} ${fc} → ${toName} ${tc}）`)
  }
}

/**
 * 比对两侧内容，返回「toLabel 相对 fromLabel 更贫瘠/更旧」的原因清单。
 * fromLabel 为参照侧（内容更全的一方为参照），toLabel 为被怀疑覆盖上去的一方。
 */
function detectDeficit(fromLabel, fromPayload, toLabel, toPayload) {
  const reasons = []

  checkReduction('商品数', fromLabel, toLabel, fromPayload?.items, toPayload?.items, reasons)
  checkReduction('收支记录', fromLabel, toLabel, fromPayload?.finance?.records, toPayload?.finance?.records, reasons)
  checkReduction('借贷记录', fromLabel, toLabel, fromPayload?.finance?.loans, toPayload?.finance?.loans, reasons)
  checkReduction('转运记录', fromLabel, toLabel, fromPayload?.transfers, toPayload?.transfers, reasons)
  checkReduction('美淘记录', fromLabel, toLabel, fromPayload?.rushcar?.entries, toPayload?.rushcar?.entries, reasons)

  const fromSale = lastSaleDate(fromPayload)
  const toSale = lastSaleDate(toPayload)
  if (fromSale && toSale && toSale < fromSale) {
    reasons.push(`${toLabel}最后销售日期早于${fromLabel}（${fromLabel} ${fromSale} → ${toLabel} ${toSale}）`)
  }

  return reasons
}

function buildDeficitResult(localPayload, cloudPayload, reasons) {
  const localCount = itemCount(localPayload)
  const cloudCount = itemCount(cloudPayload)
  return {
    shouldWarn: reasons.length > 0,
    reasons,
    countDiff: localCount !== null && cloudCount !== null ? localCount - cloudCount : 0,
    lastSaleLocal: lastSaleDate(localPayload),
    lastSaleCloud: lastSaleDate(cloudPayload),
  }
}

/**
 * 检测"云端覆盖本地"前是否应警告。
 * 触发条件：云端各集合记录数比本地少 ≥ max(5, 本地×10%)，或云端最后销售日期早于本地。
 * @returns {{ shouldWarn: boolean, reasons: string[], countDiff: number, lastSaleLocal: string, lastSaleCloud: string }}
 */
export function shouldWarnBeforeOverwrite(localPayload, cloudPayload) {
  return buildDeficitResult(localPayload, cloudPayload, detectDeficit('本地', localPayload, '云端', cloudPayload))
}

/**
 * 检测"本地覆盖云端"前是否应警告（shouldWarnBeforeOverwrite 的对称方向）。
 * 触发条件：本地各集合记录数比云端少 ≥ max(5, 云端×10%)，或本地最后销售日期早于云端。
 * 用途：本地时间戳较新不代表本地内容更新（时间戳可能被派生数据污染），
 * 若本地实际比云端更少/更旧，默认选本地会把陈旧数据写回云端。
 * @returns {{ shouldWarn: boolean, reasons: string[], countDiff: number, lastSaleLocal: string, lastSaleCloud: string }}
 */
export function shouldWarnBeforeUploadLocal(localPayload, cloudPayload) {
  return buildDeficitResult(localPayload, cloudPayload, detectDeficit('云端', cloudPayload, '本地', localPayload))
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
