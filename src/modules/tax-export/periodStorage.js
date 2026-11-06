const TAX_EXPORT_PERIOD_STORAGE_KEY = 'ysp_tax_export_period'

function isDateOnly(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T00:00:00`).getTime())
}

export function loadTaxExportPeriod() {
  try {
    const raw = localStorage.getItem(TAX_EXPORT_PERIOD_STORAGE_KEY)
    if (!raw) return null
    const saved = JSON.parse(raw)
    if (!isDateOnly(saved?.startDate) || !isDateOnly(saved?.endDate) || saved.startDate > saved.endDate) return null
    return { startDate: saved.startDate, endDate: saved.endDate }
  } catch {
    return null
  }
}

export function saveTaxExportPeriod(startDate, endDate) {
  if (!isDateOnly(startDate) || !isDateOnly(endDate) || startDate > endDate) return
  try {
    localStorage.setItem(TAX_EXPORT_PERIOD_STORAGE_KEY, JSON.stringify({ startDate, endDate }))
  } catch {
    // localStorage unavailable or full; exporting still works for the current session.
  }
}
