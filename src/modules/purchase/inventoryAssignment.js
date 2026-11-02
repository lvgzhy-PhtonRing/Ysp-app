const number = (value) => Number(value) || 0
const money = (value) => Number(number(value).toFixed(2))

export function createInventoryAssignmentRows(items = []) {
  return items.map((item) => ({ itemId: item.id, owner: 'papa', isLongTerm: false }))
}

export function setInventoryAssignmentOwner(rows = [], target, owner) {
  return rows.map((row) => {
    if (target !== 'all' && row.itemId !== target) return row
    return { ...row, owner, isLongTerm: owner === 'payton' ? row.isLongTerm : false }
  })
}

export function setInventoryAssignmentPurpose(rows = [], itemId, isLongTerm) {
  return rows.map((row) => row.itemId === itemId && row.owner === 'payton'
    ? { ...row, isLongTerm: Boolean(isLongTerm) }
    : row)
}

export function summarizeInventoryAssignments(items = [], rows = []) {
  const assignments = new Map(rows.map((row) => [row.itemId, row]))
  let totalCost = 0
  let paytonInvestCost = 0
  let paytonKeepCost = 0

  for (const item of items) {
    const cost = number(item.cost)
    totalCost += cost
    const assignment = assignments.get(item.id)
    if (assignment?.owner !== 'payton') continue
    if (assignment.isLongTerm) paytonKeepCost += cost
    else paytonInvestCost += cost
  }

  return {
    count: items.length,
    totalCost: money(totalCost),
    paytonInvestCost: money(paytonInvestCost),
    paytonKeepCost: money(paytonKeepCost),
  }
}
