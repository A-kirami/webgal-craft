<script setup lang="ts">
import AssetPreview from './AssetPreview.vue'
import TextEditor from './TextEditor.vue'
import VisualEditor from './VisualEditor.vue'

const editorStore = useEditorStore()
</script>

<template>
  <KeepAlive>
    <TextEditor v-if="editorStore.currentState?.mode === 'text'" v-model:state="editorStore.currentState" />
    <VisualEditor v-else-if="editorStore.currentState?.mode === 'visual'" v-model:state="editorStore.currentState" />
    <AssetPreview v-else-if="editorStore.currentState?.mode === 'preview'" v-model:state="editorStore.currentState" />
  </KeepAlive>
</template>
