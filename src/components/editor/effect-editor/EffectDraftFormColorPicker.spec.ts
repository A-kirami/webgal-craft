import { describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'

import { createBrowserInputStub, createBrowserValueStub, renderInBrowser } from '~/__tests__/browser-render'

vi.mock('~/stores/workspace', () => ({
  useWorkspaceStore: () => ({ CWD: '/game' }),
}))

import EffectDraftForm from './EffectDraftForm.vue'

// 浏览器测试环境 uno.css 不含按需工具类，可见性相关的类必须 safelist
// @unocss-safelist h-7 w-24 h-6 min-w-14 w-12 w-full h-full w-64 h-40 block relative inline-flex items-center justify-center gap-1.5 p-2px aspect-square shrink-0 flex-1 min-w-0 text-xs truncate flex flex-col gap-3 overflow-hidden self-stretch p-0 p-0.5 gap-0.5 px-1 px-1.5 py-0 pr-0.5 w-8 text-right text-center font-mono w-px h-px bg-border
import 'virtual:uno.css'

const globalStubs = {
  Button: createBrowserValueStub('StubButton', 'button'),
  InputGroup: createBrowserValueStub('StubInputGroup'),
  InputGroupAddon: createBrowserValueStub('StubInputGroupAddon', 'span'),
  InputGroupInput: createBrowserInputStub('StubInputGroupInput'),
  Label: createBrowserValueStub('StubLabel', 'label'),
  ScrollArea: createBrowserValueStub('StubScrollArea'),
  SegmentedControl: createBrowserValueStub('StubSegmentedControl'),
  Select: createBrowserValueStub('StubSelect'),
  SelectContent: createBrowserValueStub('StubSelectContent'),
  SelectItem: createBrowserValueStub('StubSelectItem'),
  SelectTrigger: createBrowserValueStub('StubSelectTrigger', 'button'),
  SelectValue: createBrowserValueStub('StubSelectValue', 'span'),
  Slider: createBrowserValueStub('StubSlider'),
}

describe('EffectDraftForm', () => {
  it('点击颜色按钮会打开真实颜色选择器', async () => {
    renderInBrowser(EffectDraftForm, {
      props: {
        duration: '300',
        ease: '',
        transform: {},
      },
      global: { stubs: globalStubs },
      browser: { i18nMode: 'localized', locale: 'zh-Hans' },
    })

    const trigger = page.getByRole('button', { name: '颜色' }).first()
    await trigger.click()

    await expect.element(trigger).toHaveAttribute('aria-expanded', 'true')
    await expect.element(page.getByTestId('color-picker-area')).toBeVisible()
    await expect.element(page.getByTestId('color-picker-format-switch')).toBeVisible()
  })

  it('在真实色板交互期间延迟更新并在选择器关闭后刷新最终颜色', async () => {
    const transformUpdates = vi.fn()
    renderInBrowser(EffectDraftForm, {
      props: {
        'duration': '300',
        'ease': '',
        'onUpdate:transform': transformUpdates,
        'transform': {},
      },
      global: { stubs: globalStubs },
      browser: { i18nMode: 'localized', locale: 'zh-Hans' },
    })

    const trigger = page.getByRole('button', { name: '颜色' }).first()
    await trigger.click()
    await page.getByTestId('color-picker-area').click({
      position: { x: 32, y: 24 },
    })

    expect(transformUpdates).toHaveBeenCalled()
    expect(transformUpdates.mock.calls.some(([payload]) => payload.deferAutoApply === true)).toBe(true)
    expect(transformUpdates.mock.calls.some(([payload]) => payload.flush === true)).toBe(false)

    await trigger.click()

    await expect.element(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(transformUpdates.mock.calls.filter(([payload]) => payload.flush === true)).toHaveLength(1)
    expect(transformUpdates.mock.lastCall?.[0]).toMatchObject({
      deferAutoApply: false,
      flush: true,
    })
  })
})
