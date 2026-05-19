import { afterEach, describe, expect, it, vi } from 'vitest'
import { createSSRApp, defineComponent, h, nextTick, ref, shallowRef } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { commandType } from 'webgal-parser/src/interface/sceneInterface'

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

import { AbsPath } from '~/domain/path'
import { useCommandPanelBridgeProvider, useSidebarPanelProvider } from '~/features/editor/shared/useEditorPanelBindings'
import { useTextEditorBindings } from '~/features/editor/text-editor/useTextEditorBindings'

import type { CommandPanelHandler, SidebarPanelBinding } from '~/features/editor/shared/useEditorPanelBindings'
import type { TextProjectionState } from '~/stores/editor'

interface Harness {
  bindings: ReturnType<typeof useTextEditorBindings>
  editor: {
    executeEdits: ReturnType<typeof vi.fn>
    focus: ReturnType<typeof vi.fn>
    getModel: ReturnType<typeof vi.fn>
    getPosition: ReturnType<typeof vi.fn>
    revealPositionInCenterIfOutsideViewport: ReturnType<typeof vi.fn>
    setPosition: ReturnType<typeof vi.fn>
  }
  formPanel: {
    handleFormUpdate: ReturnType<typeof vi.fn>
  }
  readCommandPanelHandler: () => CommandPanelHandler | undefined
  readSidebarBinding: () => SidebarPanelBinding | undefined
}

function createTextState(textContent: string): TextProjectionState {
  return {
    path: AbsPath.from('/game/scene/example.txt'),
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
  const editor = {
    executeEdits: vi.fn(),
    focus: vi.fn(),
    getModel: vi.fn(),
    getPosition: vi.fn(),
    revealPositionInCenterIfOutsideViewport: vi.fn(),
    setPosition: vi.fn(),
  }
  const model = {
    getLineContent: vi.fn((lineNumber: number) => textContent.split('\n')[lineNumber - 1] ?? ''),
    getLineCount: vi.fn(() => textContent.split('\n').length),
    getLineMaxColumn: vi.fn((lineNumber: number) => (textContent.split('\n')[lineNumber - 1] ?? '').length + 1),
    getValueInRange: vi.fn(() => ''),
  }
  editor.getModel.mockReturnValue(model)
  editor.getPosition.mockReturnValue({ lineNumber: 2, column: 3 })

  let readSidebarBinding = () => undefined as SidebarPanelBinding | undefined
  let readCommandPanelHandler = () => undefined as CommandPanelHandler | undefined
  let bindings = undefined as ReturnType<typeof useTextEditorBindings> | undefined
  const formPanel = {
    handleFormUpdate: vi.fn(() => false),
  }

  const BindingConsumer = defineComponent({
    setup() {
      bindings = useTextEditorBindings({
        editorRef: shallowRef(editor as never),
        getState: () => state.value,
        isCurrentTextProjectionActive: () => true,
        formPanel,
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
      const commandPanel = useCommandPanelBridgeProvider()

      readSidebarBinding = () => sidebarPanel.activeBinding.value
      readCommandPanelHandler = () => commandPanel.activeBinding.value
      return () => h(BindingConsumer)
    },
  }))

  await renderToString(app)
  await nextTick()

  const harness: Harness = {
    bindings: bindings!,
    editor,
    formPanel,
    readCommandPanelHandler,
    readSidebarBinding,
  }

  return harness
}

async function flushBindingUpdates() {
  await nextTick()
  await Promise.resolve()
}

describe('useTextEditorBindings', () => {
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

  it('命令面板插入单条命令后会把光标移动到插入文本末尾', async () => {
    getSceneSelectionMock.mockReturnValue(undefined)
    useEditSettingsStoreMock.mockReturnValue({
      commandInsertPosition: 'cursor',
    })
    useCommandPanelStoreMock.mockReturnValue({
      getInsertText: vi.fn(() => 'changeBg:room.png;'),
    })

    const harness = await mountHarness('say:hello;\nold line')
    await flushBindingUpdates()

    harness.readCommandPanelHandler()?.insertCommand(commandType.say)

    expect(harness.editor.executeEdits).toHaveBeenCalledWith('command-panel', [{
      range: {
        startLineNumber: 2,
        startColumn: 9,
        endLineNumber: 2,
        endColumn: 9,
      },
      text: '\nchangeBg:room.png;',
      forceMoveMarkers: true,
    }])
    expect(harness.editor.setPosition).toHaveBeenCalledWith({ lineNumber: 3, column: 19 })
    expect(harness.editor.revealPositionInCenterIfOutsideViewport).toHaveBeenCalledWith({ lineNumber: 3, column: 19 })
  })

  it('插入命令组后会把光标移动到最后一行末尾', async () => {
    getSceneSelectionMock.mockReturnValue(undefined)
    useEditSettingsStoreMock.mockReturnValue({
      commandInsertPosition: 'cursor',
    })
    useCommandPanelStoreMock.mockReturnValue({
      getInsertText: vi.fn(),
    })

    const harness = await mountHarness('say:hello;\nold line')
    await flushBindingUpdates()

    harness.readCommandPanelHandler()?.insertGroup({
      id: 'group-1',
      name: 'scene setup',
      rawTexts: ['changeBg:room.png;', 'playBgm:bgm.ogg;'],
      createdAt: 1,
    })

    expect(harness.editor.executeEdits).toHaveBeenCalledWith('command-panel', [{
      range: {
        startLineNumber: 2,
        startColumn: 9,
        endLineNumber: 2,
        endColumn: 9,
      },
      text: '\nchangeBg:room.png;\nplayBgm:bgm.ogg;',
      forceMoveMarkers: true,
    }])
    expect(harness.editor.setPosition).toHaveBeenCalledWith({ lineNumber: 4, column: 17 })
    expect(harness.editor.revealPositionInCenterIfOutsideViewport).toHaveBeenCalledWith({ lineNumber: 4, column: 17 })
  })

  it('程序化语句更新会保留指定事务来源', async () => {
    getSceneSelectionMock.mockReturnValue(undefined)
    useEditSettingsStoreMock.mockReturnValue({
      commandInsertPosition: 'cursor',
    })
    useCommandPanelStoreMock.mockReturnValue({
      getInsertText: vi.fn(),
    })

    const harness = await mountHarness('say:hello;')
    await flushBindingUpdates()

    harness.formPanel.handleFormUpdate.mockReturnValue(true)
    expect(harness.bindings.applyProgrammaticStatementUpdate({
      target: {
        kind: 'line',
        lineNumber: 1,
      },
      rawText: 'say:world;',
      parsed: {} as never,
    }, 'external')).toBe(true)

    expect(harness.bindings.consumePendingTextTransactionSource()).toBe('external')
  })
})
