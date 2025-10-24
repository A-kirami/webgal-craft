<script setup lang="ts">
const workspaceStore = useWorkspaceStore()
let refreshKey = $ref(0)

function refreshIframe() {
  refreshKey++
}
</script>

<template>
  <div class="bg-muted size-full relative">
    <div v-if="workspaceStore.currentGamePreviewUrl" class="m-auto max-h-full aspect-16/9 inset-0 absolute">
      <iframe
        :key="refreshKey"
        :src="workspaceStore.currentGamePreviewUrl"
        class="size-full"
      />
    </div>
  </div>
</template>
