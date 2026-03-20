<script setup lang="ts">
import { LRUCache } from 'lru-cache'
import * as monaco from 'monaco-editor'

import { BASE_EDITOR_OPTIONS, THEME_DARK, THEME_LIGHT } from '~/plugins/editor'

const state = $(defineModel<TextModeState>('state', { required: true }))
const editorStore = useEditorStore()
const editSettings = useEditSettingsStore()
const tabsStore = useTabsStore()
const viewStateStore = useEditorViewStateStore()

const editorOptions = $computed<monaco.editor.IEditorConstructionOptions>(() => ({
  ...BASE_EDITOR_OPTIONS,
  fontFamily: editSettings.fontFamily,
  fontSize: editSettings.fontSize,
  wordWrap: editSettings.wordWrap ? 'on' : 'off',
  minimap: {
    enabled: editSettings.minimap,
  },
}))

interface FileState {
  lastSavedVersionId?: number
  lastSavedTime?: Date
  viewState?: monaco.editor.ICodeEditorViewState | null
  hasBeenOpened?: boolean
  hasUserInteracted?: boolean
}

let editor = $shallowRef<monaco.editor.IStandaloneCodeEditor>()
let editorContainer = $ref<HTMLElement>()
const fileStates = $ref(new Map<string, FileState>())
let hasCreatedEditorBefore = false
/** 外部同步内容时（模式切换/文件重载），跳过 handleContentChange 的 isDirty 和自动保存逻辑 */
let isSyncingContent = false

const formPanel = useTextEditorPanel({
  editorRef: $$(editor),
  stateRef: $$(state),
  isScene: () => state.visualType === 'scene',
})
const formEntry = $computed(() => formPanel.currentEntry.value)
const formPreviousSpeaker = $computed(() => formPanel.previousSpeaker.value)

// 注册辅助面板数据源（EditorPanel 统一渲染单实例 StatementEditorPanel）
useSidebarPanelBinding({
  entry: computed(() => formEntry),
  index: computed(() => undefined),
  previousSpeaker: computed(() => formPreviousSpeaker ?? ''),
  enableFocusStatement: false,
  onUpdate: payload => formPanel.handleFormUpdate(payload),
})

// ─── 命令面板桥接 ───

const commandPanelStore = useCommandPanelStore()

/**
 * 在 Monaco 编辑器当前光标行之后插入文本行
 *
 * 使用 executeEdits 确保操作可撤销（Ctrl+Z）
 */
function insertLinesAfterCursor(rawTexts: string[]) {
  if (!editor || rawTexts.length === 0) {
    return
  }

  const model = editor.getModel()
  if (!model) {
    return
  }

  const position = editor.getPosition() ?? { lineNumber: model.getLineCount(), column: 1 }
  const lineCount = model.getLineCount()
  const targetLine = editSettings.commandInsertPosition === 'end'
    ? lineCount
    : Math.min(position.lineNumber, lineCount)
  const lineLength = model.getLineMaxColumn(targetLine)

  // 在当前行末尾插入新内容，空文件时不前置换行
  const currentLineContent = model.getLineContent(targetLine)
  const needsNewline = currentLineContent.length > 0
  const textToInsert = needsNewline ? `\n${rawTexts.join('\n')}` : rawTexts.join('\n')
  const range = new monaco.Range(targetLine, lineLength, targetLine, lineLength)

  editor.executeEdits('command-panel', [{
    range,
    text: textToInsert,
    forceMoveMarkers: true,
  }])

  // 将光标移到最后一行插入内容
  const newLineNumber = targetLine + rawTexts.length - (needsNewline ? 0 : 1)
  editor.setPosition({ lineNumber: newLineNumber, column: 1 })
  editor.revealPositionInCenterIfOutsideViewport({ lineNumber: newLineNumber, column: 1 })
  editor.focus()
}

useCommandPanelBridgeBinding({
  insertCommand: (type) => {
    const rawText = commandPanelStore.getInsertText(type)
    insertLinesAfterCursor([rawText])
  },
  insertGroup: (group) => {
    insertLinesAfterCursor(group.rawTexts)
  },
})

const MAX_CACHED_MODELS = 50

const modelAccessCache = $ref(new LRUCache<string, boolean>({
  max: MAX_CACHED_MODELS,
  dispose: (_value, path) => {
    const uri = monaco.Uri.parse(path)
    const model = monaco.editor.getModel(uri)
    if (model) {
      model.dispose()
      logger.debug(`[TextEditor] LRU 淘汰模型: ${path}`)
    }
  },
}))

const currentTheme = $computed(() => colorMode.value === 'dark' ? THEME_DARK : THEME_LIGHT)

const currentEditorLanguage = $computed((): string => {
  switch (state.visualType) {
    case 'scene': {
      return 'webgalscript'
    }
    case 'animation': {
      return 'json'
    }
    default: {
      const fileName = state.path.split(/[/\\]/).pop() ?? ''
      const lastDot = fileName.lastIndexOf('.')
      const extension = lastDot > 0 ? fileName.slice(lastDot + 1).toLowerCase() : undefined

      if (extension) {
        const monacoLanguage = monaco.languages.getLanguages().find(
          lang => lang.extensions?.includes(`.${extension}`),
        )
        if (monacoLanguage) {
          return monacoLanguage.id
        }
      }

      return 'plaintext'
    }
  }
})

function getOrCreateFileState(path: string): FileState {
  if (!fileStates.has(path)) {
    fileStates.set(path, {})
  }
  return fileStates.get(path)!
}

/**
 * 获取或创建 Monaco 模型
 *
 * @param value - 文件内容
 * @param language - 语言ID（如 'typescript', 'webgalscript'）
 * @param path - 文件路径（用作模型URI）
 * @returns Monaco 文本模型
 */
function getOrCreateModel(value: string, language: string, path: string): monaco.editor.ITextModel {
  const uri = monaco.Uri.parse(path)
  let model = monaco.editor.getModel(uri)

  if (model) {
    if (model.getValue() !== value) {
      model.setValue(value)
    }
    if (model.getLanguageId() !== language) {
      monaco.editor.setModelLanguage(model, language)
    }
  } else {
    model = monaco.editor.createModel(value, language, uri)
  }

  modelAccessCache.set(path, true)

  return model
}

function syncScene() {
  if (state.isDirty || state.visualType !== 'scene' || !editor) {
    return
  }

  const model = editor.getModel()
  if (!model) {
    return
  }

  const position = editor.getPosition() ?? { lineNumber: 1, column: 1 }
  const lineCount = model.getLineCount()
  if (position.lineNumber < 1 || position.lineNumber > lineCount) {
    return
  }

  const currentLineText = model.getLineContent(position.lineNumber)
  editorStore.syncScenePreview(state.path, position.lineNumber, currentLineText)
}

interface SaveSnapshot {
  path: string
  content: string
  versionId: number
}

async function saveTextFile(snapshot: SaveSnapshot) {
  try {
    const fileState = getOrCreateFileState(snapshot.path)

    if (fileState.lastSavedVersionId === snapshot.versionId) {
      return
    }

    await gameFs.writeFile(snapshot.path, snapshot.content)

    fileState.lastSavedVersionId = snapshot.versionId
    fileState.lastSavedTime = new Date()
    state.lastSavedTime = fileState.lastSavedTime

    // 仅在保存期间内容未被修改时才清除 isDirty，防止覆盖用户新输入的脏标记
    const latestVersionId = editor?.getModel()?.getAlternativeVersionId()
    if (snapshot.path === state.path && latestVersionId === snapshot.versionId) {
      state.isDirty = false
    }

    syncScene()
  } catch (error) {
    handleError(error, { silent: true })
  }
}

const debouncedSaveTextFile = useDebounceFn(saveTextFile, 500)

function initializeVersionId() {
  const versionId = editor?.getModel()?.getAlternativeVersionId()
  if (versionId) {
    const fileState = getOrCreateFileState(state.path)
    // 仅在内容未修改时初始化，避免将未保存的内容标记为已保存
    if (fileState.lastSavedVersionId === undefined && !state.isDirty) {
      fileState.lastSavedVersionId = versionId
    }
  }
}

function saveEditorViewState(path: string) {
  if (!editor) {
    const fileState = fileStates.get(path)
    if (fileState?.viewState) {
      viewStateStore.saveViewState(path, fileState.viewState)
    }
    return
  }

  const currentViewState = editor.saveViewState()
  if (!currentViewState) {
    return
  }

  viewStateStore.saveViewState(path, currentViewState)

  const fileState = getOrCreateFileState(path)
  fileState.viewState = currentViewState
}

const debouncedSaveViewState = useDebounceFn(() => {
  saveEditorViewState(state.path)
}, 300)

function handleCursorPositionChange(event: monaco.editor.ICursorPositionChangedEvent) {
  const { reason, position } = event
  if (reason === monaco.editor.CursorChangeReason.NotSet
    || reason === monaco.editor.CursorChangeReason.ContentFlush) {
    return
  }

  debouncedSaveViewState()

  if (state.lastLineNumber === position.lineNumber) {
    return
  }

  state.lastLineNumber = position.lineNumber
  syncScene()
  formPanel.notifyCursorLineChanged()
}

function handleScrollChange() {
  debouncedSaveViewState()
}

function handleEditorClick() {
  const fileState = getOrCreateFileState(state.path)
  fileState.hasUserInteracted = true
}

function focusEditor() {
  if (!editor) {
    return
  }

  nextTick(() => {
    setTimeout(() => {
      editor?.focus()
    }, 50)
  })
}

/**
 * 模式切换后，根据 state.lastLineNumber 重新定位 Monaco 光标并滚动到对应行
 * restoreViewState 触发的光标变更 reason 为 NotSet，已被 handleCursorPositionChange 过滤，
 * 因此 state.lastLineNumber 不会被覆盖，可安全用于判断是否需要重新定位
 */
function applyLastLineNumber() {
  if (!editor || !state.lastLineNumber) {
    return
  }
  const model = editor.getModel()
  if (!model) {
    return
  }
  editor.layout()
  const targetLineNumber = Math.min(Math.max(state.lastLineNumber, 1), model.getLineCount())
  const currentPosition = editor.getPosition()
  const targetPosition = { lineNumber: targetLineNumber, column: 1 }
  if (!currentPosition || currentPosition.lineNumber !== targetLineNumber) {
    editor.setPosition(targetPosition)
  }
  // 即使当前光标已在目标行，也要强制滚动到可见区域，确保模式切换后定位稳定
  editor.revealPositionInCenter(targetPosition, monaco.editor.ScrollType.Immediate)
}

function scheduleApplyLastLineNumber(afterApply?: () => void) {
  nextTick(() => {
    requestAnimationFrame(() => {
      applyLastLineNumber()
      afterApply?.()
    })
  })
}

function isCurrentTabPreview(): boolean {
  return tabsStore.activeTab?.isPreview === true
}

interface RestoreViewStateContext {
  isCreating?: boolean
  isSwitching?: boolean
  isActivating?: boolean
}

/**
 * 恢复编辑器视图状态并处理聚焦
 *
 * @param path - 文件路径
 * @param context - 调用上下文（创建/切换/激活）
 */
function restoreEditorViewState(path: string, context: RestoreViewStateContext = {}) {
  if (!editor) {
    return
  }

  const fileState = getOrCreateFileState(path)

  let viewStateToRestore = fileState.viewState
  let hasPersistedViewState = false

  if (!viewStateToRestore) {
    viewStateToRestore = viewStateStore.getViewState(path)
    if (viewStateToRestore) {
      fileState.viewState = viewStateToRestore
      hasPersistedViewState = true
    }
  }

  if (viewStateToRestore) {
    editor.restoreViewState(viewStateToRestore)
  }

  // restoreViewState 触发的光标变更 reason 为 NotSet，被 handleCursorPositionChange 过滤，
  // 需要主动同步一次光标行号，否则首次切换到可视化模式时 lastLineNumber 为 undefined
  const cursorLine = editor.getPosition()?.lineNumber
  if (cursorLine && !state.lastLineNumber) {
    state.lastLineNumber = cursorLine
  }

  const shouldFocus = shouldFocusEditor({
    ...context,
    fileState,
    hasPersistedViewState,
  })

  if (shouldFocus) {
    if (tabsStore.shouldFocusEditor) {
      tabsStore.shouldFocusEditor = false
    }
    focusEditor()
  }
}

/**
 * 编辑器聚焦决策函数
 *
 * 聚焦时机：
 * 1. 强制聚焦标志（创建新文件等）
 * 2. 应用启动恢复文件且有视图状态
 * 3. 切换到已交互过的文件（预览标签页）
 * 4. 切换到已打开过的文件（普通标签页）
 * 5. 组件激活时（keep-alive）
 */
function shouldFocusEditor(context: {
  isCreating?: boolean
  isSwitching?: boolean
  isActivating?: boolean
  fileState: FileState
  hasPersistedViewState?: boolean
}): boolean {
  if (tabsStore.shouldFocusEditor) {
    return true
  }

  const isPreview = isCurrentTabPreview()
  const hasViewState = context.fileState.viewState !== undefined || context.hasPersistedViewState === true

  if (context.isCreating) {
    return !isPreview && !hasCreatedEditorBefore && hasViewState
  }

  if (context.isSwitching) {
    return isPreview
      ? context.fileState.hasUserInteracted === true
      : hasViewState || context.fileState.hasBeenOpened === true
  }

  if (context.isActivating) {
    return isPreview ? context.fileState.hasUserInteracted === true : true
  }

  return false
}

async function manualSave() {
  const model = editor?.getModel()
  const value = model?.getValue()
  const versionId = model?.getAlternativeVersionId()
  if (value !== undefined && versionId !== undefined) {
    await saveTextFile({ path: state.path, content: value, versionId })
  }
}

function handleContentChange() {
  // 外部同步（模式切换/文件重载）触发的 setValue 不应更新 isDirty 和自动保存
  if (isSyncingContent) {
    return
  }

  const currentVersionId = editor?.getModel()?.getAlternativeVersionId()
  if (currentVersionId) {
    const fileState = getOrCreateFileState(state.path)
    state.isDirty = fileState.lastSavedVersionId !== currentVersionId
  }

  const value = editor?.getValue()
  if (value !== undefined) {
    state.textContent = value

    if (editSettings.autoSave && currentVersionId) {
      debouncedSaveTextFile({ path: state.path, content: value, versionId: currentVersionId })
    }
  }

  formPanel.notifyContentChanged()
}

/**
 * 切换编辑器模型（在不同文件间切换时调用）
 *
 * 流程：
 * 1. 保存旧文件的视图状态
 * 2. 获取或创建新文件的模型（优先重用现有模型）
 * 3. 切换编辑器显示的模型
 * 4. 恢复新文件的视图状态并处理聚焦
 */
function switchModel(newPath: string, oldPath: string) {
  if (!editor) {
    return
  }

  saveEditorViewState(oldPath)

  const oldFileState = getOrCreateFileState(oldPath)

  const oldTab = tabsStore.tabs.find(t => t.path === oldPath)
  if (oldTab && !oldTab.isPreview) {
    oldFileState.hasBeenOpened = true
  } else if (!oldTab) {
    oldFileState.hasUserInteracted = false
  }

  const newModel = getOrCreateModel(state.textContent, currentEditorLanguage, newPath)

  editor.setModel(newModel)

  const newFileState = getOrCreateFileState(newPath)

  if (!isCurrentTabPreview()) {
    newFileState.hasBeenOpened = true
  }

  restoreEditorViewState(newPath, { isSwitching: true })

  nextTick(() => {
    initializeVersionId()
    syncScene()
    formPanel.updateFormEntry()
  })
}

function createEditor() {
  if (!editorContainer || editor) {
    return
  }

  const initialModel = getOrCreateModel(state.textContent, currentEditorLanguage, state.path)

  editor = monaco.editor.create(editorContainer, {
    model: initialModel,
    theme: currentTheme,
    automaticLayout: true,
    autoIndent: 'brackets',
    formatOnPaste: true,
    formatOnType: true,
    ...editorOptions,
  })

  editor.onDidChangeCursorPosition(handleCursorPositionChange)
  editor.onDidChangeModelContent(handleContentChange)
  editor.onDidScrollChange(handleScrollChange)
  editor.onMouseDown(handleEditorClick)
  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, manualSave)

  restoreEditorViewState(state.path, { isCreating: true })

  initializeVersionId()

  const fileState = getOrCreateFileState(state.path)
  if (!isCurrentTabPreview()) {
    fileState.hasBeenOpened = true
  }

  hasCreatedEditorBefore = true

  formPanel.updateFormEntry()
}

watch(() => state.path, (newPath, oldPath) => {
  if (oldPath && newPath !== oldPath) {
    switchModel(newPath, oldPath)
  }
})

watch(() => state.textContent, (newContent) => {
  if (!editor) {
    return
  }

  const model = editor.getModel()
  if (!model) {
    return
  }

  const currentValue = model.getValue()
  if (currentValue === newContent) {
    return
  }

  const modelUri = model.uri.toString()
  const currentUri = monaco.Uri.parse(state.path).toString()

  if (modelUri === currentUri) {
    const preservedDirty = state.isDirty
    isSyncingContent = true
    model.setValue(newContent)
    isSyncingContent = false

    const currentVersionId = model.getAlternativeVersionId()
    const fileState = getOrCreateFileState(state.path)
    // 仅在内容未修改时才标记为已保存，避免跳过后续的实际保存
    if (!preservedDirty) {
      fileState.lastSavedVersionId = currentVersionId
    }
    state.isDirty = preservedDirty

    // 外部同步后更新表单面板
    nextTick(() => {
      formPanel.updateFormEntry()
      scheduleApplyLastLineNumber()
    })
  }
})

watch(() => currentEditorLanguage, (language) => {
  if (!editor) {
    return
  }

  const model = editor.getModel()
  if (model && model.getLanguageId() !== language) {
    monaco.editor.setModelLanguage(model, language)
  }
})

watch(() => currentTheme, (newTheme) => {
  if (editor) {
    monaco.editor.setTheme(newTheme)
  }
})

watch(() => editorOptions, (newOptions) => {
  if (editor) {
    editor.updateOptions(newOptions)
  }
}, { deep: true })

watch(() => state.isDirty, (isDirty) => {
  const tabIndex = tabsStore.findTabIndex(state.path)
  if (tabIndex !== -1) {
    tabsStore.updateTabModified(tabIndex, isDirty)
  }
}, { immediate: true })

const fileSystemEvents = useFileSystemEvents()
fileSystemEvents.on('file:renamed', (event) => {
  const { oldPath, newPath } = event
  const oldState = fileStates.get(oldPath)
  if (oldState) {
    fileStates.set(newPath, oldState)
    fileStates.delete(oldPath)
  }
  viewStateStore.renameViewState(oldPath, newPath)

  if (modelAccessCache.has(oldPath)) {
    modelAccessCache.delete(oldPath)
    modelAccessCache.set(newPath, true)
  }
})

fileSystemEvents.on('file:removed', (event) => {
  fileStates.delete(event.path)
  viewStateStore.removeViewState(event.path)

  modelAccessCache.delete(event.path)

  const uri = monaco.Uri.parse(event.path)
  const model = monaco.editor.getModel(uri)
  if (model) {
    model.dispose()
  }
})

useTabsWatcher((closedPath) => {
  saveEditorViewState(closedPath)
  fileStates.delete(closedPath)
})

watch(() => tabsStore.shouldFocusEditor, (shouldFocus) => {
  if (shouldFocus && editor) {
    restoreEditorViewState(state.path)
  }
})

onMounted(() => {
  createEditor()
})

onActivated(() => {
  if (editor) {
    restoreEditorViewState(state.path, { isActivating: true })
  }
  // 模式切换回文本编辑器时，重置缓存并在光标定位完成后刷新表单面板
  formPanel.reset()
  scheduleApplyLastLineNumber(() => {
    formPanel.updateFormEntry()
  })
})

onUnmounted(() => {
  if (editor) {
    saveEditorViewState(state.path)

    editor.dispose()
    editor = undefined
  }
})
</script>

<template>
  <div ref="editorContainer" class="h-full overflow-hidden" />
</template>
