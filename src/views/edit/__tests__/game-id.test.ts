import '~/__tests__/setup'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSSRApp, reactive } from 'vue'
import { renderToString } from 'vue/server-renderer'

import { createTestGame } from '~/__tests__/factories'
import { AppError } from '~/types/errors'

const {
  createEditorShortcutDefinitionsMock,
  ensureEditorRuntimeCompatibleMock,
  modalOpenMock,
  requestGameRuntimeRebindMock,
  routerReplaceMock,
  useAnimationTableSyncBootstrapMock,
  useEditorStoreMock,
  useFileStoreMock,
  useModalStoreMock,
  usePreferenceStoreMock,
  useResourceIndexMock,
  useResourceIndexBootstrapMock,
  useShortcutContextMock,
  useShortcutDispatcherMock,
  useWorkspaceStoreMock,
} = vi.hoisted(() => ({
  createEditorShortcutDefinitionsMock: vi.fn(() => []),
  ensureEditorRuntimeCompatibleMock: vi.fn(),
  modalOpenMock: vi.fn(),
  requestGameRuntimeRebindMock: vi.fn(),
  routerReplaceMock: vi.fn(),
  useAnimationTableSyncBootstrapMock: vi.fn(),
  useEditorStoreMock: vi.fn(),
  useFileStoreMock: vi.fn(),
  useModalStoreMock: vi.fn(),
  usePreferenceStoreMock: vi.fn(),
  useResourceIndexMock: vi.fn(),
  useResourceIndexBootstrapMock: vi.fn(),
  useShortcutContextMock: vi.fn(),
  useShortcutDispatcherMock: vi.fn(),
  useWorkspaceStoreMock: vi.fn(),
}))

vi.mock('~/components/ui/resizable', () => ({
  ResizablePanel: {
    name: 'StubResizablePanel',
    setup() {
      return () => undefined
    },
  },
}))

vi.mock('~/components/editor/EditHeader.vue', () => ({
  default: {
    name: 'StubEditHeader',
    setup() {
      return () => undefined
    },
  },
}))

vi.mock('~/components/editor/EditorPanel.vue', () => ({
  default: {
    name: 'StubEditorPanel',
    setup() {
      return () => undefined
    },
  },
}))

vi.mock('~/components/editor/EditorStatusBar.vue', () => ({
  default: {
    name: 'StubEditorStatusBar',
    setup() {
      return () => undefined
    },
  },
}))

vi.mock('~/components/editor/LeftPanel.vue', () => ({
  default: {
    name: 'StubLeftPanel',
    setup() {
      return () => undefined
    },
  },
}))

vi.mock('~/components/ui/resizable/ResizableHandle.vue', () => ({
  default: {
    name: 'StubResizableHandle',
    setup() {
      return () => undefined
    },
  },
}))

vi.mock('~/components/ui/resizable/ResizablePanelGroup.vue', () => ({
  default: {
    name: 'StubResizablePanelGroup',
    setup() {
      return () => undefined
    },
  },
}))

vi.mock('~/features/editor/animation/useAnimationTableSyncBootstrap', () => ({
  useAnimationTableSyncBootstrap: useAnimationTableSyncBootstrapMock,
}))

vi.mock('~/features/editor/shortcut/definitions', () => ({
  createEditorShortcutDefinitions: createEditorShortcutDefinitionsMock,
}))

vi.mock('~/features/editor/shortcut/useShortcutContext', () => ({
  useShortcutContext: useShortcutContextMock,
}))

vi.mock('~/features/editor/shortcut/useShortcutDispatcher', () => ({
  shortcutDispatcherRegistryKey: Symbol('shortcut-dispatcher-registry'),
  useShortcutDispatcher: useShortcutDispatcherMock,
}))

vi.mock('~/services/resource-index/service', () => ({
  useResourceIndex: useResourceIndexMock,
  useResourceIndexBootstrap: useResourceIndexBootstrapMock,
}))

vi.mock('~/services/game-manager', () => ({
  gameManager: {
    ensureEditorRuntimeCompatible: ensureEditorRuntimeCompatibleMock,
  },
}))

vi.mock('@tauri-apps/plugin-log', () => ({
  warn: vi.fn(),
}))

vi.mock('~/features/modals/import-dependency-resolution/request-game-runtime-rebind', () => ({
  requestGameRuntimeRebind: requestGameRuntimeRebindMock,
  resolveRuntimeRebindIssue: () => ({
    compatibilityIssue: 'versionTooOld',
    reason: 'incompatible',
  }),
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({
    replace: routerReplaceMock,
  }),
}))

vi.mock('~/stores/editor', () => ({
  isEditableEditor: (state: { projection?: string } | undefined) => !!state?.projection,
  useEditorStore: useEditorStoreMock,
}))

vi.mock('~/stores/file', () => ({
  useFileStore: useFileStoreMock,
}))

vi.mock('~/stores/modal', () => ({
  useModalStore: useModalStoreMock,
}))

vi.mock('~/stores/preference', () => ({
  usePreferenceStore: usePreferenceStoreMock,
}))

vi.mock('~/stores/workspace', () => ({
  useWorkspaceStore: useWorkspaceStoreMock,
}))

const mountedApps: { unmount: () => void }[] = []

describe('edit/[gameId]', () => {
  beforeEach(() => {
    useAnimationTableSyncBootstrapMock.mockReset()
    useEditorStoreMock.mockReset()
    useFileStoreMock.mockReset()
    useModalStoreMock.mockReset()
    usePreferenceStoreMock.mockReset()
    useResourceIndexMock.mockReset()
    useResourceIndexBootstrapMock.mockReset()
    useShortcutContextMock.mockReset()
    useShortcutDispatcherMock.mockReset()
    useWorkspaceStoreMock.mockReset()
    createEditorShortcutDefinitionsMock.mockReset()
    createEditorShortcutDefinitionsMock.mockReturnValue([])
    ensureEditorRuntimeCompatibleMock.mockResolvedValue(undefined)
    modalOpenMock.mockReset()
    requestGameRuntimeRebindMock.mockResolvedValue(false)
    routerReplaceMock.mockReset()
    routerReplaceMock.mockResolvedValue(undefined)

    useEditorStoreMock.mockReturnValue(reactive({
      currentSelectedSceneStatement: undefined,
      currentState: undefined,
      currentVisualProjection: undefined,
      isCurrentSceneFile: false,
      saveFile: vi.fn(),
      switchEditorMode: vi.fn(),
    }))
    useFileStoreMock.mockReturnValue(undefined)
    useModalStoreMock.mockReturnValue(reactive({
      modalStack: reactive(new Map()),
      open: modalOpenMock,
    }))
    usePreferenceStoreMock.mockReturnValue(reactive({
      leftPanelView: 'scene',
      showPreviewPanel: true,
      showSidebar: true,
    }))
    useResourceIndexMock.mockReturnValue({
      findMissingReferences: vi.fn(() => []),
      getReferencesFrom: vi.fn(() => []),
      getReferencesTo: vi.fn(() => []),
      hasAssetKey: vi.fn(() => false),
      listByAssetType: vi.fn(() => []),
      resolveByAbsolutePath: vi.fn(() => undefined),
      status: reactive({ value: 'ready' }),
    })
    useWorkspaceStoreMock.mockReturnValue(reactive({
      currentGame: undefined,
      ensureCurrentGameAvailable: vi.fn(async () => true),
    }))
  })

  afterEach(() => {
    while (mountedApps.length > 0) {
      mountedApps.pop()?.unmount()
    }
  })

  it('会在编辑页壳层启动资源索引 bootstrap', async () => {
    const view = await import('../[gameId].vue')
    const app = createSSRApp(view.default)

    await renderToString(app)
    mountedApps.push(app)

    expect(useResourceIndexBootstrapMock).toHaveBeenCalledOnce()
  })

  it('当前游戏运行时不兼容时请求依赖重选重绑引擎，而不是打开切换引擎弹窗', async () => {
    const currentGame = createTestGame({ id: 'game-old-engine', engineId: 'engine-old' })
    ensureEditorRuntimeCompatibleMock.mockRejectedValue(new AppError('ENGINE_EDITOR_INCOMPATIBLE', '引擎版本过低', {
      details: {
        issue: 'versionTooOld',
        reason: 'ENGINE_EDITOR_INCOMPATIBLE',
      },
    }))
    useWorkspaceStoreMock.mockReturnValue(reactive({
      currentGame,
      ensureCurrentGameAvailable: vi.fn(async () => true),
    }))

    const view = await import('../[gameId].vue')
    const app = createSSRApp(view.default)

    await renderToString(app)
    mountedApps.push(app)

    await vi.waitFor(() => {
      expect(requestGameRuntimeRebindMock).toHaveBeenCalledWith(currentGame, expect.objectContaining({
        compatibilityIssue: 'versionTooOld',
        reason: 'incompatible',
        resolveDependencies: expect.any(Function),
      }))
    })
    expect(modalOpenMock).not.toHaveBeenCalledWith('SwitchEngineModal', expect.anything(), expect.anything(), expect.anything())
    expect(modalOpenMock).not.toHaveBeenCalledWith('RecoverGameModal', expect.anything(), expect.anything(), expect.anything())
  })

  it('当前游戏运行时不兼容且用户取消重绑时会离开编辑页', async () => {
    const currentGame = createTestGame({ id: 'game-old-engine', engineId: 'engine-old' })
    ensureEditorRuntimeCompatibleMock.mockRejectedValue(new AppError('ENGINE_EDITOR_INCOMPATIBLE', '引擎版本过低', {
      details: {
        issue: 'versionTooOld',
        reason: 'ENGINE_EDITOR_INCOMPATIBLE',
      },
    }))
    requestGameRuntimeRebindMock.mockImplementation(async (_game, options) => {
      const result = await options.resolveDependencies?.({
        purpose: 'runtimeRebind',
        source: 'configured',
        engine: {
          reason: 'incompatible',
        },
      })
      return Boolean(result?.engineId)
    })
    useWorkspaceStoreMock.mockReturnValue(reactive({
      currentGame,
      ensureCurrentGameAvailable: vi.fn(async () => true),
    }))

    const view = await import('../[gameId].vue')
    const app = createSSRApp(view.default)

    await renderToString(app)
    mountedApps.push(app)

    await vi.waitFor(() => {
      expect(modalOpenMock).toHaveBeenCalledWith(
        'GameDependencyResolutionModal',
        expect.objectContaining({
          onCancel: expect.any(Function),
        }),
        expect.any(String),
      )
    })
    const [, props] = modalOpenMock.mock.calls.find(([modal]) => modal === 'GameDependencyResolutionModal')!
    props.onCancel()

    await vi.waitFor(() => {
      expect(routerReplaceMock).toHaveBeenCalledWith('/')
    })
    expect(routerReplaceMock).toHaveBeenCalledOnce()
  })

  it('当前游戏运行时不兼容且重绑失败时会离开编辑页', async () => {
    const currentGame = createTestGame({ id: 'game-old-engine', engineId: 'engine-old' })
    ensureEditorRuntimeCompatibleMock.mockRejectedValue(new AppError('ENGINE_EDITOR_INCOMPATIBLE', '引擎版本过低', {
      details: {
        issue: 'versionTooOld',
        reason: 'ENGINE_EDITOR_INCOMPATIBLE',
      },
    }))
    requestGameRuntimeRebindMock.mockRejectedValue(new AppError('IO_ERROR', '重绑失败'))
    useWorkspaceStoreMock.mockReturnValue(reactive({
      currentGame,
      ensureCurrentGameAvailable: vi.fn(async () => true),
    }))

    const view = await import('../[gameId].vue')
    const app = createSSRApp(view.default)

    await renderToString(app)
    mountedApps.push(app)

    await vi.waitFor(() => {
      expect(routerReplaceMock).toHaveBeenCalledWith('/')
    })
  })
})
