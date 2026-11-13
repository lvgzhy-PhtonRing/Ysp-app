export function getCarHistoryArchiveRows(data, { tab, dailyTab, investTab, detailTab, keyword = '' }) {
  if (!data) return []
  const sources = {
    pocketTransactions: data.accounts.pocket.transactions,
    keepGarage: data.cars.filter(car => car.category === 'keep' && !car.isSold),
    investTransactions: data.accounts.invest.transactions,
    investGarage: data.cars.filter(car => car.category === 'invest' && !car.isSold),
    loans: data.accounts.invest.loans.filter(loan => loan.status === 'active'),
    transfers: data.transferPairs,
    prices: Object.entries(data.expectedPrices).map(([name, value]) => ({ name, ...value })),
    logs: data.operationLogs,
  }
  const source = tab === 'invest'
    ? investTab === 'garage' ? 'investGarage' : 'investTransactions'
    : tab === 'daily'
      ? dailyTab === 'garage' ? 'keepGarage' : 'pocketTransactions'
      : tab === 'dashboard' ? detailTab : tab
  const query = keyword.trim().toLowerCase()
  const rows = [...(sources[source] || [])]
  if (source === 'pocketTransactions' || source === 'investTransactions') {
    rows.sort((left, right) => {
      const dateOrder = String(right.date || '').localeCompare(String(left.date || ''))
      if (dateOrder) return dateOrder
      const createdAt = row => Number(/_(\d+)_/.exec(row.id || '')?.[1] || 0)
      return createdAt(right) - createdAt(left)
    })
  }
  return rows.filter(row => !query || JSON.stringify(row).toLowerCase().includes(query))
}
