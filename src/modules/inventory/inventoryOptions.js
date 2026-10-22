export const DEFAULT_BATCHES = {
  美淘: ['26下半年', '26上半年', 'B组下半年', 'B组上半年', 'A组下半年', 'A组上半年'],
  日淘: ['26h批', '26g批', '26f批', '26e批', '预订', 'd批', 'c批', 'b批', 'a批'],
  国内: ['MINIGT预定', 'Hotwheels预定', '国内现货', '代理预定', '2026苏州', '2026上海CTE', '2026HK香港', '2026佛山'],
  '2025JAPAN': ['2025JAPAN'],
}

export function getBatchesByCategory(category) {
  return DEFAULT_BATCHES[category] || []
}
