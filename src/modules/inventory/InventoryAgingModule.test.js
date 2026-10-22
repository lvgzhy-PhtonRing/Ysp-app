import { beforeEach, describe, expect, it } from 'vitest'
import { h } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { loadData, state as store } from '../../data/store'
import InventoryAgingModule from './InventoryAgingModule.vue'

describe('InventoryAgingModule owner labels', () => {
  beforeEach(() => loadData({ items: [] }))

  it('uses self-retained wording for Payton and long-term wording for Papa', async () => {
    store.currentOwner = 'payton'
    const payton = await renderToString(h(InventoryAgingModule))
    expect(payton).toContain('自留库存')
    expect(payton).not.toContain('长线库存')

    store.currentOwner = 'papa'
    const papa = await renderToString(h(InventoryAgingModule))
    expect(papa).toContain('长线库存')
  })
})
