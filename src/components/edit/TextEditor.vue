<script setup lang="ts">
import { VueMonacoEditor } from '@guolao/vue-monaco-editor'
import { writeTextFile } from '@tauri-apps/plugin-fs'
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
const { t } = useI18n()

const LANGUAGE_CONFIGS = $computed<LanguageConfig[]>(() => [
  { name: 'unknown', displayName: t('edit.textEditor.languages.unknown'), extension: '', editorLanguage: 'plaintext' },
  { name: 'plaintext', displayName: t('edit.textEditor.languages.plaintext'), extension: 'txt' },
  { name: 'scene', displayName: t('edit.textEditor.languages.webgalscript'), extension: 'txt', editorLanguage: 'webgalscript' },
  { name: 'json', displayName: t('edit.textEditor.languages.json'), extension: 'json' },
  { name: 'animation', displayName: t('edit.textEditor.languages.webgalanimation'), extension: 'json', editorLanguage: 'json' },
])

// 合并用户设置的编辑器配置
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
  hasFocused: boolean
}

let editor = $shallowRef<monaco.editor.IStandaloneCodeEditor>()
const fileStates = $ref<Record<string, FileState>>({})

// 编辑器主题
const currentTheme = $computed(() => {
  return colorMode.value === 'dark' ? THEME_DARK : THEME_LIGHT
})

// 计算当前文件语言配置
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
  if (!fileStates[path]) {
    fileStates[path] = { hasFocused: false }
  }
  return fileStates[path]
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
    await writeTextFile(state.path, newText)
    const versionId = editor?.getModel()?.getAlternativeVersionId()
    if (versionId) {
      const fileState = getOrCreateFileState(state.path)
      fileState.lastSavedVersionId = versionId
      fileState.lastSavedTime = new Date()
    }
    state.isDirty = false
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

function handleFocusEditorText() {
  getOrCreateFileState(state.path).hasFocused = true
}

function handleCursorPositionChange(event: monaco.editor.ICursorPositionChangedEvent) {
  const { reason, position } = event
  if (reason === monaco.editor.CursorChangeReason.NotSet
    || reason === monaco.editor.CursorChangeReason.ContentFlush) {
    return
  }

  if (state.lastLineNumber === position.lineNumber) {
    return
  }

  state.lastLineNumber = position.lineNumber
  syncScene()
}

async function manualSave() {
  await saveTextFile(state.textContent)
}

function handleMount(editorInstance: monaco.editor.IStandaloneCodeEditor) {
  editor = editorInstance
  editor.onDidFocusEditorText(handleFocusEditorText)
  editor.onDidChangeCursorPosition(handleCursorPositionChange)
  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, manualSave)
  void configureWebgalSyntaxHighlighting(editor)
}

function handleChange(value: string | undefined) {
  const currentVersionId = editor?.getModel()?.getAlternativeVersionId()
  if (currentVersionId) {
    const fileState = getOrCreateFileState(state.path)
    state.isDirty = fileState.lastSavedVersionId !== currentVersionId
  }

  if (editSettings.autoSave && value) {
    debouncedSaveTextFile(value)
  }
}

const lastSavedTime = $computed(() => {
  return fileStates[state.path]?.lastSavedTime
})

watch(() => state.isDirty, (isDirty) => {
  const tabIndex = tabsStore.findTabIndex(state.path)
  if (tabIndex !== -1) {
    tabsStore.updateTabModified(tabIndex, isDirty)
  }
}, { immediate: true })

const fileSystemEvents = useFileSystemEvents()
fileSystemEvents.on('file:renamed', (event) => {
  const { oldPath, newPath } = event
  const oldState = fileStates[oldPath]
  if (oldState) {
    fileStates[newPath] = oldState
    delete fileStates[oldPath]
  }
})

fileSystemEvents.on('file:modified', (event) => {
  if (event.path === state.path) {
    nextTick(syncScene)
  }
})

watch(() => state.path, (newPath) => {
  if (!editor) {
    return
  }

  const fileState = fileStates[newPath]
  if (fileState?.hasFocused) {
    editor.focus()
  }

  nextTick(() => {
    initializeVersionId()
    syncScene()
  })
})

watchEffect(() => {
  if (!tabsStore.shouldFocusEditor || !editor) {
    return
  }

  tabsStore.shouldFocusEditor = false

  nextTick(() => {
    setTimeout(() => {
      editor?.focus()
    }, 100)
  })
})

onMounted(() => {
  initializeVersionId()
})
</script>

<template>
  <div class="flex flex-col h-full overflow-hidden divide-y">
    <div class="flex flex-1 overflow-hidden">
      <VueMonacoEditor
        :path="state.path"
        ::value="state.textContent"
        :theme="currentTheme"
        :language="currentLanguageConfig.editorLanguage ?? currentLanguageConfig.name"
        :options="editorOptions"
        @mount="handleMount"
        @change="handleChange"
      />
    </div>
    <TextEditorStatusBar
      class="text-nowrap"
      :is-saved="!state.isDirty"
      :content="state.textContent"
      :file-language="currentLanguageConfig.displayName"
      :last-saved-time="lastSavedTime"
    />
  </div>
</template>
