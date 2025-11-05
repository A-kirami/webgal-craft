<script setup lang="ts">
import { VueMonacoEditor } from '@guolao/vue-monaco-editor'
import { writeTextFile } from '@tauri-apps/plugin-fs'
import * as monaco from 'monaco-editor'

import { configureWebgalSyntaxHighlighting, THEME_DARK, THEME_LIGHT } from '~/plugins/editor/monaco'

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

// Monaco 编辑器基础配置
const BASE_EDITOR_OPTIONS = {
  bracketPairColorization: {
    enabled: true,
    independentColorPoolPerBracketType: true,
  },
  cursorSmoothCaretAnimation: 'on',
  formatOnPaste: true,
  formatOnType: true,
  minimap: { enabled: true },
  unicodeHighlight: {
    ambiguousCharacters: false,
    invisibleCharacters: false,
    nonBasicASCII: false,
  },
  smoothScrolling: true,
} as const satisfies monaco.editor.IEditorConstructionOptions

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
const interactedPaths = new Set<string>()
// 追踪每个文件的上一次行号，用于避免同一行内的重复同步
const lastLineNumberMap = new Map<string, number>()

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
  if (state.value.visualType !== 'scene' || !editor) {
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
    state.value.isDirty = false
    syncScene()
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error(`保存文件失败: ${errorMessage}`)
  }
}

const debouncedSaveTextFile = useDebounceFn(saveTextFile, 500)

// 处理编辑器文本聚焦
function handleFocusEditorText() {
  if (state.value.path) {
    interactedPaths.add(state.value.path)
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
  const lastLineNumber = lastLineNumberMap.get(state.value.path)
  if (lastLineNumber === position.lineNumber) {
    return
  }

  // 更新上一次行号
  lastLineNumberMap.set(state.value.path, position.lineNumber)
  // 只有当文件已保存时才同步场景
  if (!state.value.isDirty) {
    syncScene()
  }
}

// 手动保存文件
async function manualSave() {
  const model = editor?.getModel()
  if (!model) {
    return
  }

  const currentContent = model.getValue()
  await saveTextFile(currentContent)
}

// 处理编辑器挂载
function handleMount(editorInstance: monaco.editor.IStandaloneCodeEditor) {
  editor = editorInstance
  editor.onDidFocusEditorText(handleFocusEditorText)
  editor.onDidChangeCursorPosition(handleCursorPositionChange)

  // 添加 Ctrl+S / Cmd+S 快捷键处理
  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
    void manualSave()
  })

  void configureWebgalSyntaxHighlighting(editor)
}

// 处理内容变化
function handleChange(newValue: string) {
  state.value.isDirty = true
  // 只有在自动保存模式下才自动保存
  if (editSettings.autoSave) {
    debouncedSaveTextFile(newValue)
  }
}

// 同步 isDirty 到 tab.isModified
watch(() => state.value.isDirty, (isDirty) => {
  const tabIndex = tabsStore.findTabIndex(state.value.path)
  if (tabIndex !== -1) {
    tabsStore.updateTabModified(tabIndex, isDirty)
  }
}, { immediate: true })

// TODO: 其实应该监听 tabs 的活动标签页，目前点击当前 tab 不会聚焦，之后再改
watch(() => state.value.path, () => {
  if (!editor) {
    return
  }

  // 如果路径已交互过，则聚焦编辑器
  if (interactedPaths.has(state.value.path)) {
    editor.focus()
  }

  nextTick(() => {
    if (!state.value.isDirty) {
      syncScene()
    }
  })
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
    />
  </div>
</template>
