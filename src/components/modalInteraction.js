export function shouldCloseOnOverlayClick(closeOnOverlay, startedOnOverlay, endedOnOverlay, clickedOverlay) {
  return closeOnOverlay && startedOnOverlay && endedOnOverlay && clickedOverlay
}
