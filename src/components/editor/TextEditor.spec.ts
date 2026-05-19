import * as monaco from 'monaco-editor'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, reactive, shallowRef } from 'vue'

import { createBrowserLiteI18n } from '~/__tests__/browser'
import { renderInBrowser } from '~/__tests__/browser-render'
import { monacoMockState, resetMonacoMockState } from '~/__tests__/mocks/monaco'
import { AbsPath } from '~/domain/path'
import {
  PLAY_TO_LINE_DISABLED_GLYPH_CLASS_NAME,
  PLAY_TO_LINE_GLYPH_CLASS_NAME,
} from '~/features/editor/text-editor/text-editor-play-to-line'

vi.mock('monaco-editor', async () => {
  const { createMonacoMockModule } = await import('~/__tests__/mocks/monaco')
  return createMonacoMockModule()
})

const {
  ensureModelMock,
  handleBeforeUnmountMock,
  runtimeReturnValue,
  useEditSettingsStoreMock,
  useEditorStoreMock,
  useDragSessionMock,
  useDroppableRegistryMock,
  useTextEditorRuntimeMock,
  useTabsStoreMock,
} = vi.hoisted(() => {
  const ensureModelMock = vi.fn()
  const handleBeforeUnmountMock = vi.fn()
  const runtimeReturnValue = {
    canHandleFileDrop: vi.fn(() => true),
    clearFileDropHover: vi.fn(),
    currentEditorLanguage: { value: 'webgalscript' },
    ensureModel: ensureModelMock,
    handleBeforeUnmount: handleBeforeUnmountMock,
    handleContentChange: vi.fn(),
    handleCursorPositionChange: vi.fn(),
    handleCursorSelectionChange: vi.fn(),
    handleEditorClick: vi.fn(),
    handleEditorCreated: vi.fn(),
    handleFileDrop: vi.fn(),
    handleScrollChange: vi.fn(),
    syncFileDropHover: vi.fn(),
  }

  return {
    ensureModelMock,
    handleBeforeUnmountMock,
    runtimeReturnValue,
    useDragSessionMock: vi.fn(),
    useDroppableRegistryMock: vi.fn(),
    useEditSettingsStoreMock: vi.fn(),
    useEditorStoreMock: vi.fn(),
    useTextEditorRuntimeMock: vi.fn(() => runtimeReturnValue),
    useTabsStoreMock: vi.fn(),
  }
})

vi.mock('~/features/editor/text-editor/useTextEditorRuntime', () => ({
  useTextEditorRuntime: useTextEditorRuntimeMock,
}))

vi.mock('~/composables/useDragSession', () => ({
  useDragSession: useDragSessionMock,
}))

vi.mock('~/composables/useDroppableRegistry', () => ({
  useDroppableRegistry: useDroppableRegistryMock,
}))

vi.mock('~/plugins/editor', () => ({
  BASE_EDITOR_OPTIONS: {
    minimap: {
      enabled: true,
    },
    smoothScrolling: true,
  },
  THEME_DARK: 'webgal-dark',
  THEME_LIGHT: 'webgal-light',
}))

vi.mock('~/stores/edit-settings', () => ({
  useEditSettingsStore: useEditSettingsStoreMock,
}))

vi.mock('~/stores/editor', () => ({
  isEditableEditor: (state: { projection?: string }) => 'projection' in state,
  useEditorStore: useEditorStoreMock,
}))

vi.mock('~/stores/tabs', () => ({
  useTabsStore: useTabsStoreMock,
}))

vi.mock('~/composables/color-mode', () => ({
  colorMode: {
    value: 'light',
  },
}))

import TextEditor from './TextEditor.vue'

import type { TextProjectionState } from '~/stores/editor'

interface EditorStoreMock {
  currentState?: {
    path: AbsPath
    projection: 'text' | 'visual'
  }
  syncScenePreview?: ReturnType<typeof vi.fn>
}

interface TabsStoreMock {
  activeTab?: {
    path: AbsPath
  }
}

interface EditSettingsStoreMock {
  fontFamily: string
  fontSize: number
  minimap: boolean
  wordWrap: boolean
}

function createTextState(path: string = '/project/scene-1.txt'): TextProjectionState {
  return {
    isDirty: false,
    kind: 'scene',
    path: AbsPath.from(path),
    projection: 'text',
    textContent: 'say:hello',
    textSource: 'projection',
  }
}

function createMonacoModel(lines: string[]) {
  return {
    getLineContent(lineNumber: number) {
      return lines[lineNumber - 1] ?? ''
    },
    getLineCount() {
      return lines.length
    },
  }
}

function createTextEditorLiteI18n() {
  return createBrowserLiteI18n({
    locale: 'zh-Hans',
    messages: {
      'zh-Hans': {
        edit: {
          visualEditor: {
            playToLine: 'play-to-line',
          },
        },
      },
    },
  })
}

function renderTextEditor(state: TextProjectionState) {
  return renderInBrowser(TextEditor, {
    props: {
      state,
    },
    global: {
      plugins: [createTextEditorLiteI18n()],
    },
  })
}

function createHarness(path: string = '/project/scene-1.txt') {
  const editSettingsStore = reactive<EditSettingsStoreMock>({
    fontFamily: 'Fira Code',
    fontSize: 16,
    minimap: true,
    wordWrap: false,
  })
  const absPath = AbsPath.from(path)
  const editorStore = reactive<EditorStoreMock>({
    currentState: {
      path: absPath,
      projection: 'text',
    },
    syncScenePreview: vi.fn(),
  })
  const tabsStore = reactive<TabsStoreMock>({
    activeTab: {
      path: absPath,
    },
  })

  useEditSettingsStoreMock.mockReturnValue(editSettingsStore)
  useEditorStoreMock.mockReturnValue(editorStore)
  useTabsStoreMock.mockReturnValue(tabsStore)

  return {
    editSettingsStore,
    editorStore,
    state: createTextState(path),
    tabsStore,
  }
}

describe('TextEditor', () => {
  beforeEach(() => {
    resetMonacoMockState()
    ensureModelMock.mockReset()
    handleBeforeUnmountMock.mockReset()
    runtimeReturnValue.canHandleFileDrop.mockReset()
    runtimeReturnValue.clearFileDropHover.mockReset()
    runtimeReturnValue.handleContentChange.mockReset()
    runtimeReturnValue.handleCursorPositionChange.mockReset()
    runtimeReturnValue.handleCursorSelectionChange.mockReset()
    runtimeReturnValue.handleEditorClick.mockReset()
    runtimeReturnValue.handleEditorCreated.mockReset()
    runtimeReturnValue.handleFileDrop.mockReset()
    runtimeReturnValue.handleScrollChange.mockReset()
    runtimeReturnValue.syncFileDropHover.mockReset()
    runtimeReturnValue.canHandleFileDrop.mockReturnValue(true)
    useEditSettingsStoreMock.mockReset()
    useEditorStoreMock.mockReset()
    useDragSessionMock.mockReset()
    useDroppableRegistryMock.mockReset()
    useTabsStoreMock.mockReset()
    useTextEditorRuntimeMock.mockClear()

    ensureModelMock.mockReturnValue({
      id: 'model-1',
    })
    useDragSessionMock.mockReturnValue({
      state: shallowRef({
        currentDropTarget: undefined,
        currentPosition: { x: 40, y: 20 },
        isActive: true,
        mode: 'transfer',
        payload: {
          source: 'file-viewer',
          type: 'file-system-item',
          path: '/games/demo/game/background/room.png',
          isDir: false,
        },
        startPosition: { x: 40, y: 20 },
        transferOperation: 'copy',
      }),
    })
    useDroppableRegistryMock.mockReturnValue({
      clearHover: vi.fn(),
      drop: vi.fn(),
      getMatchAt: vi.fn(),
      hoveredTarget: shallowRef(),
      isDropAllowed: shallowRef(false),
      registerDroppable: vi.fn(),
      unregisterDroppable: vi.fn(),
      updateHover: vi.fn(),
    })
  })

  it('激活的文本投影挂载时会创建 Monaco 编辑器', async () => {
    const { state } = createHarness()
    const result = renderTextEditor(state)

    await nextTick()

    expect(useTextEditorRuntimeMock).toHaveBeenCalledTimes(1)
    expect(ensureModelMock).toHaveBeenCalledTimes(1)
    expect(monacoMockState.create).toHaveBeenCalledTimes(1)

    const [container, options] = monacoMockState.create.mock.calls[0]
    expect(container).toBeInstanceOf(HTMLElement)
    expect(options).toEqual(expect.objectContaining({
      automaticLayout: true,
      fontFamily: 'Fira Code',
      fontSize: 16,
      glyphMargin: true,
      lineNumbersMinChars: 3,
      minimap: {
        enabled: true,
      },
      model: {
        id: 'model-1',
      },
      theme: 'webgal-light',
      wordWrap: 'off',
    }))

    await result.unmount()
  })

  it('未激活时不会立即创建编辑器，激活后才会创建', async () => {
    const { editorStore, state, tabsStore } = createHarness('/project/scene-2.txt')
    editorStore.currentState = {
      path: AbsPath.from('/project/other.txt'),
      projection: 'text',
    }
    tabsStore.activeTab = {
      path: AbsPath.from('/project/other.txt'),
    }

    renderTextEditor(state)

    await nextTick()
    expect(monacoMockState.create).not.toHaveBeenCalled()

    editorStore.currentState = {
      path: AbsPath.from('/project/scene-2.txt'),
      projection: 'text',
    }
    tabsStore.activeTab = {
      path: AbsPath.from('/project/scene-2.txt'),
    }

    await nextTick()
    expect(monacoMockState.create).toHaveBeenCalledTimes(1)
  })

  it('编辑器设置变化后会把最新选项同步给现有 Monaco 实例', async () => {
    const { editSettingsStore, state } = createHarness('/project/scene-3.txt')

    renderTextEditor(state)

    await nextTick()

    editSettingsStore.fontSize = 20
    editSettingsStore.minimap = false
    editSettingsStore.wordWrap = true

    await nextTick()

    expect(monacoMockState.editorInstance.updateOptions).toHaveBeenCalledWith(expect.objectContaining({
      fontFamily: 'Fira Code',
      fontSize: 20,
      minimap: {
        enabled: false,
      },
      wordWrap: 'on',
    }))
  })

  it('卸载时会先通知 runtime，再释放 Monaco 实例', async () => {
    const { state } = createHarness('/project/scene-4.txt')

    const result = renderTextEditor(state)

    await nextTick()
    await result.unmount()

    expect(runtimeReturnValue.clearFileDropHover).toHaveBeenCalledTimes(1)
    expect(handleBeforeUnmountMock).toHaveBeenCalledTimes(1)
    expect(monacoMockState.editorInstance.dispose).toHaveBeenCalledTimes(1)
  })

  it('注册文本编辑器 drop target，并在 drop 时把 payload 与当前位置交给 runtime', async () => {
    const registerDroppable = vi.fn()
    const unregisterDroppable = vi.fn()
    const hoveredTarget = shallowRef<HTMLElement>()
    useDroppableRegistryMock.mockReturnValue({
      clearHover: vi.fn(),
      drop: vi.fn(),
      getMatchAt: vi.fn(),
      hoveredTarget,
      isDropAllowed: shallowRef(false),
      registerDroppable,
      unregisterDroppable,
      updateHover: vi.fn(),
    })
    useDragSessionMock.mockReturnValue({
      state: shallowRef({
        currentDropTarget: undefined,
        currentPosition: { x: 40, y: 20 },
        isActive: true,
        mode: 'transfer',
        payload: {
          source: 'file-viewer',
          type: 'file-system-item',
          path: '/games/demo/game/background/room.png',
          isDir: false,
        },
        startPosition: { x: 40, y: 20 },
        transferOperation: 'copy',
      }),
    })

    const { state } = createHarness()
    const result = renderTextEditor(state)
    await nextTick()

    const [, config] = registerDroppable.mock.calls[0]
    const payload = {
      source: 'file-viewer',
      type: 'file-system-item',
      path: '/games/demo/game/background/room.png',
      isDir: false,
    } as const

    config.onDragEnter(payload, document.createElement('div'))
    expect(runtimeReturnValue.syncFileDropHover).toHaveBeenCalledWith(payload, { x: 40, y: 20 })

    config.onDrop(payload, document.createElement('div'))
    expect(runtimeReturnValue.handleFileDrop).toHaveBeenCalledWith(payload, { x: 40, y: 20 })

    config.onDragLeave(payload, document.createElement('div'))
    expect(runtimeReturnValue.clearFileDropHover).toHaveBeenCalled()

    await result.unmount()
    expect(unregisterDroppable).toHaveBeenCalledTimes(1)
  })

  it('文件投放成功后会恢复 Monaco 焦点', async () => {
    const registerDroppable = vi.fn()
    useDroppableRegistryMock.mockReturnValue({
      clearHover: vi.fn(),
      drop: vi.fn(),
      getMatchAt: vi.fn(),
      hoveredTarget: shallowRef(),
      isDropAllowed: shallowRef(false),
      registerDroppable,
      unregisterDroppable: vi.fn(),
      updateHover: vi.fn(),
    })
    runtimeReturnValue.handleFileDrop.mockReturnValue(true)

    const { state } = createHarness('/project/scene-drop-focus.txt')
    renderTextEditor(state)
    await nextTick()

    const [, config] = registerDroppable.mock.calls[0]
    const payload = {
      source: 'file-viewer',
      type: 'file-system-item',
      path: '/games/demo/game/background/room.png',
      isDir: false,
    } as const

    config.onDrop(payload, document.createElement('div'))

    expect(monacoMockState.editorInstance.focus).toHaveBeenCalledTimes(1)
  })

  it('animation 文本状态会拒绝脚本文件投放', async () => {
    const registerDroppable = vi.fn()
    runtimeReturnValue.canHandleFileDrop.mockReturnValue(false)
    useDroppableRegistryMock.mockReturnValue({
      clearHover: vi.fn(),
      drop: vi.fn(),
      getMatchAt: vi.fn(),
      hoveredTarget: shallowRef(),
      isDropAllowed: shallowRef(false),
      registerDroppable,
      unregisterDroppable: vi.fn(),
      updateHover: vi.fn(),
    })
    const { state } = createHarness('/games/demo/game/animation/opening.json')
    state.kind = 'animation'
    state.textContent = '{}'

    renderTextEditor(state)
    await nextTick()

    const config = registerDroppable.mock.calls[0]?.[1]
    expect(config?.canDrop?.({
      source: 'file-viewer',
      type: 'file-system-item',
      path: '/games/demo/game/background/room.png',
      isDir: false,
    }, document.createElement('div'))).toBe(false)
  })

  it('非场景文件不会启用 glyph margin', async () => {
    const { state } = createHarness('/project/effect.anim')
    state.kind = 'animation'

    renderTextEditor(state)

    await nextTick()

    const [, options] = monacoMockState.create.mock.calls[0]
    expect(options).toEqual(expect.objectContaining({
      glyphMargin: false,
    }))
  })

  it('内容变化时会转发给 runtime，并尝试同步播放按钮状态', async () => {
    const { state } = createHarness('/project/scene-6a.txt')
    const lines = ['; comment']
    monacoMockState.editorInstance.getModel.mockReturnValue(createMonacoModel(lines))
    monacoMockState.editorInstance.getPosition.mockReturnValue({ lineNumber: 1 })

    renderTextEditor(state)

    await nextTick()

    expect(monacoMockState.editorInstance.deltaDecorations).not.toHaveBeenCalled()

    const handleContentChange = monacoMockState.editorInstance.onDidChangeModelContent.mock.calls[0]?.[0]

    expect(handleContentChange).toBeTypeOf('function')

    lines[0] = 'say:hello'
    handleContentChange?.({
      isFlush: false,
    })
    await Promise.resolve()
    await nextTick()

    expect(runtimeReturnValue.handleContentChange).toHaveBeenCalledTimes(1)
    expect(monacoMockState.editorInstance.deltaDecorations).toHaveBeenCalledTimes(1)
  })

  it('换行导致光标行延后更新时，播放按钮会跟随最终光标行', async () => {
    const { state } = createHarness('/project/scene-6b.txt')
    const lines = ['say:hello', 'say:world']
    let currentPosition = { lineNumber: 1 }
    monacoMockState.editorInstance.getModel.mockReturnValue(createMonacoModel(lines))
    monacoMockState.editorInstance.getPosition.mockImplementation(() => currentPosition)

    renderTextEditor(state)

    await nextTick()
    monacoMockState.editorInstance.deltaDecorations.mockClear()

    const handleContentChange = monacoMockState.editorInstance.onDidChangeModelContent.mock.calls[0]?.[0]

    expect(handleContentChange).toBeTypeOf('function')

    handleContentChange?.({
      isFlush: false,
    })

    currentPosition = { lineNumber: 2 }
    await Promise.resolve()
    await nextTick()

    expect(monacoMockState.editorInstance.deltaDecorations).toHaveBeenCalledTimes(1)
    const [, nextDecorations] = monacoMockState.editorInstance.deltaDecorations.mock.calls[0] ?? []

    expect(nextDecorations).toEqual([
      expect.objectContaining({
        range: expect.objectContaining({
          endLineNumber: 2,
          startLineNumber: 2,
        }),
      }),
    ])
  })

  it('鼠标按下编辑器时会通知 runtime 处理点击', async () => {
    const { state } = createHarness('/project/scene-7.txt')
    monacoMockState.editorInstance.getModel.mockReturnValue(createMonacoModel(['say:hello']))
    monacoMockState.editorInstance.getPosition.mockReturnValue({ lineNumber: 1 })

    renderTextEditor(state)

    await nextTick()

    const handleMouseDown = monacoMockState.editorInstance.onMouseDown.mock.calls[0]?.[0]

    expect(handleMouseDown).toBeTypeOf('function')

    handleMouseDown?.({
      event: {
        leftButton: false,
      },
      target: {
        position: {
          lineNumber: 1,
        },
        type: monaco.editor.MouseTargetType.CONTENT_TEXT,
      },
    })

    expect(runtimeReturnValue.handleEditorClick).toHaveBeenCalledTimes(1)
  })

  it('左键点击 glyph margin 时会同步播放到当前行', async () => {
    const { editorStore, state } = createHarness('/project/scene-8.txt')
    monacoMockState.editorInstance.getModel.mockReturnValue(createMonacoModel(['say:hello']))
    monacoMockState.editorInstance.getPosition.mockReturnValue({ lineNumber: 1 })

    renderTextEditor(state)

    await nextTick()

    const handleMouseDown = monacoMockState.editorInstance.onMouseDown.mock.calls[0]?.[0]

    expect(handleMouseDown).toBeTypeOf('function')

    handleMouseDown?.({
      event: {
        leftButton: true,
      },
      target: {
        position: {
          lineNumber: 1,
        },
        type: monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN,
      },
    })

    expect(editorStore.syncScenePreview).toHaveBeenCalledTimes(1)
    expect(editorStore.syncScenePreview).toHaveBeenCalledWith('/project/scene-8.txt', 1, 'say:hello', true)
  })

  it('dirty 场景下 glyph margin 会展示禁用样式且不会触发播放', async () => {
    const { editorStore, state } = createHarness('/project/scene-8b.txt')
    state.isDirty = true
    monacoMockState.editorInstance.getModel.mockReturnValue(createMonacoModel(['say:hello']))
    monacoMockState.editorInstance.getPosition.mockReturnValue({ lineNumber: 1 })

    renderTextEditor(state)

    await nextTick()

    const [, decorations = []] = monacoMockState.editorInstance.deltaDecorations.mock.calls.at(-1) ?? []
    expect(decorations).toHaveLength(1)
    expect(decorations).toEqual([
      expect.objectContaining({
        options: expect.objectContaining({
          glyphMarginClassName: expect.stringContaining(PLAY_TO_LINE_GLYPH_CLASS_NAME),
        }),
      }),
    ])
    expect(decorations).toEqual([
      expect.objectContaining({
        options: expect.objectContaining({
          glyphMarginClassName: expect.stringContaining(PLAY_TO_LINE_DISABLED_GLYPH_CLASS_NAME),
        }),
      }),
    ])

    const handleMouseDown = monacoMockState.editorInstance.onMouseDown.mock.calls[0]?.[0]

    expect(handleMouseDown).toBeTypeOf('function')

    handleMouseDown?.({
      event: {
        leftButton: true,
      },
      target: {
        position: {
          lineNumber: 1,
        },
        type: monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN,
      },
    })

    expect(editorStore.syncScenePreview).not.toHaveBeenCalled()
  })
})
