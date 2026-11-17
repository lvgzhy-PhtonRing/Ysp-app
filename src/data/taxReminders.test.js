import { describe, expect, it } from 'vitest'
import { collectTaxReminderHits, listTaxFilingItems } from './taxReminders'

describe('后续季度申报提醒', () => {
  it('包含 2027 年每季度的增值税和经营所得 A 表，并明确期限待校准', () => {
    const items = listTaxFilingItems(new Date(2026, 10, 17))
    const quarterlyItems = items.filter(item => item.period.startsWith('2027年第'))

    expect(quarterlyItems).toHaveLength(8)
    expect(quarterlyItems.map(item => item.dueDate)).toEqual([
      '2027-04-20', '2027-04-20',
      '2027-07-15', '2027-07-15',
      '2027-10-26', '2027-10-26',
      '2028-01-15', '2028-01-15',
    ])
    expect(quarterlyItems.every(item => item.deadlineStatus === '待官方期限校准')).toBe(true)
  })

  it('持续包含下一年度经营所得 B 表，并保留已确认的首次申报日期', () => {
    const items = listTaxFilingItems(new Date(2026, 10, 17))

    expect(items.find(item => item.period === '2026年第4季度' && item.type === 'vat')?.dueDate).toBe('2027-01-20')
    expect(items.find(item => item.period === '2027年度' && item.type === 'pit-b')?.dueDate).toBe('2028-03-31')
  })

  it('2027 年首个后续季度在截止日前 14 天触发两张表的提醒', () => {
    const hits = collectTaxReminderHits(new Date(2027, 3, 6))

    expect(hits.filter(item => item.period === '2027年第1季度')).toHaveLength(2)
    expect(hits.filter(item => item.period === '2027年第1季度').every(item => item.reminderDay === '14天')).toBe(true)
  })
})
