import { hasValidSession, isCloudConfigReady, normalizeCloudConfig, refreshCloudSession } from './cloudStore'
import { canonicalArchiveValue, validateCarArchive } from '../data/carHistoryArchive'

export async function syncCarArchive(configRaw, sessionRaw, archive, onSession) {
  const config = normalizeCloudConfig(configRaw)
  if (!isCloudConfigReady(config) || !sessionRaw?.accessToken) throw new Error('请先登录云端账号')
  const session = hasValidSession(sessionRaw) ? sessionRaw : await refreshCloudSession(config, sessionRaw)
  if (!session.user?.id) throw new Error('云端账号信息缺失，请重新登录')
  onSession?.(session)
  const headers = { apikey: config.supabaseAnonKey, Authorization: `Bearer ${session.accessToken}`, 'Content-Type': 'application/json' }
  const target = `${config.supabaseUrl}/rest/v1/ysp_car_history_archive`
  const response = await fetch(`${target}?select=payload&owner_id=eq.${encodeURIComponent(session.user.id)}`, { headers, cache: 'no-store' })
  if (!response.ok) throw new Error(`读取独立档案失败（HTTP ${response.status}），请检查云端档案表及权限`)
  const rows = await response.json()
  if (rows.length) {
    const cloud = rows[0].payload
    validateCarArchive(cloud?.data)
    if (archive && canonicalArchiveValue(archive.data) !== canonicalArchiveValue(cloud.data)) throw new Error('本机和云端的历史档案不同，已停止同步，未覆盖任何档案')
    return cloud
  }
  if (!archive) throw new Error('云端尚无历史档案，请先选择 car 备份文件')
  validateCarArchive(archive.data)
  const insert = await fetch(target, { method: 'POST', headers: { ...headers, Prefer: 'return=minimal' }, body: JSON.stringify({ owner_id: session.user.id, payload: archive }) })
  if (!insert.ok) throw new Error(`保存独立档案失败（HTTP ${insert.status}）；请重试并核对云端档案表及权限`)
  return archive
}
