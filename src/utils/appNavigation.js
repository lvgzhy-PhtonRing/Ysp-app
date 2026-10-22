export function shouldShowGlobalOwnerSwitch(currentTab) {
  return !['finance', 'payton-finance', 'purchase', 'rushcar'].includes(currentTab)
}
