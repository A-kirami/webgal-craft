<script setup lang="ts">
import { VueMonacoEditor } from '@guolao/vue-monaco-editor'
import { writeTextFile } from '@tauri-apps/plugin-fs'
import * as monaco from 'monaco-editor'

import { useLineHolderStore } from '~/stores/line-holder'

const state = defineModel<TextModeState>('state', { required: true })

// Monaco 编辑器配置
const MONACO_EDITOR_OPTIONS = {
  bracketPairColorization: {
    enabled: true,
    independentColorPoolPerBracketType: true,
  },
  cursorSmoothCaretAnimation: 'on',
  formatOnPaste: true,
  formatOnType: true,
  minimap: { enabled: false },
} as const satisfies monaco.editor.IEditorConstructionOptions

let editor = $shallowRef<monaco.editor.IStandaloneCodeEditor>()
const interactedPaths = new Set<string>()
const lineHolderStore = useLineHolderStore()

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
}

// 内容变化处理
const handleChange = (newValue: string) => {
  state.value.isDirty = true
  saveTextFile(newValue)
}

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
        theme="vs"
        language="plaintext"
        :options="MONACO_EDITOR_OPTIONS"
        @mount="handleMount"
        @change="handleChange"
      />
    </div>
    <TextEditorStatusBar class="text-nowrap" :is-saved="!state.isDirty" :content="state.textContent" />
  </div>
</template>
