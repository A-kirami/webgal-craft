import { afterEach, describe, expect, it, vi } from 'vitest'
import { createSSRApp, defineComponent, h, nextTick, ref, shallowRef } from 'vue'
import { renderToString } from 'vue/server-renderer'

const {
  getSceneSelectionMock,
  useEditSettingsStoreMock,
  useCommandPanelStoreMock,
} = vi.hoisted(() => ({
  getSceneSelectionMock: vi.fn(),
  useEditSettingsStoreMock: vi.fn(),
  useCommandPanelStoreMock: vi.fn(),
}))

vi.mock('~/stores/editor', () => ({
  useEditorStore: () => ({
    getSceneSelection: getSceneSelectionMock,
  }),
}))

vi.mock('~/stores/edit-settings', () => ({
  useEditSettingsStore: useEditSettingsStoreMock,
}))

vi.mock('~/stores/command-panel', () => ({
  useCommandPanelStore: useCommandPanelStoreMock,
}))

import { useCommandPanelBridgeProvider, useSidebarPanelProvider } from '~/features/editor/shared/useEditorPanelBindings'
import { useTextEditorBindings } from '~/features/editor/text-editor/useTextEditorBindings'

import type { SidebarPanelBinding } from '~/features/editor/shared/useEditorPanelBindings'
import type { TextProjectionState } from '~/stores/editor'

interface Harness {
  bindings: ReturnType<typeof useTextEditorBindings>
  readSidebarBinding: () => SidebarPanelBinding | undefined
}

function createTextState(textContent: string): TextProjectionState {
  return {
    path: '/game/scene/example.txt',
    isDirty: false,
    projection: 'text',
    kind: 'scene',
    textContent,
    textSource: 'projection',
    syncError: undefined,
  }
}

async function mountHarness(textContent: string): Promise<Harness> {
  const state = ref(createTextState(textContent))
  let readSidebarBinding = () => undefined as SidebarPanelBinding | undefined
  let bindings = undefined as ReturnType<typeof useTextEditorBindings> | undefined

  const BindingConsumer = defineComponent({
    setup() {
      bindings = useTextEditorBindings({
        editorRef: shallowRef(),
        getState: () => state.value,
        isCurrentTextProjectionActive: () => true,
        formPanel: {
          handleFormUpdate: vi.fn(() => false),
        },
        textEditorHistory: {
          captureBeforeContentChange: vi.fn(),
          handleRedo: vi.fn(),
          handleUndo: vi.fn(),
        } as never,
      })

      return () => h('div')
    },
  })

  const app = createSSRApp(defineComponent({
    setup() {
      const sidebarPanel = useSidebarPanelProvider()
      useCommandPanelBridgeProvider()

      readSidebarBinding = () => sidebarPanel.activeBinding.value
      return () => h(BindingConsumer)
    },
  }))

  await renderToString(app)

  const harness: Harness = {
    bindings: bindings!,
    readSidebarBinding,
  }

  return harness
}

async function flushBindingUpdates() {
  await nextTick()
  await Promise.resolve()
}

describe('useTextEditorBindings 行为', () => {
  afterEach(() => {
    getSceneSelectionMock.mockReset()
    useEditSettingsStoreMock.mockReset()
    useCommandPanelStoreMock.mockReset()
  })

  it('文本模式辅助面板直接从文本投影构建当前语句快照', async () => {
    getSceneSelectionMock.mockReturnValue({
      lastLineNumber: 2,
      selectedStatementId: 2,
    })
    useEditSettingsStoreMock.mockReturnValue({
      commandInsertPosition: 'cursor',
    })
    useCommandPanelStoreMock.mockReturnValue({
      getInsertText: vi.fn(),
    })

    const harness = await mountHarness('Alice:第一句;\n接续第二句;')
    await flushBindingUpdates()

    const binding = harness.readSidebarBinding()
    expect(binding?.getEntry()).toMatchObject({
      id: 2,
      rawText: '接续第二句;',
    })
    expect(binding?.getPreviousSpeaker?.()).toBe('Alice')
    expect(binding?.getUpdateTarget?.()).toEqual({
      kind: 'line',
      lineNumber: 2,
    })
  })

  it('跨行选区时暂停单语句侧边栏绑定', async () => {
    getSceneSelectionMock.mockReturnValue({
      lastLineNumber: 2,
      selectedStatementId: 2,
    })
    useEditSettingsStoreMock.mockReturnValue({
      commandInsertPosition: 'cursor',
    })
    useCommandPanelStoreMock.mockReturnValue({
      getInsertText: vi.fn(),
    })

    const harness = await mountHarness('Alice:第一句;\n接续第二句;\nBob:第三句;')
    await flushBindingUpdates()

    harness.bindings.handleCursorSelectionChange({
      selection: {
        startLineNumber: 2,
        endLineNumber: 3,
      },
    } as never)
    await flushBindingUpdates()

    const binding = harness.readSidebarBinding()
    expect(binding?.getEntry()).toBeUndefined()
    expect(binding?.getUpdateTarget?.()).toBeUndefined()
    expect(binding?.getEmptyState?.()).toBe('multiple-edit-targets')
  })

  it('存在多个光标时暂停单语句侧边栏绑定', async () => {
    getSceneSelectionMock.mockReturnValue({
      lastLineNumber: 2,
      selectedStatementId: 2,
    })
    useEditSettingsStoreMock.mockReturnValue({
      commandInsertPosition: 'cursor',
    })
    useCommandPanelStoreMock.mockReturnValue({
      getInsertText: vi.fn(),
    })

    const harness = await mountHarness('Alice:第一句;\n接续第二句;\nBob:第三句;')
    await flushBindingUpdates()

    harness.bindings.handleCursorSelectionChange({
      selection: {
        startLineNumber: 2,
        endLineNumber: 2,
      },
      secondarySelections: [{
        startLineNumber: 3,
        endLineNumber: 3,
      }],
    } as never)
    await flushBindingUpdates()

    const binding = harness.readSidebarBinding()
    expect(binding?.getEntry()).toBeUndefined()
    expect(binding?.getUpdateTarget?.()).toBeUndefined()
    expect(binding?.getEmptyState?.()).toBe('multiple-edit-targets')
  })

  it('从多目标选区恢复为单行单光标后会恢复单语句侧边栏绑定', async () => {
    getSceneSelectionMock.mockReturnValue({
      lastLineNumber: 2,
      selectedStatementId: 2,
    })
    useEditSettingsStoreMock.mockReturnValue({
      commandInsertPosition: 'cursor',
    })
    useCommandPanelStoreMock.mockReturnValue({
      getInsertText: vi.fn(),
    })

    const harness = await mountHarness('Alice:第一句;\n接续第二句;\nBob:第三句;')
    await flushBindingUpdates()

    harness.bindings.handleCursorSelectionChange({
      selection: {
        startLineNumber: 2,
        endLineNumber: 3,
      },
    } as never)
    await flushBindingUpdates()

    harness.bindings.handleCursorSelectionChange({
      selection: {
        startLineNumber: 2,
        endLineNumber: 2,
      },
      secondarySelections: [],
    } as never)
    await flushBindingUpdates()

    const binding = harness.readSidebarBinding()
    expect(binding?.getEntry()).toBeDefined()
    expect(binding?.getUpdateTarget?.()).toBeDefined()
    expect(binding?.getEmptyState?.()).not.toBe('multiple-edit-targets')
  })
})
