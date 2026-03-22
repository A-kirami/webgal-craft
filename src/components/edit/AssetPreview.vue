<script setup lang="ts">
import { AssetPreviewState, useEditorStore } from '~/stores/editor'

interface Props {
  state: AssetPreviewState
}

const props = defineProps<Props>()
const editorStore = useEditorStore()
const mediaElement = useTemplateRef<HTMLMediaElement>('mediaElement')

function resolveMediaTag(mimeType: string): 'audio' | 'video' | undefined {
  if (mimeType.startsWith('video/')) {
    return 'video'
  }

  if (mimeType.startsWith('audio/')) {
    return 'audio'
  }

  return undefined
}

function persistCurrentMediaSession(
  path: string,
  mimeType: string,
  options?: {
    paused?: boolean
  },
) {
  if (!resolveMediaTag(mimeType)) {
    return
  }

  const element = mediaElement.value
  if (!element) {
    return
  }

  editorStore.updatePreviewMediaSession(path, {
    currentTime: element.currentTime,
    paused: options?.paused ?? element.paused,
    playbackRate: element.playbackRate,
    volume: element.volume,
    muted: element.muted,
  })
}

function suspendCurrentMediaSession(path: string, mimeType: string) {
  persistCurrentMediaSession(path, mimeType, { paused: true })
}

const mediaTag = $computed(() => resolveMediaTag(props.state.mimeType))

function handleMediaLoadedMetadata() {
  const session = editorStore.getPreviewMediaSession(props.state.path)
  const element = mediaElement.value
  if (!session || !element) {
    return
  }

  element.playbackRate = session.playbackRate
  element.volume = session.volume
  element.muted = session.muted

  const maxTime = Number.isFinite(element.duration) ? element.duration : session.currentTime
  element.currentTime = Math.min(session.currentTime, maxTime)

  if (!session.paused) {
    void element.play().catch((error) => {
      logger.warn(`资源预览恢复播放失败 (${props.state.path}): ${error}`)
    })
  }
}

function handleMediaSessionChange() {
  persistCurrentMediaSession(props.state.path, props.state.mimeType)
}

watch(() => [props.state.path, props.state.mimeType] as const, ([newPath, newMimeType], [oldPath, oldMimeType]) => {
  if (oldPath && (oldPath !== newPath || oldMimeType !== newMimeType)) {
    suspendCurrentMediaSession(oldPath, oldMimeType)
  }
}, { flush: 'pre' })

onBeforeUnmount(() => {
  suspendCurrentMediaSession(props.state.path, props.state.mimeType)
})
</script>

<template>
  <div class="p-1 flex h-full items-center justify-center overflow-hidden md:p-4 sm:p-2">
    <img v-if="props.state.mimeType.startsWith('image/')" :src="props.state.assetUrl" class="bg-checkerboard max-h-full max-w-full object-contain">
    <component
      :is="mediaTag"
      v-else-if="mediaTag"
      ref="mediaElement"
      :src="props.state.assetUrl"
      controls
      :class="mediaTag === 'video' && 'max-h-full'"
      @ended="handleMediaSessionChange"
      @loadedmetadata="handleMediaLoadedMetadata"
      @pause="handleMediaSessionChange"
      @play="handleMediaSessionChange"
      @ratechange="handleMediaSessionChange"
      @seeked="handleMediaSessionChange"
      @volumechange="handleMediaSessionChange"
    />
  </div>
</template>
