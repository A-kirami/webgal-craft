import { createPinia } from 'pinia'
import { describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'

import { createBrowserConsoleMonitor, createBrowserLocalizedI18n } from '~/__tests__/browser'
import { createBrowserValueStub, renderInBrowser } from '~/__tests__/browser-render'
import { EFFECT_CATEGORIES } from '~/helper/effect-editor-config'

vi.mock('~/stores/workspace', () => ({
  useWorkspaceStore: () => ({
    CWD: '/game',
  }),
}))

import EffectDraftForm from './EffectDraftForm.vue'

const globalStubs = {
  Button: createBrowserValueStub('StubButton', 'button'),
  ColorPicker: createBrowserValueStub('StubColorPicker'),
  Input: createBrowserValueStub('StubInput', 'input'),
  InputGroup: createBrowserValueStub('StubInputGroup'),
  InputGroupAddon: createBrowserValueStub('StubInputGroupAddon', 'span'),
  InputGroupInput: createBrowserValueStub('StubInputGroupInput', 'input'),
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

const { expectNoConsoleMessage } = createBrowserConsoleMonitor()

describe('EffectDraftForm', () => {
  it('为 linked-slider 的 X/Y 数字输入提供唯一的可访问名称', async () => {
    renderInBrowser(EffectDraftForm, {
      props: {
        duration: '200',
        ease: '',
        transform: {
          scale: {
            x: 1,
            y: 1,
          },
        },
      },
      global: {
        plugins: [createPinia(), createBrowserLocalizedI18n()],
        stubs: globalStubs,
      },
    })

    await expect.element(page.getByRole('spinbutton', { name: '缩放 X' })).toBeInTheDocument()
    await expect.element(page.getByRole('spinbutton', { name: '缩放 Y' })).toBeInTheDocument()
    expectNoConsoleMessage('Invalid prop: type check failed for prop "modelValue"')
  })

  it('渲染顶部控件并按分类输出特效参数区域', async () => {
    renderInBrowser(EffectDraftForm, {
      props: {
        duration: '300',
        ease: '',
        transform: {
          scale: {
            x: 1,
            y: 1,
          },
        },
      },
      global: {
        plugins: [createPinia(), createBrowserLocalizedI18n()],
        stubs: globalStubs,
      },
    })

    await expect.element(page.getByText('过渡时间')).toBeInTheDocument()
    expect(page.getByRole('group').elements()).toHaveLength(EFFECT_CATEGORIES.length)
  })
})
