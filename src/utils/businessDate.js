const BUSINESS_TIME_ZONE = 'Asia/Shanghai'

export function getBusinessDate(date = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: BUSINESS_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date).map(({ type, value }) => [type, value]))

  return `${parts.year}-${parts.month}-${parts.day}`
}
