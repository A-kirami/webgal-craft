<script setup lang="ts">
import AssetPreview from './AssetPreview.vue'
import TextEditor from './TextEditor.vue'
import VisualEditor from './VisualEditor.vue'

const editorStore = useEditorStore()

const editorMap = {
  text: TextEditor,
  visual: VisualEditor,
  preview: AssetPreview,
} as const

const currentEditor = $computed(() => {
  const mode = editorStore.currentState?.mode
  return mode ? editorMap[mode] : undefined
})
</script>

<template>
  <KeepAlive>
    <component :is="currentEditor" ::state="editorStore.currentState" />
  </KeepAlive>
</template>
