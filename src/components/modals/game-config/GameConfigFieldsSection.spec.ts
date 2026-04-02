import { describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import { defineComponent, h } from 'vue'

import {
  createBrowserCheckboxStub,
  createBrowserClickStub,
  createBrowserContainerStub,
  createBrowserInputStub,
  renderInBrowser,
} from '~/__tests__/browser-render'

vi.mock('~/components/ui/form', async () => {
  const actual = await vi.importActual<typeof import('~/components/ui/form')>('~/components/ui/form')

  return {
    ...actual,
    FormField: defineComponent({
      name: 'MockFormField',
      props: {
        name: {
          type: String,
          required: true,
        },
      },
      setup(_props, { slots }) {
        return () => slots.default?.({
          componentField: {
            modelValue: '',
            ['onUpdate:modelValue']: vi.fn(),
          },
          handleChange: vi.fn(),
          value: '',
        })
      },
    }),
  }
})

import GameConfigFieldsSection from './GameConfigFieldsSection.vue'

const globalStubs = {
  TitleImgPicker: createBrowserContainerStub('StubTitleImgPicker'),
  FilePicker: defineComponent({
    name: 'StubFilePicker',
    props: {
      extensions: {
        type: Array,
        default: () => [],
      },
      inputId: {
        type: String,
        default: undefined,
      },
      modelValue: {
        type: String,
        default: '',
      },
      popoverTitle: {
        type: String,
        default: '',
      },
      rootPath: {
        type: String,
        required: true,
      },
    },
    emits: ['update:modelValue'],
    setup(props, { emit }) {
      return () => h('input', {
        'data-extensions': props.extensions.join('|'),
        'data-popover-title': props.popoverTitle,
        'data-root-path': props.rootPath,
        'id': props.inputId,
        'value': props.modelValue,
        'onInput': (event: Event) => emit('update:modelValue', (event.target as HTMLInputElement).value),
      })
    },
  }),
  FormControl: createBrowserContainerStub('StubFormControl'),
  FormDescription: createBrowserContainerStub('StubFormDescription'),
  FormItem: createBrowserContainerStub('StubFormItem'),
  FormLabel: createBrowserContainerStub('StubFormLabel', 'label'),
  FormMessage: createBrowserContainerStub('StubFormMessage'),
  Input: createBrowserInputStub('StubInput'),
  InputGroup: createBrowserContainerStub('StubInputGroup'),
  InputGroupAddon: createBrowserContainerStub('StubInputGroupAddon'),
  InputGroupButton: createBrowserClickStub('StubInputGroupButton'),
  InputGroupInput: createBrowserInputStub('StubInputGroupInput'),
  Select: createBrowserContainerStub('StubSelect'),
  SelectContent: createBrowserContainerStub('StubSelectContent'),
  SelectItem: createBrowserContainerStub('StubSelectItem'),
  SelectTrigger: createBrowserContainerStub('StubSelectTrigger', 'button'),
  SelectValue: createBrowserContainerStub('StubSelectValue'),
  GameLogoPicker: createBrowserContainerStub('StubGameLogoPicker'),
  Switch: createBrowserCheckboxStub('StubSwitch'),
  Textarea: createBrowserInputStub('StubTextarea', 'textarea'),
  Tooltip: createBrowserContainerStub('StubTooltip'),
  TooltipContent: createBrowserContainerStub('StubTooltipContent'),
  TooltipProvider: createBrowserContainerStub('StubTooltipProvider'),
  TooltipTrigger: createBrowserContainerStub('StubTooltipTrigger'),
}

function renderSection(i18nMode: 'lite' | 'localized' = 'lite', messages?: Record<string, unknown>) {
  return renderInBrowser(GameConfigFieldsSection, {
    browser: {
      i18nMode,
      messages,
    },
    props: {
      backgroundRootPath: '/games/demo/game/background',
      bgmRootPath: '/games/demo/game/bgm',
      gamePath: '/games/demo',
      serveUrl: 'http://127.0.0.1:8899/game/demo/',
    },
    global: {
      stubs: globalStubs,
    },
  })
}

const localizedDefaultLanguageOptions = Object.fromEntries([
  ['zh_CN', '测试简中'],
  ['zh_TW', '测试繁中'],
  ['en', 'Test English'],
  ['ja', 'Test Japanese'],
  ['fr', 'Test French'],
  ['de', 'Test German'],
])

describe('GameConfigFieldsSection', () => {
  it('titleBgm 使用限定在 bgm 目录的文件选择器', async () => {
    const result = renderSection()

    await expect.element(page.getByLabelText('modals.gameConfig.fields.titleBgm.label')).toHaveAttribute('data-root-path', '/games/demo/game/bgm')
    await expect.element(page.getByLabelText('modals.gameConfig.fields.titleBgm.label')).toHaveAttribute('data-extensions', '.mp3|.ogg|.wav')
    await expect.element(page.getByLabelText('modals.gameConfig.fields.titleBgm.label')).toHaveAttribute('data-popover-title', 'modals.gameConfig.fields.titleBgm.pickerTitle')

    await result.unmount()
  })

  it('默认游戏语言选项使用固定语言名，不跟随界面 i18n 文案改变', async () => {
    const result = renderSection('localized', {
      'zh-Hans': {
        modals: {
          gameConfig: {
            fields: {
              defaultLanguage: {
                options: localizedDefaultLanguageOptions,
              },
            },
          },
        },
      },
    })

    await expect.element(page.getByText(/^简体中文$/)).toBeInTheDocument()
    await expect.element(page.getByText(/^繁體中文$/)).toBeInTheDocument()
    await expect.element(page.getByText(/^English$/)).toBeInTheDocument()
    await expect.element(page.getByText(/^日本語$/)).toBeInTheDocument()
    await expect.element(page.getByText(/^Français$/)).toBeInTheDocument()
    await expect.element(page.getByText(/^Deutsch$/)).toBeInTheDocument()

    await expect.element(page.getByText(/^测试简中$/)).not.toBeInTheDocument()
    await expect.element(page.getByText(/^测试繁中$/)).not.toBeInTheDocument()
    await expect.element(page.getByText(/^Test English$/)).not.toBeInTheDocument()
    await expect.element(page.getByText(/^Test Japanese$/)).not.toBeInTheDocument()
    await expect.element(page.getByText(/^Test French$/)).not.toBeInTheDocument()
    await expect.element(page.getByText(/^Test German$/)).not.toBeInTheDocument()

    await result.unmount()
  })
})
