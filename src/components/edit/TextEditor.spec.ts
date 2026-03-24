import * as monaco from 'monaco-editor'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-vue'
import { nextTick, reactive } from 'vue'
import { createI18n } from 'vue-i18n'

import { monacoMockState, resetMonacoMockState } from '~/__tests__/mocks/monaco'

vi.mock('monaco-editor', async () => {
  const { createMonacoMockModule } = await import('~/__tests__/mocks/monaco')
  return createMonacoMockModule()
})

const {
  ensureModelMock,
  handleBeforeUnmountMock,
  manualSaveMock,
  runtimeReturnValue,
  useEditSettingsStoreMock,
  useEditorStoreMock,
  useTextEditorRuntimeMock,
  useTabsStoreMock,
} = vi.hoisted(() => {
  const ensureModelMock = vi.fn()
  const handleBeforeUnmountMock = vi.fn()
  const manualSaveMock = vi.fn()
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
    manualSave: manualSaveMock,
  }

  return {
    ensureModelMock,
    handleBeforeUnmountMock,
    manualSaveMock,
    runtimeReturnValue,
    useEditSettingsStoreMock: vi.fn(),
    useEditorStoreMock: vi.fn(),
    useTextEditorRuntimeMock: vi.fn(() => runtimeReturnValue),
    useTabsStoreMock: vi.fn(),
  }
})

vi.mock('~/composables/useTextEditorRuntime', () => ({
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

function createTestI18n() {
  return createI18n({
    legacy: false,
    locale: 'zh-Hans',
    messages: {
      'zh-Hans': {
        edit: {
          visualEditor: {
            playToLine: '执行到此句',
          },
        },
      },
    },
    missingWarn: false,
    fallbackWarn: false,
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
    manualSaveMock.mockReset()
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

  it('激活的文本投影挂载时会创建 Monaco 编辑器并注册保存命令', async () => {
    const { state } = createHarness()
    const result = render(TextEditor, {
      props: {
        state,
      },
      global: {
        plugins: [createTestI18n()],
      },
    })

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

    expect(monacoMockState.editorInstance.addCommand).toHaveBeenCalledWith(
      2048 | 49,
      manualSaveMock,
    )

    const saveHandler = monacoMockState.editorInstance.addCommand.mock.calls[0]?.[1]
    await saveHandler?.()
    expect(manualSaveMock).toHaveBeenCalledTimes(1)

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

    render(TextEditor, {
      props: {
        state,
      },
      global: {
        plugins: [createTestI18n()],
      },
    })

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

    render(TextEditor, {
      props: {
        state,
      },
      global: {
        plugins: [createTestI18n()],
      },
    })

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

    const result = render(TextEditor, {
      props: {
        state,
      },
      global: {
        plugins: [createTestI18n()],
      },
    })

    await nextTick()
    await result.unmount()

    expect(handleBeforeUnmountMock).toHaveBeenCalledTimes(1)
    expect(monacoMockState.editorInstance.dispose).toHaveBeenCalledTimes(1)
  })

  it('非场景文件不会启用 glyph margin', async () => {
    const { state } = createHarness('/project/effect.anim')
    state.kind = 'animation'

    render(TextEditor, {
      props: {
        state,
      },
      global: {
        plugins: [createTestI18n()],
      },
    })

    await nextTick()

    const [, options] = monacoMockState.create.mock.calls[0]
    expect(options).toEqual(expect.objectContaining({
      glyphMargin: false,
    }))
  })

  it('点击 glyph margin 播放按钮时会强制同步场景预览', async () => {
    const { editorStore, state } = createHarness('/project/scene-6.txt')
    monacoMockState.editorInstance.getModel.mockReturnValue(createMonacoModel(['say:hello', '; comment']))
    monacoMockState.editorInstance.getPosition.mockReturnValue({ lineNumber: 1 })

    render(TextEditor, {
      props: {
        state,
      },
      global: {
        plugins: [createTestI18n()],
      },
    })

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
    expect(editorStore.syncScenePreview).toHaveBeenCalledWith('/project/scene-6.txt', 1, 'say:hello', true)
  })

  it('当前行内容变化后会立即重新同步播放按钮 glyph', async () => {
    const { state } = createHarness('/project/scene-6a.txt')
    const lines = ['; comment']
    monacoMockState.editorInstance.getModel.mockReturnValue(createMonacoModel(lines))
    monacoMockState.editorInstance.getPosition.mockReturnValue({ lineNumber: 1 })

    render(TextEditor, {
      props: {
        state,
      },
      global: {
        plugins: [createTestI18n()],
      },
    })

    await nextTick()

    expect(monacoMockState.editorInstance.deltaDecorations).not.toHaveBeenCalled()

    const handleContentChange = monacoMockState.editorInstance.onDidChangeModelContent.mock.calls[0]?.[0]

    expect(handleContentChange).toBeTypeOf('function')

    lines[0] = 'say:hello'
    handleContentChange?.({
      isFlush: false,
    })

    expect(runtimeReturnValue.handleContentChange).toHaveBeenCalledTimes(1)
    expect(monacoMockState.editorInstance.deltaDecorations).toHaveBeenCalledWith([], [
      {
        range: {
          endColumn: 1,
          endLineNumber: 1,
          startColumn: 1,
          startLineNumber: 1,
        },
        options: {
          glyphMarginClassName: 'play-to-line-glyph',
          glyphMarginHoverMessage: {
            value: '执行到此句',
          },
        },
      },
    ])
  })

  it('右键点击 glyph margin 播放按钮时不会触发场景预览同步', async () => {
    const { editorStore, state } = createHarness('/project/scene-7.txt')
    monacoMockState.editorInstance.getModel.mockReturnValue(createMonacoModel(['say:hello']))
    monacoMockState.editorInstance.getPosition.mockReturnValue({ lineNumber: 1 })

    render(TextEditor, {
      props: {
        state,
      },
      global: {
        plugins: [createTestI18n()],
      },
    })

    await nextTick()

    const handleMouseDown = monacoMockState.editorInstance.onMouseDown.mock.calls[0]?.[0]

    expect(handleMouseDown).toBeTypeOf('function')

    const mouseEvent: Parameters<NonNullable<typeof handleMouseDown>>[0] = {
      event: {
        leftButton: false,
      },
      target: {
        position: {
          lineNumber: 1,
        },
        type: monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN,
      },
    }

    handleMouseDown?.(mouseEvent)

    expect(editorStore.syncScenePreview).not.toHaveBeenCalled()
  })

  it('播放按钮样式会命中 Monaco glyph margin 装饰节点', async () => {
    const { state } = createHarness('/project/scene-5.txt')

    render(TextEditor, {
      props: {
        state,
      },
      global: {
        plugins: [createTestI18n()],
      },
    })

    await nextTick()

    const styleText = [...document.querySelectorAll('style')]
      .map(style => style.textContent ?? '')
      .join('\n')

    expect(styleText).toContain('.monaco-editor .glyph-margin-widgets .cgmr.play-to-line-glyph')
    expect(styleText).toContain('.monaco-editor .glyph-margin-widgets .cgmr.play-to-line-glyph::before')
  })
})
