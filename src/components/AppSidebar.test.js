import { describe, expect, it } from 'vitest'
import { h } from 'vue'
import { renderToString } from '@vue/server-renderer'
import AppSidebar from './AppSidebar.vue'

describe('AppSidebar owner navigation', () => {
  const tabs = [
    { id: 'home', name: '数据透视' },
    { id: 'finance', name: '公共收支' },
    { id: 'payton-finance', name: 'Payton 资金管理' },
  ]

  it('only exposes Payton finance while Payton is selected', async () => {
    const papa = await renderToString(h(AppSidebar, { tabs, currentTab: 'home', currentOwner: 'papa' }))
    expect(papa).not.toContain('Payton 资金管理')
    const payton = await renderToString(h(AppSidebar, { tabs, currentTab: 'home', currentOwner: 'payton' }))
    expect(payton).toContain('Payton 资金管理')
    expect(payton).not.toContain('公共收支')
  })
})
