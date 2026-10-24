// 同一浏览器环境的同源页面仅允许一个编辑者；页面关闭时浏览器自动释放锁。
export function createEditorLock(manager = globalThis.navigator?.locks) {
  let owned = false
  let releaseHold = null
  let requestTask = null

  return {
    held: () => owned,
    async acquire() {
      if (owned) return true
      if (!manager?.request || requestTask) return false
      let finish
      const acquired = new Promise((resolve) => { finish = resolve })
      requestTask = manager.request('ysp-editor', { mode: 'exclusive', ifAvailable: true }, async (lock) => {
        if (!lock) { finish(false); return }
        owned = true
        finish(true)
        await new Promise((resolve) => { releaseHold = resolve })
        owned = false
        releaseHold = null
      }).catch(() => { owned = false; finish(false) }).finally(() => { requestTask = null })
      return acquired
    },
    async release() {
      owned = false
      releaseHold?.()
      await requestTask
    },
  }
}
