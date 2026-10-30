// 云同步槽位版本化纯函数：11 个数据集合的取值/版本/合并，与 DOM 与同步协议解耦
export const SLOT_KEYS = [
  'items', 'calc', 'finance.records', 'finance.loans', 'transfers',
  'rushcar.entries', 'rushcar.forwarderInfos', 'rushcar.mattelSiteInfos', 'rushcar.paymentCards', 'ownerRegistry', 'taxpayerProfiles',
]

export const SLOT_LABELS = {
  items: '商品', calc: '财务结算', 'finance.records': '收支记录', 'finance.loans': '借贷记录',
  transfers: '转运记录', 'rushcar.entries': '美淘记录', 'rushcar.forwarderInfos': '转运公司',
  'rushcar.mattelSiteInfos': '美泰站点', 'rushcar.paymentCards': '支付卡', ownerRegistry: 'Owner 资金', taxpayerProfiles: '纳税主体',
}

const SLOT_PATHS = {
  items: ['items'], calc: ['calc'], 'finance.records': ['finance', 'records'], 'finance.loans': ['finance', 'loans'],
  transfers: ['transfers'], 'rushcar.entries': ['rushcar', 'entries'],
  'rushcar.forwarderInfos': ['rushcar', 'forwarderInfos'],
  'rushcar.mattelSiteInfos': ['rushcar', 'mattelSiteInfos'], 'rushcar.paymentCards': ['rushcar', 'paymentCards'],
  ownerRegistry: ['ownerRegistry'], taxpayerProfiles: ['taxpayerProfiles'],
}

function emptyFor(slot) {
  return slot === 'calc' || slot === 'ownerRegistry' ? {} : []
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

/** 云槽位是否可采纳：路径存在且类型正确（calc/ownerRegistry→object，其余→array） */
export function hasUsableSlotValue(payload, slot) {
  if (!payload || typeof payload !== 'object') return false
  const path = SLOT_PATHS[slot] || []
  let cur = payload
  for (const k of path) {
    if (!cur || typeof cur !== 'object' || !(k in cur)) return false
    cur = cur[k]
  }
  return slot === 'calc' || slot === 'ownerRegistry'
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

/**
 * snapshots 是单调历史记录（每日负债/库存等聚合指标），不属于任何分槽：
 * 合并时按 date 取并集（只增不减），同日保留 createdAt 较新的一条，非数组/无 date 条目跳过。
 */
export function mergeSnapshots(localSnaps, cloudSnaps) {
  const byDate = new Map()
  for (const list of [localSnaps, cloudSnaps]) {
    if (!Array.isArray(list)) continue
    for (const snap of list) {
      if (!snap || typeof snap !== 'object' || !snap.date) continue
      const existing = byDate.get(snap.date)
      if (!existing) {
        byDate.set(snap.date, snap)
        continue
      }
      const cur = new Date(snap.createdAt || 0).getTime()
      const prev = new Date(existing.createdAt || 0).getTime()
      if (cur > prev) byDate.set(snap.date, snap)
    }
  }
  return [...byDate.values()].sort((a, b) => String(a.date).localeCompare(String(b.date)))
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
    if (action === 'align' && decisions[slot] === undefined) {
      const localRev = revOf(localPayload, slot)
      const cloudRev = revOf(cloudPayload, slot)
      const selected = cloudRev > localRev ? cloudPayload?._rev?.[slot] : localPayload?._rev?.[slot]
      if (selected) rev[slot] = selected
      continue
    }
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
  merged.snapshots = mergeSnapshots(localPayload?.snapshots, cloudPayload?.snapshots)
  return merged
}
