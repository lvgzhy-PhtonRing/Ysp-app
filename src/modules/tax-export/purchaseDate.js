const BATCH_FALLBACK_DATES = {
  '2025JAPAN / 2025JAPAN': '2025-08-01',
  '美淘 / A组下半年': '2025-11-01',
  '美淘 / B组下半年': '2025-12-30',
  '日淘 / a批': '2025-11-02',
  '日淘 / b批': '2025-12-30',
  '日淘 / d批': '2026-01-15',
  '日淘 / 预订': '2025-12-15',
}

function dateOnly(value) {
  const text = String(value || '').trim().slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return ''
  const date = new Date(`${text}T00:00:00.000Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === text ? text : ''
}

export function resolvePurchaseDate(item = {}) {
  const recordedDate = dateOnly(item?.purchaseDetails?.date)
  if (recordedDate) return recordedDate
  return BATCH_FALLBACK_DATES[`${String(item?.category || '')} / ${String(item?.batch || '')}`] || ''
}
