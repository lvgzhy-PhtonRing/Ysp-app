import { inferLegacySalesChannel, isSalesChannel } from '../../modules/sales/salesChannels'

const DEFAULT_OWNER_REGISTRY = {
  papa: { label: 'Papa', source: 'native' },
  payton: {
    label: 'Payton', source: 'native', pocketBalance: 0, investBalance: 0,
    monthlyAllowance: 200, loans: [], accountTransfers: [], openingAt: '', snapshotReconcile: null,
  },
}

const clone = (value) => JSON.parse(JSON.stringify(value))

function isValidDateOnly(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

export function migratePayload(payload) {
  const data = payload && typeof payload === 'object' && !Array.isArray(payload) ? clone(payload) : {}
  if (!Array.isArray(data.items)) data.items = []
  if (!data.calc || typeof data.calc !== 'object' || Array.isArray(data.calc)) data.calc = {}
  data.calc.unconfirmed = 0
  if (!data.finance || typeof data.finance !== 'object' || Array.isArray(data.finance)) data.finance = {}
  if (!Array.isArray(data.finance.records)) data.finance.records = []
  if (!Array.isArray(data.finance.loans)) data.finance.loans = []
  for (const item of Array.isArray(data.items) ? data.items : []) {
    if (item && typeof item === 'object' && !item.owner) item.owner = 'papa'
    if (item?.status === 'sold' && item.saleDetails && typeof item.saleDetails === 'object' && !isSalesChannel(item.saleDetails.shop)) {
      item.saleDetails.shop = inferLegacySalesChannel(item.saleDetails.date)
    }
    if (item?.status === 'sold' && item.saleDetails && typeof item.saleDetails === 'object') {
      if (typeof item.saleDetails.isConfirmed !== 'boolean') item.saleDetails.isConfirmed = true
      if (!Object.prototype.hasOwnProperty.call(item.saleDetails, 'entryDate')) {
        item.saleDetails.entryDate = item.saleDetails.isConfirmed && isValidDateOnly(item.saleDetails.date)
          ? item.saleDetails.date
          : ''
      }
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
