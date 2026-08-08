<script setup lang="ts">
import * as monaco from 'monaco-editor'

import { colorMode } from '~/composables/color-mode'
import { WEBGAL_SCRIPT_LANGUAGE_ID } from '~/features/editor/text-editor/text-editor-language'
import { buildTextEditorOptions } from '~/features/editor/text-editor/text-editor-options'
import { BASE_EDITOR_OPTIONS, THEME_DARK, THEME_LIGHT } from '~/plugins/editor'
import { useEditSettingsStore } from '~/stores/edit-settings'

interface Props {
  modelValue: string
  ariaLabel?: string
}

const props = defineProps<Props>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const editSettings = useEditSettingsStore()
const currentTheme = $computed(() => colorMode.value === 'dark' ? THEME_DARK : THEME_LIGHT)
const editorOptions = $computed<monaco.editor.IEditorConstructionOptions>(() => ({
  ...buildTextEditorOptions(BASE_EDITOR_OPTIONS, {
    fontFamily: editSettings.fontFamily,
    fontSize: editSettings.fontSize,
    minimap: false,
    wordWrap: editSettings.wordWrap,
  }),
  ariaLabel: props.ariaLabel,
  automaticLayout: true,
  lineNumbersMinChars: 3,
  padding: { top: 12, bottom: 12 },
}))

let editorContainer = $ref<HTMLElement>()
let editor = $shallowRef<monaco.editor.IStandaloneCodeEditor>()
let model = $shallowRef<monaco.editor.ITextModel>()
let applyingExternalValue = false

function createEditor(): void {
  if (!editorContainer) {
    return
  }

  model = monaco.editor.createModel(props.modelValue, WEBGAL_SCRIPT_LANGUAGE_ID)
  editor = monaco.editor.create(editorContainer, {
    ...editorOptions,
    model,
    theme: currentTheme,
  })
  editor.onDidChangeModelContent(() => {
    if (!applyingExternalValue) {
      emit('update:modelValue', model?.getValue() ?? '')
    }
  })
}

function updateEditorValue(value: string): void {
  if (!model || model.getValue() === value) {
    return
  }

  applyingExternalValue = true
  model.setValue(value)
  applyingExternalValue = false
}

function disposeEditor(): void {
  editor?.dispose()
  model?.dispose()
  editor = undefined
  model = undefined
}

watch(() => props.modelValue, updateEditorValue)

watch(() => currentTheme, (theme) => {
  if (editor) {
    monaco.editor.setTheme(theme)
  }
})

watch(() => editorOptions, (options) => {
  editor?.updateOptions(options)
})

onMounted(createEditor)
onBeforeUnmount(disposeEditor)
</script>

<template>
  <div
    ref="editorContainer"
    class="h-full min-h-0 w-full overflow-hidden"
  />
</template>
