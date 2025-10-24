<script setup lang="ts">
const state = defineModel<VisualModeState>('state', { required: true })
</script>

<template>
  <VisualEditorScene v-if="state.visualType === 'scene'" />
  <VisualEditorAnimation v-else />
</template>
