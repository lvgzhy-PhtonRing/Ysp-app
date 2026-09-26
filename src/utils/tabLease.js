// 跨标签页编辑租约：共享 localStorage 心跳 + TTL，用于判定「另一标签页是否正在编辑」
// 与 DOM / 同步协议解耦，纯函数可单测

export const TAB_LEASE_KEY = 'ysp_tab'
export const TAB_LEASE_TTL_MS = 5000 // 心跳过期阈值：超过即视为该 tab 已关闭/崩溃
export const TAB_HEARTBEAT_MS = 2000 // 心跳写间隔（应小于 TTL）
export const TAB_DISMISS_COOLDOWN_MS = 30000 // 用户手动关闭提示后的静默期

export function parseTabLease(raw) {
  if (!raw) return null
  try {
    const o = JSON.parse(raw)
    return {
      id: typeof o.id === 'string' ? o.id : '',
      at: Number(o.at) || 0,
      touch: Number(o.touch) || 0,
    }
  } catch (_) {
    return null
  }
}

/**
 * 判定本页是否应提示「另一标签页正在编辑」。
 * 仅当同时满足：对方租约新鲜（TTL 内）、对方非本页、对方确有交互过、
 * 且对方最近活跃时间不晚于本页 —— 避免两个 tab 互相锁定 / 空转误报。
 * @param {object|null} other - 读到的另一 tab 租约（parseTabLease 结果）
 * @param {object|null} own   - 本页租约 { id, at, touch }
 * @param {number} now        - 注入当前时间，便于单测
 */
export function shouldWarnEditorLock(other, own, now = Date.now()) {
  if (!other || !own) return false
  if (!other.id || other.id === own.id) return false
  if (!other.at || now - other.at > TAB_LEASE_TTL_MS) return false
  if (!other.touch) return false
  return other.touch >= own.touch
}

/**
 * 判定本页是否被另一 tab 锁住（最后交互者持锁）。
 * 锁定条件：对方活跃（TTL 内）、非本页、对方 touch 严格大于本页。
 * return true 表示"本页应进入只读（遮罩）"。
 */
export function shouldHoldLock(other, own, now = Date.now()) {
  if (!other || !own) return false
  if (!other.id || other.id === own.id) return false
  if (!other.at || now - other.at > TAB_LEASE_TTL_MS) return false
  return other.touch > own.touch
}