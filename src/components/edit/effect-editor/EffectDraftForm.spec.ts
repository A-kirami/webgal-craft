import { createPinia } from 'pinia'
import { describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import { render } from 'vitest-browser-vue'
import { defineComponent, h } from 'vue'

import { createBrowserConsoleMonitor, createBrowserLocalizedI18n } from '~/__tests__/browser'
import { EFFECT_CATEGORIES } from '~/helper/effect-editor-config'

vi.mock('~/stores/workspace', () => ({
  useWorkspaceStore: () => ({
    CWD: '/game',
  }),
}))

import EffectDraftForm from './EffectDraftForm.vue'

function createPassthroughStub(tag: string) {
  return defineComponent({
    name: `Stub${tag}`,
    props: {
      id: {
        type: String,
        default: undefined,
      },
      modelValue: {
        type: [Object, Array, Number, String],
        default: undefined,
      },
    },
    setup(props, { attrs, slots }) {
      return () => h(tag, {
        ...attrs,
        id: props.id,
        value: Array.isArray(props.modelValue) ? String(props.modelValue[0] ?? '') : props.modelValue,
      }, slots.default?.())
    },
  })
}

const globalStubs = {
  Button: createPassthroughStub('button'),
  ColorPicker: createPassthroughStub('div'),
  Input: createPassthroughStub('input'),
  InputGroup: createPassthroughStub('div'),
  InputGroupAddon: createPassthroughStub('span'),
  InputGroupInput: createPassthroughStub('input'),
  Label: createPassthroughStub('label'),
  ScrollArea: createPassthroughStub('div'),
  SegmentedControl: createPassthroughStub('div'),
  Select: createPassthroughStub('div'),
  SelectContent: createPassthroughStub('div'),
  SelectItem: createPassthroughStub('div'),
  SelectTrigger: createPassthroughStub('button'),
  SelectValue: createPassthroughStub('span'),
  Slider: createPassthroughStub('div'),
}

const { expectNoConsoleMessage } = createBrowserConsoleMonitor()

describe('EffectDraftForm', () => {
  it('为 linked-slider 的 X/Y 数字输入提供唯一的可访问名称', async () => {
    render(EffectDraftForm, {
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
    render(EffectDraftForm, {
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
