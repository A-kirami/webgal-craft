import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, reactive } from 'vue'
import * as z from 'zod'

const {
  useFormMock,
  watchDebouncedMock,
} = vi.hoisted(() => ({
  useFormMock: vi.fn(),
  watchDebouncedMock: vi.fn(),
}))

let latestValues = reactive<Record<string, unknown>>({})
const resetFormMock = vi.fn()

vi.mock('vee-validate', () => ({
  useForm: useFormMock,
}))

vi.mock('@vueuse/core', () => ({
  watchDebounced: watchDebouncedMock,
}))

import { useSettingsForm } from '~/composables/useSettingsForm'

function createMockStore() {
  return {
    $state: reactive({
      theme: 'system',
      fontSize: 14,
    }),
    $patch: vi.fn(),
  }
}

function createScopedFieldsStore() {
  return {
    $state: reactive({
      theme: 'system',
      language: 'system',
      openLastProject: false,
    }),
    $patch: vi.fn(),
  }
}

describe('useSettingsForm', () => {
  beforeEach(() => {
    latestValues = reactive({})
    useFormMock.mockReset()
    watchDebouncedMock.mockReset()
    resetFormMock.mockReset()
    useFormMock.mockImplementation(({ initialValues }: { initialValues: Record<string, unknown> }) => {
      latestValues = reactive({ ...initialValues })
      return {
        values: latestValues,
        handleSubmit: (handler: (values: Record<string, unknown>) => void) => () => handler({ ...latestValues }),
        resetForm: resetFormMock.mockImplementation((state?: { values?: Record<string, unknown> }) => {
          if (!state?.values) {
            return
          }

          for (const key of Object.keys(latestValues)) {
            delete latestValues[key]
          }

          Object.assign(latestValues, state.values)
        }),
      }
    })
  })

  it('没有 immediateFields 时会把整个 values 对象交给防抖监听', () => {
    const store = createMockStore()

    useSettingsForm({
      store: store as never,
      validationSchema: z.object({
        theme: z.string(),
        fontSize: z.number(),
      }),
    })

    expect(watchDebouncedMock).toHaveBeenCalledWith(
      latestValues,
      expect.any(Function),
      { debounce: 300, maxWait: 600 },
    )

    latestValues.fontSize = 16
    const callback = watchDebouncedMock.mock.calls[0]![1] as () => void
    callback()

    expect(store.$patch).toHaveBeenCalledWith({
      theme: 'system',
      fontSize: 16,
    })
  })

  it('immediateFields 会立即同步，而其余字段继续走防抖通道', async () => {
    const store = createMockStore()

    useSettingsForm({
      store: store as never,
      validationSchema: z.object({
        theme: z.string(),
        fontSize: z.number(),
      }),
      immediateFields: ['theme'],
      debounceOptions: { debounce: 10, maxWait: 20 },
    })

    latestValues.theme = 'dark'
    await nextTick()

    expect(store.$patch).toHaveBeenCalledWith({
      theme: 'dark',
      fontSize: 14,
    })
    expect(watchDebouncedMock).toHaveBeenCalledWith(
      expect.any(Function),
      expect.any(Function),
      { debounce: 10, maxWait: 20 },
    )

    latestValues.fontSize = 18
    const callback = watchDebouncedMock.mock.calls[0]![1] as () => void
    callback()

    expect(store.$patch).toHaveBeenLastCalledWith({
      theme: 'dark',
      fontSize: 18,
    })
  })

  it('fieldNames 只同步表单托管字段，避免回写额外 store 状态', () => {
    const store = createScopedFieldsStore()

    useSettingsForm({
      store: store as never,
      validationSchema: z.object({
        language: z.string(),
        openLastProject: z.boolean(),
      }),
      fieldNames: ['language', 'openLastProject'],
    } as never)

    expect(useFormMock).toHaveBeenCalledWith(expect.objectContaining({
      initialValues: {
        language: 'system',
        openLastProject: false,
      },
    }))

    latestValues.language = 'en'
    const callback = watchDebouncedMock.mock.calls[0]![1] as () => void
    callback()

    expect(store.$patch).toHaveBeenLastCalledWith({
      language: 'en',
      openLastProject: false,
    })
  })

  it('store 外部更新时会把最新值回填到表单', async () => {
    const store = createScopedFieldsStore()

    useSettingsForm({
      store: store as never,
      validationSchema: z.object({
        language: z.string(),
        openLastProject: z.boolean(),
      }),
      fieldNames: ['language', 'openLastProject'],
    } as never)

    store.$state.language = 'ja'
    store.$state.openLastProject = true
    await nextTick()

    expect(resetFormMock).toHaveBeenCalledWith({
      values: {
        language: 'ja',
        openLastProject: true,
      },
    })
    expect(latestValues).toMatchObject({
      language: 'ja',
      openLastProject: true,
    })
  })
})
