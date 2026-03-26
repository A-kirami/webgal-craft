<script setup lang="ts">
interface Props {
  /** 资源的完整 URL */
  src: string
}

const props = defineProps<Props>()

let naturalWidth = $ref(0)
let naturalHeight = $ref(0)
let loaded = $ref(false)
let error = $ref(false)

watch(
  () => props.src,
  () => {
    loaded = false
    error = false
    naturalWidth = 0
    naturalHeight = 0
  },
)

function handleLoad(e: Event) {
  const img = e.target as HTMLImageElement
  naturalWidth = img.naturalWidth
  naturalHeight = img.naturalHeight
  loaded = true
  error = false
}

function handleError() {
  loaded = false
  error = true
}
</script>

<template>
  <div class="flex flex-col gap-1.5 items-center">
    <!-- 图片加载成功：边框贴合图片比例 -->
    <div
      v-if="loaded"
      class="bg-checkerboard border rounded-md max-w-full overflow-hidden"
    >
      <img
        :src="src"
        :alt="src"
        class="h-auto max-h-48 max-w-full block"
        @error="handleError"
      >
    </div>
    <!-- 加载中 / 失败占位 -->
    <div
      v-else
      class="border rounded-md bg-muted/30 w-full overflow-hidden"
    >
      <img
        :src="src"
        class="hidden"
        @load="handleLoad"
        @error="handleError"
      >
      <div
        v-if="!error"
        class="text-muted-foreground flex h-24 items-center justify-center"
      >
        <div class="i-lucide-loader-circle size-4 animate-spin" />
      </div>
      <div
        v-else
        class="text-xs text-muted-foreground flex gap-1.5 h-24 items-center justify-center"
      >
        <div class="i-lucide-image-off size-3.5" />
        {{ $t('edit.visualEditor.assetPreview.loadFailed') }}
      </div>
    </div>
    <!-- 分辨率 -->
    <span v-if="loaded" class="text-xs text-muted-foreground tabular-nums">
      {{ naturalWidth }} × {{ naturalHeight }}
    </span>
  </div>
</template>
