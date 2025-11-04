<script setup lang="ts">
import { VueMonacoEditor } from '@guolao/vue-monaco-editor'
import { writeTextFile } from '@tauri-apps/plugin-fs'
import * as monaco from 'monaco-editor'
import { wireTmGrammars } from 'monaco-editor-textmate'
import { Registry } from 'monaco-textmate'

import webgalTextmate from '~/plugins/editor/grammars/webgal.tmLanguage.json'
import darkTheme from '~/plugins/editor/themes/webgal-dark.json'
import lightTheme from '~/plugins/editor/themes/webgal-light.json'

interface LanguageConfig {
  name: string
  displayName: string
  extension: string
}

const state = defineModel<TextModeState>('state', { required: true })
const editSettings = useEditSettingsStore()
const lineHolderStore = useLineHolderStore()

const LANGUAGE_CONFIGS: LanguageConfig[] = [
  { name: 'unknown', displayName: '未知', extension: '' },
  { name: 'plaintext', displayName: '纯文本', extension: 'txt' },
  { name: 'webgalscript', displayName: 'WebGAL 脚本', extension: 'txt' },
  { name: 'json', displayName: 'JSON', extension: 'json' },
  { name: 'webgalanimation', displayName: 'WebGAL 动画', extension: 'json' },
]

const LANGUAGE_MAP = new Map(LANGUAGE_CONFIGS.map(config => [config.name, config]))

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

// 编辑器主题名称
const THEME_LIGHT = 'webgal-light'
const THEME_DARK = 'webgal-dark'

// 编辑器主题
const currentTheme = $computed(() => {
  return colorMode.value === 'dark' ? THEME_DARK : THEME_LIGHT
})

// 默认光标位置
const DEFAULT_POSITION = new monaco.Position(1, 1)

// 获取存储的光标位置
function getStoredPosition(): monaco.Position {
  return lineHolderStore.getPosition(state.value.path) ?? DEFAULT_POSITION
}

// 计算当前文件语言配置
const currentLanguageConfig = $computed((): LanguageConfig => {
  // 根据可视化类型判断
  if (state.value.visualType === 'scene') {
    return LANGUAGE_MAP.get('webgalscript')!
  }
  if (state.value.visualType === 'animation') {
    return LANGUAGE_MAP.get('webgalanimation')!
  }
  // 根据文件扩展名判断
  const extension = state.value.path.split('.').pop()?.toLowerCase() ?? ''
  return LANGUAGE_CONFIGS.find(config => config.extension === extension) ?? LANGUAGE_CONFIGS[0]
})

// 配置 WebGAL 语言支持
async function configureWebgalScript() {
  if (!editor) {
    return
  }

  try {
    // 定义主题
    monaco.editor.defineTheme(THEME_LIGHT, lightTheme as monaco.editor.IStandaloneThemeData)
    monaco.editor.defineTheme(THEME_DARK, darkTheme as monaco.editor.IStandaloneThemeData)
    editor.updateOptions({ theme: currentTheme })
    // 注册语言
    monaco.languages.register({ id: 'webgalscript' })
    monaco.languages.setLanguageConfiguration('webgalscript', {
      comments: { lineComment: ';' },
      brackets: [['{', '}'], ['[', ']'], ['(', ')']],
      autoClosingPairs: [
        { open: '{', close: '}' },
        { open: '[', close: ']' },
        { open: '(', close: ')' },
        { open: '"', close: '"' },
      ],
    })
    // 语法高亮
    const registry = new Registry({
      getGrammarDefinition: async (scopeName) => {
        if (scopeName === 'source.webgal') {
          return {
            format: 'json',
            content: JSON.stringify(webgalTextmate),
          }
        }
        return { format: 'json', content: '' }
      },
    })

    const grammars = new Map([['webgalscript', 'source.webgal']])
    await initOnigasm()
    await registry.loadGrammar('source.webgal')
    await wireTmGrammars(monaco, registry, grammars, editor)
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error(`配置 WebGAL 语言支持失败: ${errorMessage}`)
  }
}

// 发送同步场景命令
function syncScene() {
  if (state.value.visualType !== 'scene') {
    return
  }

  const model = editor?.getModel()
  if (!model) {
    return
  }

  const position = getStoredPosition()
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

// 同步光标位置到编辑器
function syncCursorPosition() {
  editor?.setPosition(getStoredPosition())
}

// 处理光标位置变化
function handleCursorPositionChange(event: monaco.editor.ICursorPositionChangedEvent) {
  if (state.value.path) {
    interactedPaths.add(state.value.path)
  }

  const { reason, position } = event
  // 内容刷新或未知原因时不存储
  if (reason === monaco.editor.CursorChangeReason.NotSet
    || reason === monaco.editor.CursorChangeReason.ContentFlush) {
    return
  }

  // 行数未变化时不存储
  const storedPosition = lineHolderStore.getPosition(state.value.path)
  if (storedPosition && storedPosition.lineNumber === position.lineNumber) {
    return
  }

  lineHolderStore.setPosition(state.value.path, position)
  syncScene()
}

// 处理编辑器挂载
function handleMount(editorInstance: monaco.editor.IStandaloneCodeEditor) {
  editor = editorInstance
  editor.onDidChangeCursorPosition(handleCursorPositionChange)
  configureWebgalScript()
}

// 处理内容变化
function handleChange(newValue: string) {
  state.value.isDirty = true
  debouncedSaveTextFile(newValue)
}

// TODO: 其实应该监听 tabs 的活动标签页，目前点击当前 tab 不会聚焦，之后再改
watch(() => state.value.path, () => {
  if (!editor || !interactedPaths.has(state.value.path)) {
    return
  }

  editor.focus()
  nextTick(() => {
    syncCursorPosition()
    syncScene()
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
        :language="currentLanguageConfig.name"
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
