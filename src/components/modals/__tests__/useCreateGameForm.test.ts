import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, reactive, ref } from 'vue'

const {
  createGameMock,
  existsMock,
  joinMock,
  notifyErrorMock,
  openDialogMock,
  readDirMock,
  isFieldDirtyMock,
  setFieldValueMock,
  useFormMock,
  useResourceStoreMock,
  useStorageSettingsStoreMock,
} = vi.hoisted(() => ({
  createGameMock: vi.fn(),
  existsMock: vi.fn(),
  joinMock: vi.fn(async (...parts: string[]) => parts.join('/')),
  notifyErrorMock: vi.fn(),
  openDialogMock: vi.fn(),
  readDirMock: vi.fn(),
  isFieldDirtyMock: vi.fn(),
  setFieldValueMock: vi.fn(),
  useFormMock: vi.fn(),
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

vi.mock('vue-i18n', () => ({
  useI18n() {
    return {
      t(key: string) {
        return key
      },
    }
  },
}))

vi.mock('notivue', () => ({
  push: {
    error: notifyErrorMock,
  },
}))

vi.mock('vee-validate', () => ({
  useForm: useFormMock,
}))

vi.mock('~/services/game-manager', () => ({
  gameManager: {
    createGame: createGameMock,
  },
}))

vi.mock('~/stores/resource', () => ({
  useResourceStore: useResourceStoreMock,
}))

vi.mock('~/stores/storage-settings', () => ({
  useStorageSettingsStore: useStorageSettingsStoreMock,
}))

import { useCreateGameForm } from '../useCreateGameForm'

let formValues = reactive<Record<string, unknown>>({})
interface ResourceStoreEngine {
  id: string
  path: string
  metadata: {
    name: string
  }
}

describe('useCreateGameForm 行为', () => {
  beforeEach(() => {
    formValues = reactive({})

    createGameMock.mockReset()
    existsMock.mockReset()
    joinMock.mockReset()
    notifyErrorMock.mockReset()
    openDialogMock.mockReset()
    readDirMock.mockReset()
    isFieldDirtyMock.mockReset()
    setFieldValueMock.mockReset()
    useFormMock.mockReset()
    useResourceStoreMock.mockReset()
    useStorageSettingsStoreMock.mockReset()

    createGameMock.mockResolvedValue('game-1')
    existsMock.mockResolvedValue(false)
    joinMock.mockImplementation(async (...parts: string[]) => parts.join('/'))
    openDialogMock.mockResolvedValue(undefined)
    readDirMock.mockResolvedValue([])
    isFieldDirtyMock.mockReturnValue(false)

    useStorageSettingsStoreMock.mockReturnValue({
      gameSavePath: '/games',
    })

    useResourceStoreMock.mockReturnValue({
      engines: [
        {
          id: 'engine-1',
          path: '/engines/default',
          metadata: {
            name: 'Default Engine',
          },
        },
      ],
    })

    useFormMock.mockImplementation((options?: { initialValues?: Record<string, unknown> }) => {
      formValues = reactive({
        ...options?.initialValues,
      })

      setFieldValueMock.mockImplementation((name: string, value: unknown) => {
        formValues[name] = value
      })

      return {
        handleSubmit(handler: (values: Record<string, unknown>) => Promise<unknown> | unknown) {
          return async (event?: Event) => {
            event?.preventDefault?.()
            await handler({ ...formValues })
          }
        },
        isFieldDirty: isFieldDirtyMock,
        setFieldValue: setFieldValueMock,
      }
    })
  })

  it('会根据游戏名自动生成建议路径并设置默认引擎', async () => {
    const open = ref(true)
    const form = useCreateGameForm({ open })

    await form.handleGameNameChange({
      target: { value: 'My:Game' },
    } as never)

    expect(setFieldValueMock).toHaveBeenCalledWith('gameEngine', 'engine-1')
    expect(joinMock).toHaveBeenCalledWith('/games', 'My_Game')
    expect(setFieldValueMock).toHaveBeenCalledWith('gamePath', '/games/My_Game', false)
  })

  it('引擎异步加载后会补上默认引擎', async () => {
    const open = ref(true)
    const resourceStore = reactive({
      engines: undefined as ResourceStoreEngine[] | undefined,
    })

    useResourceStoreMock.mockReturnValue(resourceStore)

    useCreateGameForm({ open })

    resourceStore.engines = [
      {
        id: 'engine-1',
        path: '/engines/default',
        metadata: {
          name: 'Default Engine',
        },
      },
    ]

    await nextTick()

    expect(setFieldValueMock).toHaveBeenCalledWith('gameEngine', 'engine-1')
  })

  it('用户已手动修改引擎字段时不会被默认值覆盖', async () => {
    const open = ref(true)
    const resourceStore = reactive({
      engines: undefined as ResourceStoreEngine[] | undefined,
    })

    isFieldDirtyMock.mockImplementation((field: string) => field === 'gameEngine')
    useResourceStoreMock.mockReturnValue(resourceStore)

    useCreateGameForm({ open })

    resourceStore.engines = [
      {
        id: 'engine-1',
        path: '/engines/default',
        metadata: {
          name: 'Default Engine',
        },
      },
    ]

    await nextTick()

    expect(setFieldValueMock).not.toHaveBeenCalledWith('gameEngine', 'engine-1')
  })

  it('手动选择目录后不会再被自动建议路径覆盖', async () => {
    const open = ref(true)
    const form = useCreateGameForm({ open })
    openDialogMock.mockResolvedValue('/manual/path')

    await form.handleSelectFolder()
    await form.handleGameNameChange({
      target: { value: 'Demo' },
    } as never)

    expect(setFieldValueMock).toHaveBeenCalledWith('gamePath', '/manual/path', false)
    expect(joinMock).not.toHaveBeenCalled()
  })

  it('选择目录时会以目录模式打开对话框并携带默认保存路径', async () => {
    const open = ref(true)
    const form = useCreateGameForm({ open })
    openDialogMock.mockResolvedValue('/manual/path')

    await form.handleSelectFolder()

    expect(openDialogMock).toHaveBeenCalledWith({
      title: 'modals.createGame.selectSaveLocation',
      directory: true,
      multiple: false,
      defaultPath: '/games',
    })
    expect(setFieldValueMock).toHaveBeenCalledWith('gamePath', '/manual/path', false)
  })

  it('提交时会关闭弹窗并创建游戏且回调 game id', async () => {
    const open = ref(true)
    const onSuccess = vi.fn()
    const form = useCreateGameForm({ open, onSuccess })

    formValues.gameName = 'Demo'
    formValues.gamePath = '/games/Demo'
    formValues.gameEngine = 'engine-1'

    await form.onSubmit()

    expect(createGameMock).toHaveBeenCalledWith('Demo', '/games/Demo', '/engines/default')
    expect(open.value).toBe(false)
    expect(onSuccess).toHaveBeenCalledWith('game-1')
  })

  it('提交时找不到引擎会提示错误且保持弹窗打开', async () => {
    const open = ref(true)
    const form = useCreateGameForm({ open })

    formValues.gameName = 'Demo'
    formValues.gamePath = '/games/Demo'
    formValues.gameEngine = 'missing-engine'

    await form.onSubmit()

    expect(createGameMock).not.toHaveBeenCalled()
    expect(notifyErrorMock).toHaveBeenCalledWith('home.engines.noEngineContent')
    expect(open.value).toBe(true)
  })

  it('创建游戏失败时会提示错误且不会关闭弹窗', async () => {
    const open = ref(true)
    const onSuccess = vi.fn()
    const form = useCreateGameForm({ open, onSuccess })

    createGameMock.mockRejectedValue(new Error('create failed'))
    formValues.gameName = 'Demo'
    formValues.gamePath = '/games/Demo'
    formValues.gameEngine = 'engine-1'

    await form.onSubmit()

    expect(notifyErrorMock).toHaveBeenCalledWith('create failed')
    expect(open.value).toBe(true)
    expect(onSuccess).not.toHaveBeenCalled()
  })

  it('游戏名称不能为空', async () => {
    const open = ref(true)

    useCreateGameForm({ open })

    const schema = useFormMock.mock.calls[0]?.[0]?.validationSchema
    const result = await schema?.safeParseAsync({
      gameName: '',
      gamePath: '/games/Demo',
      gameEngine: 'engine-1',
    })

    expect(result?.success).toBe(false)
    if (result?.success === false) {
      expect(result.error.issues[0]?.message).toBe('modals.createGame.gameNameRequired')
    }
  })
})
