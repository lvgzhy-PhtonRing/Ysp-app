// 云同步槽位版本化纯函数：9 个数据集合的取值/版本/合并，与 DOM 与同步协议解耦
export const SLOT_KEYS = [
  'items', 'calc', 'finance.records', 'finance.loans', 'transfers',
  'rushcar.entries', 'rushcar.forwarderInfos', 'rushcar.mattelSiteInfos', 'rushcar.paymentCards',
]

export const SLOT_LABELS = {
  items: '商品', calc: '财务结算', 'finance.records': '收支记录', 'finance.loans': '借贷记录',
  transfers: '转运记录', 'rushcar.entries': '美淘记录', 'rushcar.forwarderInfos': '转运公司',
  'rushcar.mattelSiteInfos': '美泰站点', 'rushcar.paymentCards': '支付卡',
}

const SLOT_PATHS = {
  items: ['items'], calc: ['calc'], 'finance.records': ['finance', 'records'], 'finance.loans': ['finance', 'loans'],
  transfers: ['transfers'], 'rushcar.entries': ['rushcar', 'entries'],
  'rushcar.forwarderInfos': ['rushcar', 'forwarderInfos'],
  'rushcar.mattelSiteInfos': ['rushcar', 'mattelSiteInfos'], 'rushcar.paymentCards': ['rushcar', 'paymentCards'],
}

function emptyFor(slot) {
  return slot === 'calc' ? {} : []
}

export function slotValue(payload, slot) {
  if (!payload || typeof payload !== 'object') return emptyFor(slot)
  const path = SLOT_PATHS[slot] || []
  let cur = payload
  for (const k of path) cur = cur?.[k]
  return cur ?? emptyFor(slot)
}

export function setSlotValue(payload, slot, value) {
  const path = SLOT_PATHS[slot] || []
  let cur = payload
  for (let i = 0; i < path.length - 1; i++) {
    if (!cur[path[i]] || typeof cur[path[i]] !== 'object') cur[path[i]] = Array.isArray(value) ? [] : {}
    cur = cur[path[i]]
  }
  cur[path[path.length - 1]] = value
}

/** 云槽位是否可采纳：路径存在且类型正确（calc→object，其余→array） */
export function hasUsableSlotValue(payload, slot) {
  if (!payload || typeof payload !== 'object') return false
  const path = SLOT_PATHS[slot] || []
  let cur = payload
  for (const k of path) {
    if (!cur || typeof cur !== 'object' || !(k in cur)) return false
    cur = cur[k]
  }
  return slot === 'calc'
    ? cur !== null && typeof cur === 'object' && !Array.isArray(cur)
    : Array.isArray(cur)
}

export function revOf(payload, slot) {
  const n = Number(payload?._rev?.[slot]?.rev)
  return Number.isFinite(n) && n >= 0 ? n : 0
}

export function normalizeRev(raw) {
  const out = {}
  const src = raw && typeof raw === 'object' ? raw : {}
  for (const slot of Object.keys(src)) {
    const entry = src[slot]
    if (!entry || typeof entry !== 'object') continue
    const rev = Number(entry.rev)
    if (!Number.isFinite(rev) || rev < 0) continue
    out[slot] = { rev, at: typeof entry.at === 'string' ? entry.at : '' }
  }
  return out
}

export function computeSlotPlan(localPayload, cloudPayload, baselineRev = {}, serialize) {
  const plan = {}
  for (const slot of SLOT_KEYS) {
    const localSer = serialize(slotValue(localPayload, slot))
    const cloudSer = serialize(slotValue(cloudPayload, slot))
    if (localSer === cloudSer) { plan[slot] = 'align'; continue }
    const localRev = revOf(localPayload, slot)
    const cloudRev = revOf(cloudPayload, slot)
    const base = Number(baselineRev?.[slot]) || 0
    const localMoved = localRev !== 0 && localRev !== base
    const cloudMoved = cloudRev !== 0 && cloudRev !== base
    if (localMoved && cloudMoved) plan[slot] = 'conflict'
    else if (cloudMoved) plan[slot] = 'adopt-cloud'
    else if (localMoved) plan[slot] = 'upload'
    else plan[slot] = 'conflict'
  }
  return plan
}

/**
 * 按计划与决策合并 payload。
 * decisions: { slot: 'local' | 'cloud' }（仅对 adopt-cloud / conflict 槽位有意义）
 * 默认方向：adopt-cloud → cloud；conflict → local。
 */
export function buildMerged(localPayload, cloudPayload, plan, decisions = {}) {
  const merged = JSON.parse(JSON.stringify(localPayload || {}))
  const rev = {}
  for (const slot of SLOT_KEYS) {
    const action = plan?.[slot]
    let useCloud
    if (decisions[slot] === 'cloud') useCloud = true
    else if (decisions[slot] === 'local') useCloud = false
    else useCloud = action === 'adopt-cloud' // adopt 默认云端，conflict 默认本地
    if (useCloud) {
      setSlotValue(merged, slot, slotValue(cloudPayload, slot))
      if (cloudPayload?._rev?.[slot]) rev[slot] = cloudPayload._rev[slot]
    } else if (localPayload?._rev?.[slot]) {
      rev[slot] = localPayload._rev[slot]
    }
  }
  merged._rev = rev
  merged.updatedAt = localPayload?.updatedAt || ''
  return merged
}
