import { createPinia } from 'pinia'
import { describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'

import { createBrowserConsoleMonitor, createBrowserLocalizedI18n } from '~/__tests__/browser'
import { createBrowserInputStub, createBrowserValueStub, renderInBrowser } from '~/__tests__/browser-render'
import { EFFECT_CATEGORIES } from '~/features/editor/effect-editor/effect-editor-config'

vi.mock('~/stores/workspace', () => ({
  useWorkspaceStore: () => ({
    CWD: '/game',
  }),
}))

import EffectDraftForm from './EffectDraftForm.vue'

const globalStubs = {
  Button: createBrowserValueStub('StubButton', 'button'),
  ColorPicker: createBrowserValueStub('StubColorPicker'),
  Input: createBrowserInputStub('StubInput'),
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
  it('为联动滑条的 X/Y 数字输入提供唯一的可访问名称', async () => {
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

  it('在旋转控件旁提供水平和垂直翻转按钮', async () => {
    const transformUpdates = vi.fn()

    renderInBrowser(EffectDraftForm, {
      props: {
        'duration': '200',
        'ease': '',
        'onUpdate:transform': transformUpdates,
        'transform': {
          position: { x: 12 },
          rotation: 0.5,
          scale: {
            x: 1.25,
            y: -0.75,
          },
        },
      },
      global: {
        plugins: [createPinia(), createBrowserLocalizedI18n()],
        stubs: globalStubs,
      },
    })

    await page.getByRole('button', { name: '水平翻转' }).click()
    await page.getByRole('button', { name: '垂直翻转' }).click()

    expect(transformUpdates).toHaveBeenNthCalledWith(1, {
      value: {
        position: { x: 12 },
        rotation: 0.5,
        scale: {
          x: -1.25,
          y: -0.75,
        },
      },
      deferAutoApply: false,
      flush: true,
    })
    expect(transformUpdates).toHaveBeenNthCalledWith(2, {
      value: {
        position: { x: 12 },
        rotation: 0.5,
        scale: {
          x: 1.25,
          y: 0.75,
        },
      },
      deferAutoApply: false,
      flush: true,
    })
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
    expect(page.getByTestId('effect-draft-category-section').elements()).toHaveLength(EFFECT_CATEGORIES.length)
  })

  it('显示基线字段后修改其他字段不会把基线写入变换', async () => {
    const transformUpdates = vi.fn()

    renderInBrowser(EffectDraftForm, {
      props: {
        'baselineTransform': {
          position: { x: 1000, y: 20 },
        },
        'duration': '300',
        'ease': '',
        'onUpdate:transform': transformUpdates,
        'transform': {},
      },
      global: {
        plugins: [createPinia(), createBrowserLocalizedI18n()],
        stubs: globalStubs,
      },
    })

    await expect.element(page.getByRole('spinbutton', { name: 'X 位移' })).toHaveValue(1000)

    const alphaInput = page.getByRole('group', { name: '效果' }).getByRole('spinbutton', { name: '不透明度' })
    await alphaInput.fill('0.8')

    expect(transformUpdates).toHaveBeenCalledWith({
      value: {
        alpha: 0.8,
      },
      deferAutoApply: true,
      flush: undefined,
    })
  })

  it('基线或浮层预览展示值不会启用清除按钮', async () => {
    renderInBrowser(EffectDraftForm, {
      props: {
        baselineTransform: {
          position: { x: 1000 },
        },
        duration: '300',
        ease: '',
        previewFieldValue: (path: string) => path === 'position.y' ? '20' : undefined,
        transform: {},
      },
      global: {
        plugins: [createPinia(), createBrowserLocalizedI18n()],
        stubs: globalStubs,
      },
    })

    await expect.element(page.getByRole('spinbutton', { name: 'X 位移' })).toHaveValue(1000)
    await expect.element(page.getByRole('spinbutton', { name: 'Y 位移' })).toHaveValue(20)
    await expect.element(page.getByRole('button', { name: '清除X 位移' })).not.toBeInTheDocument()
    await expect.element(page.getByRole('button', { name: '清除Y 位移' })).not.toBeInTheDocument()
  })

  it('显示浮层预览字段后修改其他字段不会把预览值写入变换', async () => {
    const transformUpdates = vi.fn()

    renderInBrowser(EffectDraftForm, {
      props: {
        'duration': '300',
        'ease': '',
        'onUpdate:transform': transformUpdates,
        'previewFieldValue': (path: string) => path === 'position.x' ? '88' : undefined,
        'transform': {
          position: { x: 12 },
        },
      },
      global: {
        plugins: [createPinia(), createBrowserLocalizedI18n()],
        stubs: globalStubs,
      },
    })

    await expect.element(page.getByRole('spinbutton', { name: 'X 位移' })).toHaveValue(88)

    const alphaInput = page.getByRole('group', { name: '效果' }).getByRole('spinbutton', { name: '不透明度' })
    await alphaInput.fill('0.8')

    expect(transformUpdates).toHaveBeenCalledWith({
      value: {
        alpha: 0.8,
        position: { x: 12 },
      },
      deferAutoApply: true,
      flush: undefined,
    })
  })
})
