import * as monaco from 'monaco-editor'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, reactive } from 'vue'

import { createBrowserLiteI18n } from '~/__tests__/browser'
import { renderInBrowser } from '~/__tests__/browser-render'
import { monacoMockState, resetMonacoMockState } from '~/__tests__/mocks/monaco'
import { PLAY_TO_LINE_GLYPH_CLASS_NAME } from '~/features/editor/text-editor/text-editor-play-to-line'

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
  useTextEditorRuntimeMock,
  useTabsStoreMock,
} = vi.hoisted(() => {
  const ensureModelMock = vi.fn()
  const handleBeforeUnmountMock = vi.fn()
  const runtimeReturnValue = {
    currentEditorLanguage: { value: 'webgalscript' },
    ensureModel: ensureModelMock,
    handleBeforeUnmount: handleBeforeUnmountMock,
    handleContentChange: vi.fn(),
    handleCursorPositionChange: vi.fn(),
    handleCursorSelectionChange: vi.fn(),
    handleEditorClick: vi.fn(),
    handleEditorCreated: vi.fn(),
    handleScrollChange: vi.fn(),
  }

  return {
    ensureModelMock,
    handleBeforeUnmountMock,
    runtimeReturnValue,
    useEditSettingsStoreMock: vi.fn(),
    useEditorStoreMock: vi.fn(),
    useTextEditorRuntimeMock: vi.fn(() => runtimeReturnValue),
    useTabsStoreMock: vi.fn(),
  }
})

vi.mock('~/features/editor/text-editor/useTextEditorRuntime', () => ({
  useTextEditorRuntime: useTextEditorRuntimeMock,
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
    path: string
    projection: 'text' | 'visual'
  }
  syncScenePreview?: ReturnType<typeof vi.fn>
}

interface TabsStoreMock {
  activeTab?: {
    path: string
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
    path,
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

function getDocumentStyleRuleSelectors(): string[] {
  return [...document.styleSheets].flatMap((sheet) => {
    try {
      return [...sheet.cssRules]
        .filter((rule): rule is CSSStyleRule => 'selectorText' in rule)
        .map(rule => rule.selectorText)
    } catch {
      return []
    }
  })
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
  const editorStore = reactive<EditorStoreMock>({
    currentState: {
      path,
      projection: 'text',
    },
    syncScenePreview: vi.fn(),
  })
  const tabsStore = reactive<TabsStoreMock>({
    activeTab: {
      path,
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
    runtimeReturnValue.handleContentChange.mockReset()
    runtimeReturnValue.handleCursorPositionChange.mockReset()
    runtimeReturnValue.handleCursorSelectionChange.mockReset()
    runtimeReturnValue.handleEditorClick.mockReset()
    runtimeReturnValue.handleEditorCreated.mockReset()
    runtimeReturnValue.handleScrollChange.mockReset()
    useEditSettingsStoreMock.mockReset()
    useEditorStoreMock.mockReset()
    useTabsStoreMock.mockReset()
    useTextEditorRuntimeMock.mockClear()

    ensureModelMock.mockReturnValue({
      id: 'model-1',
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
      path: '/project/other.txt',
      projection: 'text',
    }
    tabsStore.activeTab = {
      path: '/project/other.txt',
    }

    renderTextEditor(state)

    await nextTick()
    expect(monacoMockState.create).not.toHaveBeenCalled()

    editorStore.currentState = {
      path: '/project/scene-2.txt',
      projection: 'text',
    }
    tabsStore.activeTab = {
      path: '/project/scene-2.txt',
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

    expect(handleBeforeUnmountMock).toHaveBeenCalledTimes(1)
    expect(monacoMockState.editorInstance.dispose).toHaveBeenCalledTimes(1)
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

  it('播放按钮样式会命中 Monaco glyph margin 装饰节点', async () => {
    const { state } = createHarness('/project/scene-5.txt')

    renderTextEditor(state)

    await nextTick()

    const selectors = getDocumentStyleRuleSelectors()

    expect(selectors).toContain(`.monaco-editor .glyph-margin-widgets .cgmr.${PLAY_TO_LINE_GLYPH_CLASS_NAME}`)
    expect(selectors).toContain(`.monaco-editor .glyph-margin-widgets .cgmr.${PLAY_TO_LINE_GLYPH_CLASS_NAME}::before`)
  })
})
