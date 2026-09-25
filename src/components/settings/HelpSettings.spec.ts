import { describe, expect, it } from 'vitest'
import { page } from 'vitest/browser'

import { createBrowserClickStub, renderInBrowser } from '~/__tests__/browser-render'

import HelpSettings from './HelpSettings.vue'

const globalStubs = {
  Button: createBrowserClickStub('StubButton'),
}

async function renderHelpSettings() {
  return await renderInBrowser(HelpSettings, {
    browser: {
      i18nMode: 'localized',
    },
    global: {
      stubs: globalStubs,
    },
  })
}

describe('HelpSettings', () => {
  it('按场景分组展示快捷键指南', async () => {
    await renderHelpSettings()

    await expect.element(page.getByRole('heading', { name: '快捷操作' })).toBeInTheDocument()
    await expect.element(page.getByRole('heading', { name: '通用' })).toBeInTheDocument()
    await expect.element(page.getByRole('heading', { name: '预览画面', exact: true })).toBeInTheDocument()
    await expect.element(page.getByRole('heading', { name: '变换调整', exact: true })).toBeInTheDocument()
    await expect.element(page.getByText('复制语句')).toBeInTheDocument()
    await expect.element(page.getByText('中键拖拽')).toBeInTheDocument()

    // 引用了 locale 里不存在的键时会原样渲染 key，这里兜住指南新增文案的漏配
    const renderedText = document.body.textContent ?? ''
    expect(renderedText).not.toContain('shortcut.')
    expect(renderedText).not.toContain('settings.help.')
  })

  it('把绑定键渲染成独立的按键片段', async () => {
    await renderHelpSettings()

    const keyLabels = [...document.querySelectorAll('kbd')].map(element => element.textContent?.trim())

    expect(keyLabels).toContain('S')
    expect(keyLabels).toContain('F2')
    expect(keyLabels).toContain('Esc')
  })
})
