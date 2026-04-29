import { beforeEach, describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'

import { createBrowserContainerStub, renderInBrowser } from '~/__tests__/browser-render'

import CreateGameModal from './CreateGameModal.vue'

function invokeAttrHandler<TEvent>(handler: unknown, event: TEvent) {
  if (Array.isArray(handler)) {
    for (const candidate of handler) {
      if (typeof candidate === 'function') {
        candidate(event)
      }
    }
    return
  }

  if (typeof handler === 'function') {
    handler(event)
  }
}

const {
  handleCompositionEndMock,
  handleCompositionStartMock,
  handleGameNameChangeMock,
  handleSelectFolderMock,
  onSubmitMock,
  useCreateGameFormMock,
  usePreferenceStoreMock,
} = vi.hoisted(() => ({
  handleCompositionEndMock: vi.fn(),
  handleCompositionStartMock: vi.fn(),
  handleGameNameChangeMock: vi.fn(),
  handleSelectFolderMock: vi.fn(),
  onSubmitMock: vi.fn((event?: Event) => {
    event?.preventDefault?.()
  }),
  useCreateGameFormMock: vi.fn(),
  usePreferenceStoreMock: vi.fn(),
}))

vi.mock('~/features/modals/create-game/useCreateGameForm', () => ({
  useCreateGameForm: useCreateGameFormMock,
}))

vi.mock('~/stores/preference', () => ({
  usePreferenceStore: usePreferenceStoreMock,
}))

const globalStubs = {
  Button: defineComponent({
    name: 'StubButton',
    setup(_, { attrs, slots }) {
      return () => h('button', attrs, slots.default?.())
    },
  }),
  Dialog: createBrowserContainerStub('StubDialog'),
  DialogContent: createBrowserContainerStub('StubDialogContent'),
  DialogDescription: createBrowserContainerStub('StubDialogDescription', 'p'),
  DialogFooter: createBrowserContainerStub('StubDialogFooter', 'footer'),
  DialogHeader: createBrowserContainerStub('StubDialogHeader', 'header'),
  DialogTitle: createBrowserContainerStub('StubDialogTitle', 'h2'),
  FormControl: createBrowserContainerStub('StubFormControl'),
  FormField: defineComponent({
    name: 'StubFormField',
    props: {
      name: {
        type: String,
        required: true,
      },
    },
    setup(_, { slots }) {
      return () => slots.default?.({
        componentField: {
          'modelValue': '',
          'onUpdate:modelValue': vi.fn(),
        },
      })
    },
  }),
  FormItem: createBrowserContainerStub('StubFormItem'),
  FormLabel: createBrowserContainerStub('StubFormLabel', 'label'),
  FormMessage: createBrowserContainerStub('StubFormMessage'),
  Input: defineComponent({
    name: 'StubInput',
    props: {
      disabled: {
        type: Boolean,
        default: undefined,
      },
      id: {
        type: String,
        default: undefined,
      },
      modelValue: {
        type: [Object, Array, Number, String, Boolean],
        default: undefined,
      },
    },
    emits: ['update:modelValue'],
    setup(props, { attrs, emit }) {
      return () => h('input', {
        ...attrs,
        disabled: props.disabled,
        id: props.id,
        value: String(props.modelValue ?? ''),
        onInput: (event: Event) => {
          emit('update:modelValue', (event.target as HTMLInputElement).value)
          invokeAttrHandler(attrs.onInput, event)
        },
        onCompositionstart: (event: CompositionEvent) => {
          invokeAttrHandler(attrs.onCompositionstart, event)
        },
        onCompositionend: (event: CompositionEvent) => {
          invokeAttrHandler(attrs.onCompositionend, event)
        },
      })
    },
  }),
  EngineSelector: defineComponent({
    name: 'StubEngineSelector',
    props: {
      preferredEngineId: {
        type: String,
        default: undefined,
      },
    },
    setup(props) {
      return () => h('div', {
        'data-testid': 'engine-selector',
        'data-preferred-engine-id': props.preferredEngineId ?? '',
      })
    },
  }),
  Select: createBrowserContainerStub('StubSelect'),
  SelectContent: createBrowserContainerStub('StubSelectContent'),
  SelectItem: createBrowserContainerStub('StubSelectItem'),
  SelectTrigger: createBrowserContainerStub('StubSelectTrigger', 'button'),
  SelectValue: createBrowserContainerStub('StubSelectValue', 'span'),
  Tooltip: createBrowserContainerStub('StubTooltip'),
  TooltipContent: createBrowserContainerStub('StubTooltipContent'),
  TooltipProvider: createBrowserContainerStub('StubTooltipProvider'),
  TooltipTrigger: createBrowserContainerStub('StubTooltipTrigger'),
}

describe('CreateGameModal', () => {
  beforeEach(() => {
    vi.resetAllMocks()

    onSubmitMock.mockImplementation((event?: Event) => {
      event?.preventDefault?.()
    })
    useCreateGameFormMock.mockReturnValue({
      engineOptions: ref([
        {
          id: 'engine-1',
          name: 'Default Engine',
        },
      ]),
      handleCompositionEnd: handleCompositionEndMock,
      handleCompositionStart: handleCompositionStartMock,
      handleGameNameChange: handleGameNameChangeMock,
      handleSelectFolder: handleSelectFolderMock,
      isFieldDirty: false,
      onSubmit: onSubmitMock,
    })
    usePreferenceStoreMock.mockReturnValue({
      defaultEngineId: 'open-webgal.webgal',
    })
  })

  it('点击选择目录按钮时会调用 useCreateGameForm 提供的目录选择处理器', async () => {
    renderInBrowser(CreateGameModal, {
      browser: {
        i18nMode: 'lite',
      },
      props: {
        open: true,
      },
      global: {
        stubs: globalStubs,
      },
    })

    await page.getByRole('button', { name: 'modals.createGame.selectSaveLocation' }).click()

    expect(handleSelectFolderMock).toHaveBeenCalledTimes(1)
  })

  it('输入游戏名时会调用 useCreateGameForm 提供的输入处理器', async () => {
    renderInBrowser(CreateGameModal, {
      browser: {
        i18nMode: 'lite',
      },
      props: {
        open: true,
      },
      global: {
        stubs: globalStubs,
      },
    })

    await page.getByRole('textbox', { name: 'modals.createGame.gameName' }).fill('Demo')

    expect(handleGameNameChangeMock).toHaveBeenCalled()
  })

  it('点击创建按钮时会提交表单并调用 useCreateGameForm 提供的 onSubmit', async () => {
    renderInBrowser(CreateGameModal, {
      browser: {
        i18nMode: 'lite',
      },
      props: {
        open: true,
      },
      global: {
        stubs: globalStubs,
      },
    })

    await page.getByRole('button', { name: 'modals.createGame.create' }).click()

    await vi.waitFor(() => {
      expect(onSubmitMock).toHaveBeenCalledTimes(1)
    })
  })

  it('会把默认引擎 ID 传给 EngineSelector 作为首选引擎族', async () => {
    renderInBrowser(CreateGameModal, {
      browser: {
        i18nMode: 'lite',
      },
      props: {
        open: true,
      },
      global: {
        stubs: globalStubs,
      },
    })

    const selector = await page.getByTestId('engine-selector').element()

    expect(selector.dataset.preferredEngineId).toBe('open-webgal.webgal')
  })
})
