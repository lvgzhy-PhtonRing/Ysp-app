// 格式化函数（展示层使用）

/**
 * 数字格式化：保留指定小数位（默认2位）
 */
export function formatNum(value, digits = 2) {
  return Number(value).toFixed(digits)
}

/**
 * 金额格式化：¥ + 两位小数
 */
export function formatMoney(value) {
  return `¥${Number(value).toFixed(2)}`
}
