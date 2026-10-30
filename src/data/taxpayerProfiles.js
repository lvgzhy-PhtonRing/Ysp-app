export function normalizeTaxpayerName(value) {
  return String(value ?? '').trim()
}

export function normalizeTaxpayerId(value) {
  return String(value ?? '').trim().toUpperCase()
}

export function normalizeTaxpayerProfiles(profiles) {
  const result = []
  for (const profile of Array.isArray(profiles) ? profiles : []) {
    const name = normalizeTaxpayerName(profile?.name)
    const taxId = normalizeTaxpayerId(profile?.taxId)
    if (!name || !taxId || result.some((item) => item.name === name || item.taxId === taxId)) continue
    result.push({ name, taxId })
  }
  return result
}

export function findTaxpayerProfileConflict(profiles, name, taxId) {
  const normalizedName = normalizeTaxpayerName(name)
  const normalizedId = normalizeTaxpayerId(taxId)
  const matchByName = normalizedName && profiles.find((profile) => profile.name === normalizedName)
  if (matchByName && matchByName.taxId !== normalizedId) return { field: 'name', existing: matchByName }
  const matchById = normalizedId && profiles.find((profile) => profile.taxId === normalizedId)
  if (matchById && matchById.name !== normalizedName) return { field: 'taxId', existing: matchById }
  return null
}

export function upsertTaxpayerProfile(profiles, name, taxId) {
  const normalizedName = normalizeTaxpayerName(name)
  const normalizedId = normalizeTaxpayerId(taxId)
  if (!normalizedName || !normalizedId) return { profiles: normalizeTaxpayerProfiles(profiles), conflict: null }
  const normalized = normalizeTaxpayerProfiles(profiles)
  const conflict = findTaxpayerProfileConflict(normalized, normalizedName, normalizedId)
  if (conflict) return { profiles: normalized, conflict }
  if (normalized.some((profile) => profile.name === normalizedName && profile.taxId === normalizedId)) return { profiles: normalized, conflict: null }
  return { profiles: [...normalized, { name: normalizedName, taxId: normalizedId }], conflict: null }
}
