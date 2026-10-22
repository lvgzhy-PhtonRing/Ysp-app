import { describe, expect, it } from 'vitest'
import { h } from 'vue'
import { renderToString } from '@vue/server-renderer'
import AppSidebar from './AppSidebar.vue'

describe('AppSidebar owner navigation', () => {
  const tabs = [
    { id: 'home', name: '数据透视' },
    { id: 'finance', name: '公共收支' },
    { id: 'payton-finance', name: '皮蛋金库' },
  ]

  it('only exposes Payton finance while Payton is selected', async () => {
    const papa = await renderToString(h(AppSidebar, { tabs, currentTab: 'home', currentOwner: 'papa' }))
    expect(papa).not.toContain('皮蛋金库')
    const payton = await renderToString(h(AppSidebar, { tabs, currentTab: 'home', currentOwner: 'payton' }))
    expect(payton).toContain('皮蛋金库')
    expect(payton).not.toContain('公共收支')
  })

  it('places a live date and time beside the version in the sidebar header', async () => {
    const html = await renderToString(h(AppSidebar, { tabs, currentTab: 'home', currentOwner: 'papa', version: '5.0.3' }))
    expect(html).toMatch(/v5\.0\.3[\s\S]*20\d{2}[/-]\d{1,2}[/-]\d{1,2}\s+\d{2}:\d{2}/)
  })
})
