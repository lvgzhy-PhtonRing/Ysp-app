const DEFAULT_ACCOUNT_SYMBOL = '支'
const DEFAULT_CATEGORY_CODE = 'J'
const DEFAULT_BATCH_SYMBOL = 'A'

const ACCOUNT_SYMBOL_MAPPINGS = [
  { keywords: ['支付宝', 'alipay', '支'], symbol: '支' },
  { keywords: ['信用卡', 'credit'], symbol: '信' },
  { keywords: ['微信', 'wechat'], symbol: '微' },
  { keywords: ['现金', 'cash'], symbol: '现' },
]

const CATEGORY_CODE_MAPPINGS = [
  { keywords: ['美', 'us', 'U'], code: 'U' },
  { keywords: ['日', 'jp', 'J'], code: 'J' },
  { keywords: ['国', 'cn', '内', 'D'], code: 'D' },
]

function toArray(value) {
  if (Array.isArray(value)) return value
  if (value === undefined || value === null) return []
  return [value]
}

function normalizeValue(value) {
  return String(value || '').trim()
}

export function getAccountSymbol(account = '') {
  const value = normalizeValue(account)
  if (!value) return DEFAULT_ACCOUNT_SYMBOL
  const lower = value.toLowerCase()
  for (const { keywords, symbol } of ACCOUNT_SYMBOL_MAPPINGS) {
    if (keywords.some((kw) => lower.includes(kw.toLowerCase()))) return symbol
  }
  return DEFAULT_ACCOUNT_SYMBOL
}

function detectCategoryCode(...rawHints) {
  const hints = rawHints.flatMap((hint) => toArray(hint))
  for (const hint of hints) {
    const value = normalizeValue(hint)
    if (!value) continue
    for (const { keywords, code } of CATEGORY_CODE_MAPPINGS) {
      if (keywords.some((kw) => value.toLowerCase().includes(kw.toLowerCase()))) {
        return code
      }
    }
  }
  return DEFAULT_CATEGORY_CODE
}

function extractBatchSymbol(...rawHints) {
  const hints = rawHints.flatMap((hint) => toArray(hint))
  for (const hint of hints) {
    const value = normalizeValue(hint).toUpperCase()
    if (!value) continue
    const match = value.match(/[0-9A-Z]/)
    if (match) return match[0]
  }
  return DEFAULT_BATCH_SYMBOL
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function formatBaseValue(value, width = 2, base = 36) {
  const digits = Math.max(0, value).toString(base).toUpperCase()
  return digits.length >= width ? digits : digits.padStart(width, '0')
}

function getNextSequence(existingValues = [], regex, { width = 2, base = 36 } = {}) {
  let maxSeq = 0
  existingValues.forEach((raw) => {
    const value = normalizeValue(raw).toUpperCase()
    if (!value) return
    const match = value.match(regex)
    if (!match) return
    const parsed = parseInt(match[1], base)
    if (Number.isFinite(parsed)) {
      maxSeq = Math.max(maxSeq, parsed)
    }
  })
  return formatBaseValue(maxSeq + 1, width, base)
}

function getNextNumericSequence(existingValues = [], regex, width = 4) {
  let maxSeq = 0
  existingValues.forEach((raw) => {
    const value = normalizeValue(raw)
    if (!value) return
    const match = value.match(regex)
    if (!match) return
    const parsed = parseInt(match[1], 10)
    if (Number.isFinite(parsed)) {
      maxSeq = Math.max(maxSeq, parsed)
    }
  })
  const next = (maxSeq + 1).toString()
  return next.length >= width ? next : next.padStart(width, '0')
}

export function generateSid(existingValues = [], options = {}) {
  const prefix = normalizeValue(options.prefix) || 'JP-'
  const escapedPrefix = escapeRegex(prefix.toUpperCase())
  const regex = new RegExp(`^${escapedPrefix}([0-9A-Z]+)$`, 'i')
  const suffix = getNextSequence(existingValues, regex, { width: options.width || 4 })
  return `${prefix.toUpperCase()}${suffix}`
}

export function generatePaymentBatch(existingValues = [], options = {}) {
  const category = detectCategoryCode(options.categoryHint, options.batchHint)
  const batchSymbol = extractBatchSymbol(options.batchHint)
  const prefix = `${category}${batchSymbol}`
  const accountSymbol = getAccountSymbol(options.account)
  const regex = new RegExp(`^${escapeRegex(prefix)}${escapeRegex(accountSymbol)}([0-9A-Z]+)$`, 'i')
  const suffix = getNextSequence(existingValues, regex, { width: options.width || 2 })
  return `${prefix}${accountSymbol}${suffix}`
}

export function generateTransferNumber(existingValues = [], options = {}) {
  const category = detectCategoryCode(options.categoryHint, options.batchHint)
  const prefix = `${category}转`
  const accountSymbol = getAccountSymbol(options.account)
  const regex = new RegExp(`^${escapeRegex(prefix)}${escapeRegex(accountSymbol)}([0-9A-Z]+)$`, 'i')
  const suffix = getNextSequence(existingValues, regex, { width: options.width || 2 })
  return `${prefix}${accountSymbol}${suffix}`
}

export function generatePurchaseGroupId(existingValues = [], options = {}) {
  const category = detectCategoryCode(options.categoryHint, options.batchHint)
  const batchSymbol = extractBatchSymbol(options.batchHint)
  const prefix = `${category}${batchSymbol}`
  const regex = new RegExp(`^${escapeRegex(prefix)}(\\d+)$`, 'i')
  const suffix = getNextNumericSequence(existingValues, regex, options.width || 4)
  return `${prefix}${suffix}`
}

export const __testUtils = {
  detectCategoryCode,
  extractBatchSymbol,
  getNextSequence,
  getNextNumericSequence,
}
