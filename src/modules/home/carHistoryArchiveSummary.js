const balance = transactions => transactions.reduce((sum, row) => sum + (row.type === 'income' ? 1 : row.type === 'expense' ? -1 : 0) * Number(row.amount || 0), 0)

export function getCarHistoryArchiveSummary(data) {
  const pocket = data.accounts.pocket
  const invest = data.accounts.invest
  const loans = invest.loans.filter(loan => loan.status === 'active')
  return {
    pocketName: pocket.name,
    monthlyAllowance: Number(pocket.monthlyAllowance || 0),
    pocketBalance: balance(pocket.transactions),
    investBalance: balance(invest.transactions),
    loanTotal: loans.reduce((sum, loan) => sum + Number(loan.amount || 0), 0),
    loanCount: loans.length,
    carBuySpent: invest.transactions.filter(row => row.type === 'expense' && row.category === 'car_buy').reduce((sum, row) => sum + Number(row.amount || 0), 0),
    sellIncome: invest.transactions.filter(row => row.type === 'income' && row.category === 'car_sell').reduce((sum, row) => sum + Number(row.amount || 0), 0),
  }
}

export function getCarHistoryMonthlySpending(transactions, now = new Date()) {
  const months = []
  for (let offset = 5; offset >= 0; offset -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - offset, 1)
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
    const monthTransactions = transactions.filter(row => String(row.date || '').startsWith(key))
    const income = monthTransactions.filter(row => row.type === 'income').reduce((sum, row) => sum + Number(row.amount || 0), 0)
    const expense = monthTransactions.filter(row => row.type === 'expense').reduce((sum, row) => sum + Number(row.amount || 0), 0)
    months.push({ key, label: `${date.getMonth() + 1}月`, income, expense, net: income - expense })
  }
  return months
}
