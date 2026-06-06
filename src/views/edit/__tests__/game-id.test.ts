import '~/__tests__/setup'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSSRApp, reactive } from 'vue'
import { renderToString } from 'vue/server-renderer'

const {
  createEditorShortcutDefinitionsMock,
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
})
