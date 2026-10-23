import { slotValue } from './cloudSlotPlan'

export function summarizeConflictPayload(payload) {
  const items = Array.isArray(payload?.items) ? payload.items : []
  const inventory = items.filter((item) => item?.status === 'inventory')
  return {
    itemCount: items.length,
    inventoryCount: inventory.length,
    inventoryCost: Number(inventory.reduce((sum, item) => sum + (Number(item?.cost) || 0), 0).toFixed(2)),
    soldCount: items.filter((item) => item?.status === 'sold').length,
  }
}

export function summarizeConflictSlot(payload, slot) {
  const value = slotValue(payload, slot)
  return Array.isArray(value)
    ? { kind: 'records', count: value.length }
    : { kind: 'fields', count: Object.keys(value).length }
}
