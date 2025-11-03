<script setup lang="ts">
import { VueMonacoEditor } from '@guolao/vue-monaco-editor'
import * as monaco from 'monaco-editor'

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

// 编辑器挂载回调
const handleMount = (editorInstance: monaco.editor.IStandaloneCodeEditor) => {
  editor = editorInstance

  // 监听光标位置变化
  editor.onDidChangeCursorPosition(() => {
    if (state.value.path) {
      interactedPaths.add(state.value.path)
    }
  })
}

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
      />
    </div>
    <TextEditorStatusBar class="text-nowrap" :is-saved="!state.isDirty" :content="state.textContent" />
  </div>
</template>
