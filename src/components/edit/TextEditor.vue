<script setup lang="ts">
import * as monaco from 'monaco-editor'

import { useTextEditorRuntime } from '~/composables/useTextEditorRuntime'
import { buildTextEditorOptions } from '~/helper/text-editor-options'
import { BASE_EDITOR_OPTIONS, THEME_DARK, THEME_LIGHT } from '~/plugins/editor'

import type { TextProjectionState } from '~/stores/editor'

interface Props {
  state: TextProjectionState
}

const props = defineProps<Props>()
const editorStore = useEditorStore()
const tabsStore = useTabsStore()
const editSettings = useEditSettingsStore()

const editorOptions = $computed<monaco.editor.IEditorConstructionOptions>(() =>
  buildTextEditorOptions(BASE_EDITOR_OPTIONS, {
    fontFamily: editSettings.fontFamily,
    fontSize: editSettings.fontSize,
    minimap: editSettings.minimap,
    wordWrap: editSettings.wordWrap,
  }) as monaco.editor.IEditorConstructionOptions,
)

let editor = $shallowRef<monaco.editor.IStandaloneCodeEditor>()
let editorContainer = $ref<HTMLElement>()
const runtime = useTextEditorRuntime({
  editorRef: $$(editor),
  getState: () => props.state,
})

const currentTheme = $computed(() => colorMode.value === 'dark' ? THEME_DARK : THEME_LIGHT)
const isCurrentTextProjectionActive = $computed(() => {
  const currentState = editorStore.currentState
  return currentState !== undefined
    && isEditableEditor(currentState)
    && currentState.projection === 'text'
    && tabsStore.activeTab?.path === props.state.path
})

function createEditor() {
  if (!editorContainer || editor) {
    return
  }

  const initialModel = runtime.ensureModel()

  editor = monaco.editor.create(editorContainer, {
    model: initialModel,
    theme: currentTheme,
    automaticLayout: true,
    autoIndent: 'brackets',
    formatOnPaste: true,
    formatOnType: true,
    ...editorOptions,
  })

  editor.onDidChangeCursorPosition(runtime.handleCursorPositionChange)
  editor.onDidChangeCursorSelection(runtime.handleCursorSelectionChange)
  editor.onDidChangeModelContent(runtime.handleContentChange)
  editor.onDidScrollChange(runtime.handleScrollChange)
  editor.onMouseDown(runtime.handleEditorClick)
  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, runtime.manualSave)

  runtime.handleEditorCreated()
}

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

onMounted(() => {
  if (isCurrentTextProjectionActive) {
    createEditor()
  }
})

watch(() => isCurrentTextProjectionActive, (isActive) => {
  if (isActive) {
    createEditor()
  }
})

onUnmounted(() => {
  if (editor) {
    runtime.handleBeforeUnmount()

    editor.dispose()
    editor = undefined
  }
})
</script>

<template>
  <div ref="editorContainer" class="h-full overflow-hidden" />
</template>
