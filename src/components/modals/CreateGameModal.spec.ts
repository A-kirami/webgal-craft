/* eslint-disable vue/one-component-per-file */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import { render } from 'vitest-browser-vue'
import { computed, defineComponent, h, reactive } from 'vue'
import { createI18n } from 'vue-i18n'

import CreateGameModal from './CreateGameModal.vue'

import type { Engine } from '~/database/model'

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
      isFieldDirty: computed(() => false),
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

function createTestI18n() {
  return createI18n({
    legacy: false,
    locale: 'en',
    missingWarn: false,
    fallbackWarn: false,
    missing: (_locale, key) => key,
  })
}

const globalStubs = {
  'i18n-t': defineComponent({
    name: 'MockI18nT',
    setup(_, { slots }) {
      return () => h('span', slots.default?.())
    },
  }),
}

function createEngine() {
  return {
    id: 'engine-1',
    path: '/engines/default',
    createdAt: 0,
    status: 'created',
    metadata: {
      name: 'Default Engine',
      icon: '',
      description: '',
    },
  } satisfies Engine
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
      engines: [createEngine()],
    })
  })

  it('输入游戏名后会自动生成保存路径', async () => {
    render(CreateGameModal, {
      props: {
        open: true,
      },
      global: {
        plugins: [createTestI18n()],
        stubs: globalStubs,
      },
    })

    const textboxes = page.getByRole('textbox')
    await textboxes.nth(0).fill('My:Game')

    await expect.element(textboxes.nth(1)).toHaveValue('/games/My_Game')
    expect(joinMock).toHaveBeenCalledWith('/games', 'My_Game')
  })

  it('提交表单时会创建游戏并回传 game id', async () => {
    const onSuccess = vi.fn()
    const updateOpen = vi.fn()

    render(CreateGameModal, {
      props: {
        'open': true,
        onSuccess,
        'onUpdate:open': updateOpen,
      },
      global: {
        plugins: [createTestI18n()],
        stubs: globalStubs,
      },
    })

    await page.getByRole('textbox').nth(0).fill('Demo')
    await page.getByRole('button', { name: 'modals.createGame.create' }).click()

    expect(createGameMock).toHaveBeenCalledWith('Demo', '/games/Demo', '/engines/default')
    expect(updateOpen).toHaveBeenCalledWith(false)
    await expect.poll(() => onSuccess.mock.calls[0]?.[0]).toBe('game-1')
  })
})
