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
