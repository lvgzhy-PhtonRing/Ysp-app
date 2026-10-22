import { inferLegacySalesChannel, isSalesChannel } from '../../modules/sales/salesChannels'

const DEFAULT_OWNER_REGISTRY = {
  papa: { label: 'Papa', source: 'native' },
  payton: {
    label: 'Payton', source: 'native', pocketBalance: 0, investBalance: 0,
    monthlyAllowance: 200, loans: [], accountTransfers: [], openingAt: '', snapshotReconcile: null,
  },
}

const clone = (value) => JSON.parse(JSON.stringify(value))

export function migratePayload(payload) {
  const data = payload && typeof payload === 'object' && !Array.isArray(payload) ? clone(payload) : {}
  if (!Array.isArray(data.items)) data.items = []
  if (!data.finance || typeof data.finance !== 'object' || Array.isArray(data.finance)) data.finance = {}
  if (!Array.isArray(data.finance.records)) data.finance.records = []
  if (!Array.isArray(data.finance.loans)) data.finance.loans = []
  for (const item of Array.isArray(data.items) ? data.items : []) {
    if (item && typeof item === 'object' && !item.owner) item.owner = 'papa'
    if (item?.status === 'sold' && item.saleDetails && typeof item.saleDetails === 'object' && !isSalesChannel(item.saleDetails.shop)) {
      item.saleDetails.shop = inferLegacySalesChannel(item.saleDetails.date)
    }
  }
  for (const record of [...data.finance.records, ...data.finance.loans]) {
    if (record && typeof record === 'object' && !record.owner) record.owner = 'papa'
  }
  data.ownerRegistry = data.ownerRegistry && typeof data.ownerRegistry === 'object' && !Array.isArray(data.ownerRegistry)
    ? data.ownerRegistry
    : clone(DEFAULT_OWNER_REGISTRY)
  if (!data.ownerRegistry.papa) data.ownerRegistry.papa = clone(DEFAULT_OWNER_REGISTRY.papa)
  if (!data.ownerRegistry.payton) data.ownerRegistry.payton = clone(DEFAULT_OWNER_REGISTRY.payton)
  return data
}
