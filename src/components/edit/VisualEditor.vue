<script setup lang="ts">
const state = defineModel<VisualModeState>('state', { required: true })

const editorStore = useEditorStore()

useEventListener('keydown', (e: KeyboardEvent) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault()
    editorStore.saveFile(state.value.path)
  }
})
</script>

<template>
  <VisualEditorScene v-if="state.visualType === 'scene'" ::state="state" />
  <VisualEditorAnimation v-else ::state="state" />
</template>
