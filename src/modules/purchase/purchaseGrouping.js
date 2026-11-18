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

export function groupPendingTransferItems(items = [], selectedItemIds = []) {
  const selectedIds = new Set(selectedItemIds)
  const groups = []
  const groupsByKey = new Map()

  for (const item of items || []) {
    const purchaseDetails = item?.purchaseDetails || {}
    const purchaseGroupId = String(purchaseDetails.purchaseGroupId || '').trim()
    const identity = getPurchaseGroupKey(item)
    const groupKey = JSON.stringify([
      String(item?.category || ''),
      String(item?.batch || ''),
      identity,
    ])

    if (!groupsByKey.has(groupKey)) {
      const group = {
        key: groupKey,
        purchaseGroupId,
        purchaseDate: String(purchaseDetails.date || ''),
        batch: String(item?.batch || ''),
        rows: [],
        _rowsBySid: new Map(),
      }
      groupsByKey.set(groupKey, group)
      groups.push(group)
    }

    const group = groupsByKey.get(groupKey)
    const sid = String(item?.sid || '').trim()
    const rowKey = sid || `item_${item?.id}`
    if (!group._rowsBySid.has(rowKey)) {
      const row = {
        key: rowKey,
        sid: item?.sid || '',
        name: item?.name || '',
        category: item?.category || '',
        batch: item?.batch || '',
        itemIds: [],
        qty: 0,
        preTransferCost: 0,
        transferCoefficient: 0,
        selected: false,
      }
      group._rowsBySid.set(rowKey, row)
      group.rows.push(row)
    }

    const row = group._rowsBySid.get(rowKey)
    row.itemIds.push(item?.id)
    row.qty += 1
    row.preTransferCost += Number(purchaseDetails.preTransferCost || 0)
    row.transferCoefficient += Number(purchaseDetails.transferCoefficient || 1)
    if (selectedIds.has(item?.id)) row.selected = true
  }

  let legacyGroupNumber = 0
  return groups.map(({ _rowsBySid, ...group }) => ({
    ...group,
    legacyGroupNumber: group.purchaseGroupId ? null : ++legacyGroupNumber,
    itemCount: group.rows.reduce((count, row) => count + row.qty, 0),
  }))
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
