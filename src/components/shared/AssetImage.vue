<script setup lang="ts">
defineOptions({
  inheritAttrs: false,
})

import { cn } from '~/lib/utils'
import { getAssetUrl, resolveAssetUrl } from '~/services/platform/asset-url'

import type { AssetThumbnailOptions } from '~/services/platform/asset-url'

const attrs = useAttrs()

const props = withDefaults(defineProps<{
  path?: string
  rootPath?: string
  serveUrl?: string
  cacheVersion?: number
  alt?: string
  fallbackImage?: string
  objectFit?: 'contain' | 'cover'
  thumbnail?: AssetThumbnailOptions
}>(), {
  objectFit: 'contain',
})

let hasLoadError = $ref(false)

const primarySrc = $computed(() => {
  if (!props.path) {
    return
  }

  if (props.rootPath) {
    if (!props.serveUrl) {
      return
    }

    try {
      return resolveAssetUrl(props.path, {
        cwd: props.rootPath,
        cacheVersion: props.cacheVersion,
        previewBaseUrl: props.serveUrl,
        thumbnail: props.thumbnail,
      })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      void logger.error(`[AssetImage] 资源地址生成失败: ${props.path} - ${errorMessage}`)
      return
    }
  }

  try {
    return getAssetUrl(props.path, props.cacheVersion, props.serveUrl, props.thumbnail)
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    void logger.error(`[AssetImage] 资源地址生成失败: ${props.path} - ${errorMessage}`)
    return
  }
})

const displaySrc = $computed(() => {
  if (hasLoadError) {
    return props.fallbackImage
  }

  return primarySrc ?? props.fallbackImage
})

watch(
  () => [
    props.path,
    props.rootPath,
    props.serveUrl,
    props.cacheVersion,
    props.fallbackImage,
    props.thumbnail?.width,
    props.thumbnail?.height,
    props.thumbnail?.resizeMode,
  ],
  () => {
    hasLoadError = false
  },
)

function handleError() {
  hasLoadError = true
  void logger.error(`[AssetImage] 图片加载失败: ${props.path}`)
}
</script>

<template>
  <img
    v-if="displaySrc"
    v-bind="attrs"
    :src="displaySrc"
    :alt="props.alt"
    loading="lazy"
    decoding="async"
    :class="cn('block', props.objectFit === 'cover' ? 'object-cover' : 'object-contain')"
    @error="handleError"
  >
</template>
