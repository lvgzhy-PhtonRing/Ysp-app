import { DEFAULT_BATCHES } from '../inventory/inventoryOptions'

export const CATEGORY_BATCHES = {
  美淘: [...DEFAULT_BATCHES.美淘, '美淘现货'],
  日淘: DEFAULT_BATCHES.日淘,
  国内: DEFAULT_BATCHES.国内,
  '2025JAPAN': DEFAULT_BATCHES['2025JAPAN'],
}

export function getPurchaseBatchesByCategory(category) {
  return CATEGORY_BATCHES[category] || []
}
