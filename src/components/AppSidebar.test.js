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

  it('places the live date and time below operation logs in the sidebar', async () => {
    const html = await renderToString(h(AppSidebar, { tabs, currentTab: 'home', currentOwner: 'papa', version: '5.0.3' }))
    const versionPosition = html.indexOf('v5.0.3')
    const logsPosition = html.indexOf('操作日志')
    const clockPosition = html.indexOf('<time')
    expect(versionPosition).toBeLessThan(logsPosition)
    expect(logsPosition).toBeLessThan(clockPosition)
    expect(html.slice(versionPosition, logsPosition)).not.toContain('<time')
  })

  it('keeps the data operations arrow close to its label and aligns date with version', async () => {
    const html = await renderToString(h(AppSidebar, { tabs, currentTab: 'home', version: '5.0.3' }))
    expect(html).toContain('w-56')
    expect(html).not.toContain('flex-1">数据操作')
    expect(html).toContain('text-left text-[11px] text-gray-400')
  })

  it('groups the tax workbook with tax filing and places cloud sync in data operations', async () => {
    const html = await renderToString(h(AppSidebar, { tabs, currentTab: 'home' }))
    expect(html).toContain('税务申报')
    expect(html).not.toContain('申报提醒')
    expect(html.indexOf('报税工作簿')).toBeGreaterThan(html.indexOf('税务申报'))
    expect(html.indexOf('数据操作')).toBeGreaterThan(html.indexOf('报税工作簿'))
    expect(html).toMatch(/<div[^>]*data-menu="data-operations"[^>]*>[\s\S]*?云端同步[\s\S]*?<\/div>/)
    expect(html.indexOf('云端同步')).toBeGreaterThan(html.indexOf('数据操作'))
    expect(html.indexOf('云端同步')).toBeLessThan(html.indexOf('操作日志'))
  })
})
