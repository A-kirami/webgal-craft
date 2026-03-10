<script setup lang="ts">
const state = defineModel<VisualModeAnimationState>('state', { required: true })
</script>

<template>
  <div>{{ state.rawContent }}</div>
</template>
