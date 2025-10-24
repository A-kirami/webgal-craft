<script setup lang="ts">
const state = defineModel<AssetPreviewState>('state', { required: true })
</script>

<template>
  <div class="p-1 flex h-full items-center justify-center overflow-hidden md:p-4 sm:p-2">
    <img v-if="state.mimeType.startsWith('image')" :src="state.assetUrl" class="max-h-full max-w-full object-contain">
    <video v-else-if="state.mimeType.startsWith('video')" :src="state.assetUrl" controls class="max-h-full" />
    <audio v-else-if="state.mimeType.startsWith('audio')" :src="state.assetUrl" controls />
    <div v-else class="text-sm text-gray-500">
      不支持的文件类型
    </div>
  </div>
</template>
