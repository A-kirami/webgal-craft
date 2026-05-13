import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, reactive } from 'vue'

import { createBrowserTextStub, renderInBrowser } from '~/__tests__/browser-render'

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

const globalStubs = {
  EditHeader: createBrowserTextStub('StubEditHeader', 'Edit Header'),
  EditorPanel: createBrowserTextStub('StubEditorPanel', 'Editor Panel'),
  EditorStatusBar: createBrowserTextStub('StubEditorStatusBar', 'Editor Status Bar'),
  LeftPanel: createBrowserTextStub('StubLeftPanel', 'Left Panel'),
  ResizableHandle: createBrowserTextStub('StubResizableHandle', 'Resizable Handle'),
  ResizablePanel: createBrowserTextStub('StubResizablePanel', 'Resizable Panel'),
  ResizablePanelGroup: createBrowserTextStub('StubResizablePanelGroup', 'Resizable Panel Group'),
}

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
    document.body.innerHTML = ''
  })

  it('会在编辑页壳层启动资源索引 bootstrap', async () => {
    const view = await import('./[gameId].vue')

    renderInBrowser(view.default, {
      global: {
        stubs: globalStubs,
      },
    })

    await nextTick()

    expect(useResourceIndexBootstrapMock).toHaveBeenCalledOnce()
  })
})
