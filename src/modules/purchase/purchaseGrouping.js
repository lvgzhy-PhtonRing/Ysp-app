export function getPurchaseGroupKey(item) {
  const purchaseDetails = item?.purchaseDetails || {}
  const purchaseGroupId = String(purchaseDetails.purchaseGroupId || '').trim()
  if (purchaseGroupId) return purchaseGroupId

  const date = purchaseDetails.date || ''
  const website = purchaseDetails.website || ''
  const paymentBatch = purchaseDetails.paymentBatch || ''
  return date || website || paymentBatch
    ? `${date}__${website}__${paymentBatch}`
    : `item_${item?.id}`
}

export function getPurchaseGroupTransferIds(lines, originalById, removedRows) {
  const ids = new Set()
  for (const line of lines) {
    if (line.transferStatus !== 'completed') continue
    const id = line.transferId || originalById.get(line.id)?.purchaseDetails?.transferId
    if (id) ids.add(id)
  }
  for (const row of removedRows) {
    const id = row.purchaseDetails?.transferId
    if (id) ids.add(id)
  }
  return ids
}
