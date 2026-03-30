<script setup lang="ts">
import { FileImage } from 'lucide-vue-next'

import {
  getFileViewerImageDimensionsCacheKey,
  loadFileViewerImageDimensions,
} from '~/components/file-viewer/fileViewerImageDimensions'
import { HoverCard, HoverCardContent, HoverCardTrigger } from '~/components/ui/hover-card'

import type { FileViewerImageDimensions } from '~/components/file-viewer/fileViewerImageDimensions'
import type { FileViewerItem, FileViewerPreviewSize } from '~/types/file-viewer'

interface FileViewerImageHoverCardProps {
  closeDelay?: number
  item: FileViewerItem
  open?: boolean
  resolvePreviewUrl?: (item: FileViewerItem, previewSize: FileViewerPreviewSize) => string | undefined
  previewSize?: FileViewerPreviewSize
  side?: 'top' | 'right'
}

const DEFAULT_PREVIEW_SIZE = Object.freeze({
  width: 256,
  height: 256,
})

const props = defineProps<FileViewerImageHoverCardProps>()
const emit = defineEmits<{
  'update:open': [open: boolean]
}>()

const hoverCardContentStyle = Object.freeze({
  maxWidth: 'calc(100vw - 2rem)',
})

let imageDimensions = $ref<FileViewerImageDimensions>()
let displayPreviewUrl = $ref<string>()
let isPreviewLoaded = $ref(false)
let uncontrolledOpen = $ref(false)

const isEnabled = $computed(() =>
  !props.item.isDir
  && !!props.item.mimeType?.startsWith('image/')
  && !!props.resolvePreviewUrl,
)

const currentOpen = $computed(() => props.open ?? uncontrolledOpen)
const resolvedPreviewSize = $computed(() => props.previewSize ?? DEFAULT_PREVIEW_SIZE)

const previewFrameStyle = $computed(() => {
  if (!displayPreviewUrl) {
    return
  }

  const frameSize = getPreviewFrameSize(imageDimensions, resolvedPreviewSize)
  return {
    width: `${frameSize.width}px`,
    height: `${frameSize.height}px`,
  }
})

watch(
  () => {
    return [
      props.item.path,
      props.item.modifiedAt,
      resolvedPreviewSize.width,
      resolvedPreviewSize.height,
    ] as const
  },
  () => {
    displayPreviewUrl = undefined
    imageDimensions = undefined
    isPreviewLoaded = false

    initializePreview()
  },
  { immediate: true },
)

watch(() => currentOpen, (nextOpen) => {
  if (nextOpen) {
    initializePreview()
  }
}, { immediate: true })

function initializePreview(): void {
  if (!currentOpen || !isEnabled) {
    return
  }

  if (!displayPreviewUrl) {
    updateDisplayPreviewUrl()
  }

  void ensureImageDimensions()
}

function updateDisplayPreviewUrl(): void {
  if (!isEnabled) {
    return
  }

  try {
    displayPreviewUrl = props.resolvePreviewUrl?.(props.item, resolvedPreviewSize)
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    void logger.error(`[FileViewer] 资源地址生成失败: ${props.item.path} - ${errorMessage}`)
    displayPreviewUrl = undefined
  }
}

async function ensureImageDimensions(): Promise<void> {
  if (!isEnabled || imageDimensions) {
    return
  }

  const requestKey = getFileViewerImageDimensionsCacheKey(props.item)
  const dimensions = await loadFileViewerImageDimensions(props.item)

  if (requestKey !== getFileViewerImageDimensionsCacheKey(props.item)) {
    return
  }

  imageDimensions = dimensions
}

function handleOpenChange(nextOpen: boolean): void {
  if (props.open === undefined) {
    uncontrolledOpen = nextOpen
  }

  emit('update:open', nextOpen)
}

function handlePreviewLoad(): void {
  isPreviewLoaded = true
}

function handlePreviewError(): void {
  displayPreviewUrl = undefined
  isPreviewLoaded = false
  void logger.error(`[FileViewer] 悬浮预览加载失败: ${props.item.path}`)
}

function getPreviewFrameSize(
  imageDimensions: FileViewerImageDimensions | undefined,
  previewSize: FileViewerPreviewSize,
): FileViewerPreviewSize {
  if (!imageDimensions) {
    return previewSize
  }

  const scale = Math.min(
    previewSize.width / imageDimensions.width,
    previewSize.height / imageDimensions.height,
    1,
  )

  return {
    width: Math.max(Math.round(imageDimensions.width * scale), 1),
    height: Math.max(Math.round(imageDimensions.height * scale), 1),
  }
}
</script>

<template>
  <HoverCard
    v-if="isEnabled"
    :close-delay="props.closeDelay ?? 120"
    :open="props.open"
    :open-delay="350"
    @update:open="handleOpenChange"
  >
    <HoverCardTrigger as-child>
      <slot />
    </HoverCardTrigger>
    <HoverCardContent
      :side="props.side ?? 'top'"
      align="center"
      class="p-2 w-fit"
      :style="hoverCardContentStyle"
      data-file-viewer-hover-preview="true"
    >
      <div class="flex flex-col gap-1.5">
        <div
          v-if="displayPreviewUrl"
          data-testid="hover-card-media-frame"
          :class="[
            'rounded-md flex items-center self-center justify-center relative overflow-hidden',
            isPreviewLoaded ? 'bg-checkerboard' : '',
          ]"
          :style="previewFrameStyle"
        >
          <div
            v-if="!isPreviewLoaded"
            class="flex pointer-events-none items-center inset-0 justify-center absolute"
          >
            <FileImage class="text-muted-foreground/60 size-10" :stroke-width="1.25" />
          </div>
          <img
            :alt="props.item.name"
            :src="displayPreviewUrl"
            class="block object-contain"
            decoding="async"
            loading="lazy"
            :style="{
              width: '100%',
              height: '100%',
              opacity: isPreviewLoaded ? 1 : 0,
            }"
            @load="handlePreviewLoad"
            @error="handlePreviewError"
          >
        </div>
        <div
          v-else
          class="p-4 rounded-md bg-muted/40 flex items-center self-center justify-center"
        >
          <FileImage class="text-muted-foreground/80 size-10" :stroke-width="1.25" />
        </div>
        <div
          class="text-center max-w-64 self-center"
        >
          <div class="text-xs text-foreground font-medium truncate" :title="props.item.name">
            {{ props.item.name }}
          </div>
          <div
            v-if="imageDimensions"
            class="text-[11px] text-muted-foreground [font-variant-numeric:tabular-nums]"
          >
            {{ imageDimensions.width }} × {{ imageDimensions.height }}
          </div>
        </div>
      </div>
    </HoverCardContent>
  </HoverCard>
  <slot v-else />
</template>
