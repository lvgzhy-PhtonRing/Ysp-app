import { describe, expect, it } from 'vitest'
import { createEditorLock } from './editorLock'

function manager() {
  let occupied = false
  return {
    request: async (_name, _options, callback) => {
      const lock = occupied ? null : { name: 'ysp-editor' }
      if (lock) occupied = true
      try { return await callback(lock) } finally { if (lock) occupied = false }
    },
  }
}

describe('single-editor browser lock', () => {
  it('grants only one page, then lets another acquire after release', async () => {
    const locks = manager()
    const first = createEditorLock(locks)
    const second = createEditorLock(locks)
    expect(await first.acquire()).toBe(true)
    expect(first.held()).toBe(true)
    expect(await second.acquire()).toBe(false)
    expect(second.held()).toBe(false)
    await first.release()
    expect(first.held()).toBe(false)
    expect(await second.acquire()).toBe(true)
    await second.release()
  })

  it('fails closed when native browser locks are unavailable', async () => {
    const editor = createEditorLock(null)
    expect(await editor.acquire()).toBe(false)
    expect(editor.held()).toBe(false)
  })
})
