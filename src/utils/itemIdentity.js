let lastCreationOrder = 0

function randomItemId() {
  if (globalThis.crypto.randomUUID) return globalThis.crypto.randomUUID()
  return Array.from(globalThis.crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export function createItemIdentity(items) {
  let id
  do {
    id = randomItemId()
  } while (items.some((item) => item?.id === id))
  lastCreationOrder = Math.max(Date.now(), lastCreationOrder + 1)
  return { id, creationOrder: lastCreationOrder }
}

export function getItemCreationOrder(item) {
  const created = Number(item?.creationOrder)
  if (Number.isFinite(created) && created > 0) return created
  const order = Number(item?.id || 0)
  return Number.isFinite(order) ? order : 0
}

function getPurchaseDateTime(item) {
  const date = item?.purchaseDetails?.date
  const time = date ? new Date(date).getTime() : 0
  return Number.isFinite(time) ? time : 0
}

export function comparePurchaseItemsDesc(a, b) {
  return getPurchaseDateTime(b) - getPurchaseDateTime(a)
    || getItemCreationOrder(b) - getItemCreationOrder(a)
}
