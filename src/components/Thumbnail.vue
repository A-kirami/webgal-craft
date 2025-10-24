<script setup lang="ts">
import { Ban } from 'lucide-vue-next'

import { cn } from '~/lib/utils'

const props = defineProps<{
  path?: string
  size?: ThumbnailSize
  alt?: string
  fallbackImage?: string
  class?: string
  fit?: 'contain' | 'cover'
}>()

let loading = $ref(true)
let thumbnailUrl = $ref<string | undefined>()

const loadThumbnail = async () => {
  if (!props.path) {
    thumbnailUrl = undefined
    loading = true
    return
  }

  try {
    loading = true
    thumbnailUrl = await thumbnailCmds.getThumbnail(props.path, props.size)
  } catch (error_) {
    const errorMessage = error_ instanceof Error ? error_.message : '加载缩略图失败'
    void logger.error(`[Thumbnail] 缩略图 ${props.path} 加载失败: ${errorMessage}`)
    thumbnailUrl = undefined
  } finally {
    loading = false
  }
}

const handleError = () => {
  void logger.error(`[Thumbnail] 图片加载失败: ${props.path}`)
  thumbnailUrl = undefined
}

watch(() => props.path, () => {
  loadThumbnail()
})

onMounted(() => {
  loadThumbnail()
})

onUnmounted(() => {
  if (thumbnailUrl) {
    URL.revokeObjectURL(thumbnailUrl)
  }
})
</script>

<template>
  <div :class="cn('relative h-full w-full flex items-center justify-center overflow-hidden', props.class)">
    <img
      v-if="thumbnailUrl"
      :src="thumbnailUrl"
      :alt="alt"
      loading="lazy"
      class="h-full w-full"
      :class="[props.fit === 'cover' ? 'object-cover' : 'object-contain']"
      @error="handleError"
    >
    <img
      v-else-if="!loading && fallbackImage"
      :src="fallbackImage"
      :alt="alt"
      loading="lazy"
      class="h-full w-full"
      :class="[props.fit === 'cover' ? 'object-cover' : 'object-contain']"
    >
    <div v-else-if="!loading" class="flex h-full w-full items-center justify-center">
      <Ban class="text-red-500" />
    </div>
    <div v-else class="flex flex-col gap-2 items-center">
      <div class="border-2 border-gray-300 border-t-blue-500 rounded-full size-6 animate-spin" />
    </div>
  </div>
</template>
