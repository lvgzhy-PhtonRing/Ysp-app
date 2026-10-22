export function shouldShowGlobalOwnerSwitch(currentTab) {
  return !['home', 'purchase', 'rushcar'].includes(currentTab)
}
