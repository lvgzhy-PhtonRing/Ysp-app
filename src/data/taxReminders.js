export const TAX_REMINDER_STORAGE_KEY = 'ysp_tax_reminders_v1'
export const TAX_REMINDER_OFFSETS = [14, 7, 4, 3, 2, 1]

const VAT_FORM = '增值税及附加税费申报表（小规模纳税人适用）'
const A_FORM = '个人所得税经营所得纳税申报表（A表）'
const B_FORM = '个人所得税经营所得纳税申报表（B表）'

const vatChecklist = [
  '核对开票销售额与税务系统预填金额',
  '补充未开票销售额，并区分货物及劳务、服务等类别',
  '核对扣除项目、减免事项（如适用）',
  '核对随增值税申报的城市维护建设税、教育费附加和地方教育附加',
  '以税务系统当期显示的申报表及预填数据为准；上海试点表式可能不同',
]
const aChecklist = [
  '收入总额',
  '成本费用',
  '弥补以前年度亏损（如有）',
  '投资者减除费用、专项扣除及其与综合所得的扣除选择',
  '减免税项目（如有）',
]
const bChecklist = [
  '年度收入总额与成本费用',
  '弥补以前年度亏损（如有）',
  '已预缴税额',
  '投资者扣除、专项扣除及减免项目',
  '以自然人电子税务局预填信息和本人资料逐项核对',
]

const yearlyCalendarSource = '国家税务总局办公厅税总办征科函〔2025〕64号（2026年度申报期限）'
const annualSettlementSource = '个人所得税经营所得在取得所得次年3月31日前汇算清缴'
const filingItems = [
  { form: VAT_FORM, type: 'vat', period: '2025年第4季度', dueDate: '2026-01-20', deadlineSource: yearlyCalendarSource, deadlineSourceUrl: 'https://fgk.chinatax.gov.cn/zcfgk/c102424/c5245729/content.html', portal: '企业电子税务局', url: 'https://etax.shanghai.chinatax.gov.cn:8443/', checklist: vatChecklist },
  { form: A_FORM, type: 'pit-a', period: '2025年第4季度', dueDate: '2026-01-20', deadlineSource: yearlyCalendarSource, deadlineSourceUrl: 'https://fgk.chinatax.gov.cn/zcfgk/c102424/c5245729/content.html', portal: '自然人电子税务局', url: 'https://etax.chinatax.gov.cn/', checklist: aChecklist },
  { form: VAT_FORM, type: 'vat', period: '2026年第1季度', dueDate: '2026-04-20', deadlineSource: yearlyCalendarSource, deadlineSourceUrl: 'https://fgk.chinatax.gov.cn/zcfgk/c102424/c5245729/content.html', portal: '企业电子税务局', url: 'https://etax.shanghai.chinatax.gov.cn:8443/', checklist: vatChecklist },
  { form: A_FORM, type: 'pit-a', period: '2026年第1季度', dueDate: '2026-04-20', deadlineSource: yearlyCalendarSource, deadlineSourceUrl: 'https://fgk.chinatax.gov.cn/zcfgk/c102424/c5245729/content.html', portal: '自然人电子税务局', url: 'https://etax.chinatax.gov.cn/', checklist: aChecklist },
  { form: VAT_FORM, type: 'vat', period: '2026年第2季度', dueDate: '2026-07-15', deadlineSource: yearlyCalendarSource, deadlineSourceUrl: 'https://fgk.chinatax.gov.cn/zcfgk/c102424/c5245729/content.html', portal: '企业电子税务局', url: 'https://etax.shanghai.chinatax.gov.cn:8443/', checklist: vatChecklist },
  { form: A_FORM, type: 'pit-a', period: '2026年第2季度', dueDate: '2026-07-15', deadlineSource: yearlyCalendarSource, deadlineSourceUrl: 'https://fgk.chinatax.gov.cn/zcfgk/c102424/c5245729/content.html', portal: '自然人电子税务局', url: 'https://etax.chinatax.gov.cn/', checklist: aChecklist },
  { form: VAT_FORM, type: 'vat', period: '2026年第3季度', dueDate: '2026-10-26', deadlineSource: yearlyCalendarSource, deadlineSourceUrl: 'https://fgk.chinatax.gov.cn/zcfgk/c102424/c5245729/content.html', portal: '企业电子税务局', url: 'https://etax.shanghai.chinatax.gov.cn:8443/', checklist: vatChecklist },
  { form: A_FORM, type: 'pit-a', period: '2026年第3季度', dueDate: '2026-10-26', deadlineSource: yearlyCalendarSource, deadlineSourceUrl: 'https://fgk.chinatax.gov.cn/zcfgk/c102424/c5245729/content.html', portal: '自然人电子税务局', url: 'https://etax.chinatax.gov.cn/', checklist: aChecklist },
  { form: B_FORM, type: 'pit-b', period: '2026年度', dueDate: '2027-03-31', deadlineSource: annualSettlementSource, deadlineSourceUrl: 'https://shanghai.chinatax.gov.cn/tax/zcfw/rdwd/202602/t479416.html', portal: '自然人电子税务局', url: 'https://etax.chinatax.gov.cn/', checklist: bChecklist },
].map(item => ({ ...item, id: `${item.type}:${item.period}` }))

function parseLocalDate(value) {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day)
}

function localDateKey(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function daysUntilTaxDeadline(dueDate, now = new Date()) {
  const due = parseLocalDate(dueDate)
  const today = parseLocalDate(localDateKey(now))
  return Math.round((due - today) / 86_400_000)
}

export function readTaxReminderState() {
  try {
    const parsed = JSON.parse(localStorage.getItem(TAX_REMINDER_STORAGE_KEY) || '{}')
    return {
      completed: parsed.completed && typeof parsed.completed === 'object' ? parsed.completed : {},
      shown: parsed.shown && typeof parsed.shown === 'object' ? parsed.shown : {},
    }
  } catch {
    return { completed: {}, shown: {} }
  }
}

function writeTaxReminderState(state) {
  try {
    localStorage.setItem(TAX_REMINDER_STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Reminder state is best effort and must never block the accounting app.
  }
}

export function listTaxFilingItems(now = new Date()) {
  const state = readTaxReminderState()
  return filingItems.map(item => {
    const daysLeft = daysUntilTaxDeadline(item.dueDate, now)
    return {
      ...item,
      daysLeft,
      completed: Boolean(state.completed[item.id]),
      status: state.completed[item.id] ? '已申报' : daysLeft < 0 ? '已逾期，待核对' : daysLeft === 0 ? '今天截止' : `剩余 ${daysLeft} 天`,
    }
  })
}

export function markTaxFilingCompleted(id, completed = true) {
  const state = readTaxReminderState()
  if (completed) state.completed[id] = new Date().toISOString()
  else delete state.completed[id]
  writeTaxReminderState(state)
  return state
}

export function collectTaxReminderHits(now = new Date()) {
  const state = readTaxReminderState()
  const hits = []

  for (const item of filingItems) {
    if (state.completed[item.id]) continue
    const daysLeft = daysUntilTaxDeadline(item.dueDate, now)
    const shownNodes = Array.isArray(state.shown[item.id]) ? state.shown[item.id] : []
    const availableOffset = TAX_REMINDER_OFFSETS
      .filter(offset => daysLeft > 0 && daysLeft <= offset && !shownNodes.includes(offset))
      .sort((a, b) => a - b)[0]
    const reminderDay = daysLeft === 0 && !shownNodes.includes(0)
      ? '截止日'
      : availableOffset ? `${availableOffset}天` : null
    if (!reminderDay) continue

    const node = daysLeft === 0 ? 0 : availableOffset
    state.shown[item.id] = [...shownNodes, node]
    hits.push({ ...item, daysLeft, reminderDay })
  }

  if (hits.length) writeTaxReminderState(state)
  return hits
}
