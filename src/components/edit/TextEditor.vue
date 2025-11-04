<script setup lang="ts">
import { VueMonacoEditor } from '@guolao/vue-monaco-editor'
import { writeTextFile } from '@tauri-apps/plugin-fs'
import * as monaco from 'monaco-editor'
import { wireTmGrammars } from 'monaco-editor-textmate'
import { Registry } from 'monaco-textmate'

import webgalTextmate from '~/grammars/webgal.tmLanguage.json'
import { useLineHolderStore } from '~/stores/line-holder'
import lightTheme from '~/themes/vs-webgal.json'
import { initOnigasm } from '~/utils/init-onigasm'

interface languageConfig {
  name: string
  displayName: string
  extension: string
}

const state = defineModel<TextModeState>('state', { required: true })

const editSettings = useEditSettingsStore()

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

// 从用户设置合并编辑器配置
const MONACO_EDITOR_OPTIONS = $computed<monaco.editor.IEditorConstructionOptions>(() => ({
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
const lineHolderStore = useLineHolderStore()
const languageConfigs: languageConfig[] = [
  { name: 'unknown', displayName: '未知文件', extension: '' },
  { name: 'plaintext', displayName: '纯文本文件', extension: 'txt' },
  { name: 'webgal', displayName: 'WebGal 脚本', extension: 'txt' },
  { name: 'json', displayName: 'JSON 文件', extension: 'json' },
]
let currentTheme = $ref('vs')

// 配置 WebGal 语言支持
const configureWebgalScript = async () => {
  if (!editor) {
    return
  }
  // 定义主题
  monaco.editor.defineTheme('vs-webgal', lightTheme as monaco.editor.IStandaloneThemeData)
  currentTheme = 'vs-webgal'
  // 注册语言
  monaco.languages.register({ id: 'webgal' })
  monaco.languages.setLanguageConfiguration('webgal', {
    comments: {
      lineComment: ';',
    },
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
    getGrammarDefinition: async (scopeName, _dependentScope) => {
      if (scopeName === 'source.webgal') {
        return {
          format: 'json',
          content: JSON.stringify(webgalTextmate),
        }
      }
      return { format: 'json', content: '' }
    },
  })
  const grammars = new Map()
  grammars.set('webgal', 'source.webgal')
  await initOnigasm()
  await registry.loadGrammar('source.webgal')
  await wireTmGrammars(monaco, registry, grammars, editor)
}

// 发送同步场景命令
const syncScene = () => {
  const model = editor?.getModel()
  if (!model || state.value.visualType !== 'scene') {
    return
  }
  const position = lineHolderStore.getPosition(state.value.path)
    || { lineNumber: 1, column: 1 }
  const currentLineText = model.getLineContent(position.lineNumber)
  debugCommander.syncScene(state.value.path, position.lineNumber, currentLineText)
}

// 保存文本文件
const saveTextFile = useDebounceFn((newText: string) => {
  state.value.textContent = newText
  state.value.isDirty = true
  writeTextFile(state.value.path, newText).then(() => {
    state.value.isDirty = false
    syncScene()
  }).catch((error) => {
    logger.error(`保存文件时出错: ${error}`)
  })
}, 500)

// 同步光标位置到文本编辑器
const syncCursorPosition = () => {
  const storedPosition = lineHolderStore.getPosition(state.value.path) || { lineNumber: 1, column: 1 }
  editor?.setPosition(storedPosition)
}

// 储存光标位置(必要时)
const storeCursorPositionIfNeeded = (
  event: monaco.editor.ICursorPositionChangedEvent,
  onStore?: () => void,
) => {
  // 内容刷新或原因未知时不存储
  if (
    event.reason === monaco.editor.CursorChangeReason.NotSet
    || event.reason === monaco.editor.CursorChangeReason.ContentFlush
  ) {
    return
  }
  // 行数未变化时不存储
  const position = lineHolderStore.getPosition(state.value.path)
  if (position && position.lineNumber === event.position.lineNumber) {
    return
  }
  lineHolderStore.setPosition(state.value.path, event.position)
  onStore?.()
}

// 监听光标位置变化
const handleCursorPositionChange = (event: monaco.editor.ICursorPositionChangedEvent) => {
  if (state.value.path) {
    interactedPaths.add(state.value.path)
  }
  storeCursorPositionIfNeeded(event, () => {
    syncScene()
  })
}

// 编辑器挂载回调
const handleMount = (editorInstance: monaco.editor.IStandaloneCodeEditor) => {
  editor = editorInstance
  editor.onDidChangeCursorPosition(handleCursorPositionChange)
  editor.updateOptions({
    wordWrap: 'on', // Todo: 应该做成设置项
  })
  configureWebgalScript()
}

// 内容变化处理
const handleChange = (newValue: string) => {
  state.value.isDirty = true
  saveTextFile(newValue)
}

// 计算当前文件语言
const getLanguageConfig = computed((): languageConfig => {
  switch (state.value.visualType) {
    case 'scene': {
      return languageConfigs.find(lang => lang.name === 'webgal')!
    }
    case 'animation': {
      return languageConfigs.find(lang => lang.name === 'json')!
    }
    default: {
      break
    }
  }
  // 根据文件扩展名判断
  const extensionMatch = state.value.path.match(/\.([^.]+)$/)
  if (!extensionMatch) {
    return languageConfigs[0]
  }
  const fileType = extensionMatch[1].toLowerCase()
  const langConfig = languageConfigs.find(lang => lang.extension === fileType)
  if (!langConfig) {
    return languageConfigs[0]
  }
  return langConfig
})

// 监听配置变化并实时更新编辑器
watch(
  () => [
    editSettings.fontFamily,
    editSettings.fontSize,
    editSettings.wordWrap,
    editSettings.minimap,
  ],
  () => {
    if (editor) {
      editor.updateOptions(MONACO_EDITOR_OPTIONS)
    }
  },
)

// TODO: 其实应该监听 tabs 的活动标签页，目前点击当前 tab 不会聚焦，之后再改
watch(() => state.value.path, () => {
  if (!editor) {
    return
  }

  if (interactedPaths.has(state.value.path)) {
    editor.focus()
    // 延迟执行，确保编辑器文本已更新
    setTimeout(() => {
      syncCursorPosition()
      syncScene()
    }, 0)
  }
})
</script>

<template>
  <div class="flex flex-col h-full overflow-hidden divide-y">
    <div class="flex flex-1 overflow-hidden">
      <VueMonacoEditor
        :path="state.path"
        ::value="state.textContent"
        :theme="currentTheme"
        :language="getLanguageConfig.name"
        :options="MONACO_EDITOR_OPTIONS"
        @mount="handleMount"
        @change="handleChange"
      />
    </div>
    <TextEditorStatusBar class="text-nowrap" :is-saved="!state.isDirty" :content="state.textContent" :file-language="getLanguageConfig.displayName" />
  </div>
</template>
