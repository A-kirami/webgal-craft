import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import { defineComponent, h, reactive } from 'vue'

import { renderInBrowser } from '~/__tests__/browser-render'
import { createTestEngine } from '~/__tests__/factories'

import CreateGameModal from './CreateGameModal.vue'

const {
  createGameMock,
  existsMock,
  joinMock,
  openDialogMock,
  readDirMock,
  useResourceStoreMock,
  useStorageSettingsStoreMock,
} = vi.hoisted(() => ({
  createGameMock: vi.fn(),
  existsMock: vi.fn(),
  joinMock: vi.fn(async (...parts: string[]) => parts.join('/')),
  openDialogMock: vi.fn(),
  readDirMock: vi.fn(),
  useResourceStoreMock: vi.fn(),
  useStorageSettingsStoreMock: vi.fn(),
}))

vi.mock('@tauri-apps/api/path', () => ({
  join: joinMock,
}))

vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: openDialogMock,
}))

vi.mock('@tauri-apps/plugin-fs', () => ({
  exists: existsMock,
  readDir: readDirMock,
}))

vi.mock('~/services/game-manager', () => ({
  gameManager: {
    createGame: createGameMock,
  },
}))

vi.mock('~/stores/storage-settings', () => ({
  useStorageSettingsStore: useStorageSettingsStoreMock,
}))

vi.mock('~/stores/resource', () => ({
  useResourceStore: useResourceStoreMock,
}))

vi.mock('vee-validate', () => {
  const fieldContextKey = Symbol('FieldContextKey')
  const formContext = reactive<{
    values: Record<string, unknown>
  }>({
    values: {},
  })

  function useForm(options?: { initialValues?: Record<string, unknown> }) {
    formContext.values = reactive({
      ...options?.initialValues,
    })

    return {
      handleSubmit(callback: (values: Record<string, unknown>) => unknown | Promise<unknown>) {
        return async (event?: Event) => {
          event?.preventDefault?.()
          await callback({ ...formContext.values })
        }
      },
      isFieldDirty: () => false,
      setFieldValue(name: string, value: unknown) {
        formContext.values[name] = value
      },
    }
  }

  const Field = defineComponent({
    name: 'MockFormField',
    inheritAttrs: false,
    props: {
      name: {
        type: String,
        required: true,
      },
      validateOnBlur: {
        type: Boolean,
        required: false,
      },
      validateOnChange: {
        type: Boolean,
        required: false,
      },
    },
    setup(props, { slots }) {
      return () => {
        const componentField = {
          'modelValue': formContext.values[props.name] ?? '',
          'onUpdate:modelValue': (value: unknown) => {
            formContext.values[props.name] = value
          },
        }

        return slots.default?.({ componentField })
      }
    },
  })

  return {
    Field,
    FieldArray: defineComponent({
      name: 'MockFormFieldArray',
      setup(_, { slots }) {
        return () => slots.default?.()
      },
    }),
    FieldContextKey: fieldContextKey,
    Form: defineComponent({
      name: 'MockForm',
      setup(_, { slots }) {
        return () => slots.default?.()
      },
    }),
    useFieldError: () => computed(() => undefined),
    useForm,
    useIsFieldDirty: () => computed(() => false),
    useIsFieldTouched: () => computed(() => false),
    useIsFieldValid: () => computed(() => true),
  }
})

vi.mock('~/components/ui/form/FormControl.vue', () => ({
  default: defineComponent({
    name: 'MockFormControl',
    setup(_, { slots, attrs }) {
      return () => h('div', attrs, slots.default?.())
    },
  }),
}))

vi.mock('~/components/ui/form/FormLabel.vue', () => ({
  default: defineComponent({
    name: 'MockFormLabel',
    setup(_, { slots, attrs }) {
      return () => h('label', attrs, slots.default?.())
    },
  }),
}))

vi.mock('~/components/ui/form/FormMessage.vue', () => ({
  default: defineComponent({
    name: 'MockFormMessage',
    setup(_, { attrs }) {
      return () => h('div', attrs)
    },
  }),
}))

const globalStubs = {
  'i18n-t': defineComponent({
    name: 'MockI18nT',
    setup(_, { slots }) {
      return () => h('span', slots.default?.())
    },
  }),
}

describe('CreateGameModal', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  beforeEach(() => {
    createGameMock.mockReset()
    existsMock.mockReset()
    joinMock.mockClear()
    openDialogMock.mockReset()
    readDirMock.mockReset()
    useResourceStoreMock.mockReset()
    useStorageSettingsStoreMock.mockReset()

    existsMock.mockResolvedValue(false)
    readDirMock.mockResolvedValue([])
    openDialogMock.mockResolvedValue(undefined)
    createGameMock.mockResolvedValue('game-1')
    useStorageSettingsStoreMock.mockReturnValue({
      gameSavePath: '/games',
    })
    useResourceStoreMock.mockReturnValue({
      engines: [createTestEngine({
        metadata: {
          description: '',
          icon: '',
        },
      })],
    })
  })

  it('点击选择目录按钮时会打开保存位置对话框', async () => {
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

    expect(openDialogMock).toHaveBeenCalledWith(expect.objectContaining({
      defaultPath: '/games',
      directory: true,
      multiple: false,
      title: 'modals.createGame.selectSaveLocation',
    }))
  })

  it('提交表单时会创建游戏并回传游戏标识', async () => {
    const onSuccess = vi.fn()
    const updateOpen = vi.fn()

    renderInBrowser(CreateGameModal, {
      browser: {
        i18nMode: 'lite',
      },
      props: {
        'open': true,
        onSuccess,
        'onUpdate:open': updateOpen,
      },
      global: {
        stubs: globalStubs,
      },
    })

    await page.getByRole('textbox', { name: 'modals.createGame.gameName' }).fill('Demo')
    await page.getByRole('button', { name: 'modals.createGame.create' }).click()

    expect(createGameMock).toHaveBeenCalledWith('Demo', '/games/Demo', '/engines/default')
    expect(updateOpen).toHaveBeenCalledWith(false)
    expect(onSuccess).toHaveBeenCalledWith('game-1')
  })
})
