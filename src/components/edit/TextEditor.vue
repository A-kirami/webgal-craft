<script setup lang="ts">
import { writeTextFile } from '@tauri-apps/plugin-fs'
import { LRUCache } from 'lru-cache'
import * as monaco from 'monaco-editor'

import { BASE_EDITOR_OPTIONS, configureWebgalSyntaxHighlighting, THEME_DARK, THEME_LIGHT } from '~/plugins/editor'

interface LanguageConfig {
  name: string
  displayName: string
  extension: string
  editorLanguage?: string
}

const state = $(defineModel<TextModeState>('state', { required: true }))
const editSettings = useEditSettingsStore()
const tabsStore = useTabsStore()
const viewStateStore = useEditorViewStateStore()
const { t } = useI18n()

const LANGUAGE_CONFIGS = $computed<LanguageConfig[]>(() => [
  { name: 'unknown', displayName: t('edit.textEditor.languages.unknown'), extension: '', editorLanguage: 'plaintext' },
  { name: 'plaintext', displayName: t('edit.textEditor.languages.plaintext'), extension: 'txt' },
  { name: 'scene', displayName: t('edit.textEditor.languages.webgalscript'), extension: 'txt', editorLanguage: 'webgalscript' },
  { name: 'json', displayName: t('edit.textEditor.languages.json'), extension: 'json' },
  { name: 'animation', displayName: t('edit.textEditor.languages.webgalanimation'), extension: 'json', editorLanguage: 'json' },
])

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

const currentTheme = $computed(() => {
  return colorMode.value === 'dark' ? THEME_DARK : THEME_LIGHT
})

const currentLanguageConfig = $computed((): LanguageConfig => {
  // 根据可视化类型判断
  if (state.visualType) {
    return LANGUAGE_CONFIGS.find(config => config.name === state.visualType)!
  }
  // 根据文件扩展名判断
  const extension = state.path.split('.').pop()?.toLowerCase() ?? ''
  return LANGUAGE_CONFIGS.find(config => config.extension === extension) ?? LANGUAGE_CONFIGS[0]
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
  void debugCommander.syncScene(state.path, position.lineNumber, currentLineText)
}

async function saveTextFile(newText: string) {
  try {
    const fileState = getOrCreateFileState(state.path)
    const currentVersionId = editor?.getModel()?.getAlternativeVersionId()

    if (currentVersionId && fileState.lastSavedVersionId === currentVersionId) {
      return
    }

    await writeTextFile(state.path, newText)

    if (currentVersionId) {
      fileState.lastSavedVersionId = currentVersionId
    }

    fileState.lastSavedTime = new Date()
    state.isDirty = false

    await gameManager.updateCurrentGameLastModified()

    syncScene()
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error(`保存文件失败: ${errorMessage}`)
  }
}

const debouncedSaveTextFile = useDebounceFn(saveTextFile, 500)

function initializeVersionId() {
  const versionId = editor?.getModel()?.getAlternativeVersionId()
  if (versionId) {
    const fileState = getOrCreateFileState(state.path)
    if (fileState.lastSavedVersionId === undefined) {
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
  const value = editor?.getValue()
  if (value !== undefined) {
    await saveTextFile(value)
  }
}

function handleContentChange() {
  const currentVersionId = editor?.getModel()?.getAlternativeVersionId()
  if (currentVersionId) {
    const fileState = getOrCreateFileState(state.path)
    state.isDirty = fileState.lastSavedVersionId !== currentVersionId
  }

  const value = editor?.getValue()
  if (value !== undefined) {
    state.textContent = value

    if (editSettings.autoSave) {
      debouncedSaveTextFile(value)
    }
  }
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

  const language = currentLanguageConfig.editorLanguage ?? currentLanguageConfig.name
  const newModel = getOrCreateModel(state.textContent, language, newPath)

  editor.setModel(newModel)

  const newFileState = getOrCreateFileState(newPath)

  if (!isCurrentTabPreview()) {
    newFileState.hasBeenOpened = true
  }

  restoreEditorViewState(newPath, { isSwitching: true })

  nextTick(() => {
    initializeVersionId()
    syncScene()
  })
}

function createEditor() {
  if (!editorContainer || editor) {
    return
  }

  const language = currentLanguageConfig.editorLanguage ?? currentLanguageConfig.name
  const initialModel = getOrCreateModel(state.textContent, language, state.path)

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

  void configureWebgalSyntaxHighlighting(editor)

  restoreEditorViewState(state.path, { isCreating: true })

  initializeVersionId()

  const fileState = getOrCreateFileState(state.path)
  if (!isCurrentTabPreview()) {
    fileState.hasBeenOpened = true
  }

  hasCreatedEditorBefore = true
}

const lastSavedTime = $computed(() => {
  return fileStates.get(state.path)?.lastSavedTime
})

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
    model.setValue(newContent)

    const currentVersionId = model.getAlternativeVersionId()
    const fileState = getOrCreateFileState(state.path)
    fileState.lastSavedVersionId = currentVersionId
    state.isDirty = false
  }
})

watch(() => currentLanguageConfig, (newConfig) => {
  if (!editor) {
    return
  }

  const model = editor.getModel()
  if (model) {
    const language = newConfig.editorLanguage ?? newConfig.name
    if (model.getLanguageId() !== language) {
      monaco.editor.setModelLanguage(model, language)
    }
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

fileSystemEvents.on('file:modified', (event) => {
  if (event.path === state.path) {
    nextTick(syncScene)
  }
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
  <div class="flex flex-col h-full overflow-hidden divide-y">
    <div ref="editorContainer" class="flex flex-1 overflow-hidden" />
    <TextEditorStatusBar
      class="text-nowrap"
      :is-saved="!state.isDirty"
      :content="state.textContent"
      :file-language="currentLanguageConfig.displayName"
      :last-saved-time="lastSavedTime"
    />
  </div>
</template>
