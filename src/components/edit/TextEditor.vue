<script setup lang="ts">
import { VueMonacoEditor } from '@guolao/vue-monaco-editor'
import { writeTextFile } from '@tauri-apps/plugin-fs'
import * as monaco from 'monaco-editor'

import { BASE_EDITOR_OPTIONS, configureWebgalSyntaxHighlighting, THEME_DARK, THEME_LIGHT, tryTriggerWebgalScriptCompletion } from '~/plugins/editor'

interface LanguageConfig {
  name: string
  displayName: string
  extension: string
  editorLanguage?: string
}

const state = defineModel<TextModeState>('state', { required: true })
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

let editor = $shallowRef<monaco.editor.IStandaloneCodeEditor>()
// 追踪已获得过焦点的文件路径，用于切换文件时自动聚焦编辑器
const focusedFilePaths = new Set<string>()
// 追踪每个文件的上次保存时的版本ID，用于准确判断 dirty 状态
const lastSavedVersionIdMap = new Map<string, number>()
// 追踪每个文件的上次保存时间（使用响应式对象）
const lastSavedTimes = $ref<Record<string, Date>>({})

// 编辑器主题
const currentTheme = $computed(() => {
  return colorMode.value === 'dark' ? THEME_DARK : THEME_LIGHT
})

// 计算当前文件语言配置
const currentLanguageConfig = $computed((): LanguageConfig => {
  // 根据可视化类型判断
  if (state.value.visualType) {
    return LANGUAGE_CONFIGS.find(config => config.name === state.value.visualType)!
  }
  // 根据文件扩展名判断
  const extension = state.value.path.split('.').pop()?.toLowerCase() ?? ''
  return LANGUAGE_CONFIGS.find(config => config.extension === extension) ?? LANGUAGE_CONFIGS[0]
})

// 发送同步场景命令
function syncScene() {
  // 只有当文件已保存且是场景文件时才同步场景
  if (state.value.isDirty || state.value.visualType !== 'scene' || !editor) {
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
  void debugCommander.syncScene(state.value.path, position.lineNumber, currentLineText)
}

// 保存文本文件
async function saveTextFile(newText: string) {
  try {
    await writeTextFile(state.value.path, newText)
    // 更新保存时的版本ID
    const lastSavedVersionId = editor?.getModel()?.getAlternativeVersionId()
    if (lastSavedVersionId) {
      lastSavedVersionIdMap.set(state.value.path, lastSavedVersionId)
    }
    // 更新该文件的保存时间
    lastSavedTimes[state.value.path] = new Date()
    state.value.isDirty = false
    syncScene()
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error(`保存文件失败: ${errorMessage}`)
  }
}

const debouncedSaveTextFile = useDebounceFn(saveTextFile, 500)

// 初始化版本ID（如果还没有记录过）
function initializeVersionId() {
  const versionId = editor?.getModel()?.getAlternativeVersionId()
  if (versionId && !lastSavedVersionIdMap.has(state.value.path)) {
    lastSavedVersionIdMap.set(state.value.path, versionId)
  }
}

// 处理编辑器文本聚焦
function handleFocusEditorText() {
  if (state.value.path) {
    focusedFilePaths.add(state.value.path)
  }
}

// 处理光标位置变化
function handleCursorPositionChange(event: monaco.editor.ICursorPositionChangedEvent) {
  const { reason, position } = event
  // 内容刷新或未知原因时不存储
  if (reason === monaco.editor.CursorChangeReason.NotSet
    || reason === monaco.editor.CursorChangeReason.ContentFlush) {
    return
  }

  // 行数未变化时不触发同步（避免同一行内移动光标时的重复同步）
  if (state.value.lastLineNumber === position.lineNumber) {
    return
  }

  // 更新上一次行号
  state.value.lastLineNumber = position.lineNumber
  syncScene()
}

// 手动保存文件
async function manualSave() {
  await saveTextFile(state.value.textContent)
}

// 处理编辑器挂载
function handleMount(editorInstance: monaco.editor.IStandaloneCodeEditor) {
  editor = editorInstance
  editor.onDidFocusEditorText(handleFocusEditorText)
  editor.onDidChangeCursorPosition(handleCursorPositionChange)

  // 添加 Ctrl+S / Cmd+S 快捷键处理
  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, manualSave)

  void configureWebgalSyntaxHighlighting(editor)
}

// 处理内容变化
function handleChange(value: string | undefined) {
  // 更新 dirty 状态（基于版本ID比较）
  const currentVersionId = editor?.getModel()?.getAlternativeVersionId()
  if (currentVersionId) {
    const lastSavedVersionId = lastSavedVersionIdMap.get(state.value.path)!
    state.value.isDirty = lastSavedVersionId !== currentVersionId
  }

  if (editSettings.autoSave && value) {
    debouncedSaveTextFile(value)
  }

  if (state.value.visualType === 'scene') {
    tryTriggerWebgalScriptCompletion(editor)
  }
}

// 计算当前文件的保存时间
const lastSavedTime = $computed(() => {
  return lastSavedTimes[state.value.path] ?? undefined
})

// 同步 isDirty 到 tab.isModified
watch(() => state.value.isDirty, (isDirty) => {
  const tabIndex = tabsStore.findTabIndex(state.value.path)
  if (tabIndex !== -1) {
    tabsStore.updateTabModified(tabIndex, isDirty)
  }
}, { immediate: true })

// 监听路径变化（文件切换）
watch(() => state.value.path, () => {
  if (!editor) {
    return
  }

  // 如果文件已获得过焦点，则聚焦编辑器
  if (focusedFilePaths.has(state.value.path)) {
    editor.focus()
  }

  nextTick(() => {
    initializeVersionId()
    syncScene()
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
