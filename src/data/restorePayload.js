// 数据回溯（E2）恢复目标的版本化适配：纯函数，不依赖 store 实例
//
// reconstructAtTime 的回放输出不含 _rev/updatedAt。若直接以空 _rev 恢复，
// 变更槽位 localRev=0 会被 computeSlotPlan 判为 conflict（而非 upload），
// 自动同步整轮跳过，恢复内容无法上云。此处对「内容与当前不同的槽位」rev+1，
// 使下次同步判定为 upload 自动上云；未变槽位沿用当前 rev，语义与内容一致。

import { SLOT_KEYS, slotValue } from './cloudSlotPlan'
import { stableSerialize } from './store'

/**
 * 为恢复目标 payload 生成新的 _rev 与 updatedAt。
 * @param {object} priorPayload  回放重建的嵌套 payload（无有效 _rev）
 * @param {object} currentPayload 当前 exportData()（作为 rev 基线）
 * @param {string} [at] 恢复时间戳（默认当前时间）
 * @returns {object} 新 payload：变更槽位 rev+1，未变槽位沿用当前 rev，updatedAt=at
 */
export function finalizeRestorePayload(priorPayload, currentPayload, at = new Date().toISOString()) {
  const currentRev =
    currentPayload && typeof currentPayload === 'object' && currentPayload._rev && typeof currentPayload._rev === 'object'
      ? currentPayload._rev
      : {}
  const nextRev = {}
  for (const slot of SLOT_KEYS) {
    const cur = currentRev[slot]
    const changed = stableSerialize(slotValue(priorPayload, slot)) !== stableSerialize(slotValue(currentPayload, slot))
    nextRev[slot] = changed
      ? { rev: (Number(cur?.rev) || 0) + 1, at }
      : { rev: Number(cur?.rev) || 0, at: cur?.at || '' }
  }
  return { ...priorPayload, _rev: nextRev, updatedAt: at }
}
