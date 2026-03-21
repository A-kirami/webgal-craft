<script setup lang="ts">
interface Props {
  state: VisualProjectionState
}

const props = defineProps<Props>()

const editorStore = useEditorStore()

useEventListener('keydown', (event: KeyboardEvent) => {
  if ((event.ctrlKey || event.metaKey) && event.key === 's') {
    event.preventDefault()
    editorStore.saveFile(props.state.path)
  }
})
</script>

<template>
  <VisualEditorScene v-if="props.state.kind === 'scene'" :state="props.state" />
  <VisualEditorAnimation v-else :state="props.state" />
</template>
