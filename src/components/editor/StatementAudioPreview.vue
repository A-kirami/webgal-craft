<script setup lang="ts">
import { Pause, Play } from '@lucide/vue'
import WaveSurfer from 'wavesurfer.js'

import type { WaveSurferOptions } from 'wavesurfer.js'

interface Props {
  src: string
}

const props = defineProps<Props>()

const waveformRef = useTemplateRef<HTMLDivElement>('waveformRef')

let waveSurfer = $shallowRef<ReturnType<typeof WaveSurfer.create>>()
let durationSeconds = $ref(0)
let currentTimeSeconds = $ref(0)
let isLoading = $ref(false)
let isPlaying = $ref(false)
let isReady = $ref(false)
let activeSrc = $ref<string>()
let shouldAutoplayWhenReady = $ref(false)

const canTogglePlayback = $computed(() => !!props.src && !isLoading)

const displayTime = $computed(() => {
  return formatAudioTime(Math.max(durationSeconds - currentTimeSeconds, 0))
})

function renderContinuousWaveform(
  channels: Parameters<NonNullable<WaveSurferOptions['renderFunction']>>[0],
  context: Parameters<NonNullable<WaveSurferOptions['renderFunction']>>[1],
) {
  const channel = channels[0]
  const { width, height } = context.canvas
  if (!channel?.length || width <= 0 || height <= 0) {
    return
  }

  const scale = channel.length / width
  const step = 4

  context.save()
  context.lineWidth = 1.5
  context.translate(0, height / 2)
  context.strokeStyle = context.fillStyle
  context.beginPath()

  for (let index = 0; index < width; index += step * 2) {
    const sampleIndex = Math.floor(index * scale)
    const amplitude = Math.abs(channel[sampleIndex] ?? 0)
    let x = index
    let y = (height / 2) * amplitude

    context.moveTo(x, 0)
    context.lineTo(x, y)
    context.arc(x + step / 2, y, step / 2, Math.PI, 0, true)
    context.lineTo(x + step, 0)

    x += step
    y = -y
    context.moveTo(x, 0)
    context.lineTo(x, y)
    context.arc(x + step / 2, y, step / 2, Math.PI, 0, false)
    context.lineTo(x + step, 0)
  }

  context.stroke()
  context.closePath()
  context.restore()
}

function resolveThemeColor(variableName: string, fallbackColor: string): string {
  const rootElement = document.documentElement
  const variableValue = globalThis.getComputedStyle(rootElement).getPropertyValue(variableName).trim()
  if (!variableValue) {
    return fallbackColor
  }

  if (globalThis.CSS?.supports?.('color', variableValue)) {
    return variableValue
  }

  if (variableValue.includes('(') || variableValue.startsWith('#')) {
    return variableValue
  }

  return `oklch(${variableValue})`
}

function softenWaveColor(color: string): string {
  const match = color.match(/^oklch\(\s*([\d.]+)(%?)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*[\d.]+%?)?\s*\)$/)
  if (!match) {
    return color
  }

  const [, rawLightness, lightnessUnit, rawChroma, rawHue] = match
  const parsedLightness = Number.parseFloat(rawLightness)
  const normalizedLightness = lightnessUnit === '%' ? parsedLightness / 100 : parsedLightness
  const chroma = Number.parseFloat(rawChroma)
  const hue = Number.parseFloat(rawHue)
  const softenedLightness = Math.min(0.76, normalizedLightness + (1 - normalizedLightness) * 0.35)
  const softenedChroma = chroma * 0.55

  return `oklch(${softenedLightness.toFixed(3)} ${softenedChroma.toFixed(3)} ${hue})`
}

function formatAudioTime(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) {
    return '0:00'
  }

  const roundedSeconds = Math.floor(totalSeconds)
  const minutes = Math.floor(roundedSeconds / 60)
  const seconds = roundedSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

function syncWaveSurferTime(currentTime?: number) {
  const instance = waveSurfer
  if (!instance) {
    return
  }

  durationSeconds = instance.getDuration()
  currentTimeSeconds = currentTime ?? instance.getCurrentTime()
}

function syncWaveSurferPlaybackState() {
  isPlaying = waveSurfer?.isPlaying() ?? false
}

function resetPlaybackState() {
  durationSeconds = 0
  currentTimeSeconds = 0
  isLoading = false
  isPlaying = false
  isReady = false
  activeSrc = undefined
  shouldAutoplayWhenReady = false
}

function createWaveSurferOptions(container: HTMLDivElement): WaveSurferOptions {
  return {
    backend: 'MediaElement',
    container,
    cursorWidth: 0,
    height: 30,
    hideScrollbar: true,
    interact: true,
    normalize: true,
    progressColor: resolveThemeColor('--primary', 'hsl(221.2 83.2% 53.3%)'),
    renderFunction: renderContinuousWaveform,
    // 不用 alpha，避免 progress 层沿用背景波形的透明度一起变淡。
    waveColor: softenWaveColor(resolveThemeColor('--muted-foreground', 'oklch(0.48 0.02 264)')),
  }
}

function createWaveSurferInstance(container: HTMLDivElement) {
  const instance = WaveSurfer.create(createWaveSurferOptions(container))

  instance.on('ready', () => {
    if (waveSurfer !== instance) {
      return
    }

    isLoading = false
    isReady = true
    syncWaveSurferPlaybackState()
    syncWaveSurferTime()

    if (shouldAutoplayWhenReady) {
      shouldAutoplayWhenReady = false
      void playCurrentSource()
    }
  })
  instance.on('play', () => {
    if (waveSurfer !== instance) {
      return
    }

    syncWaveSurferPlaybackState()
    syncWaveSurferTime()
  })
  instance.on('pause', () => {
    if (waveSurfer !== instance) {
      return
    }

    syncWaveSurferPlaybackState()
    syncWaveSurferTime()
  })
  instance.on('finish', () => {
    if (waveSurfer !== instance) {
      return
    }

    syncWaveSurferPlaybackState()
    const duration = waveSurfer?.getDuration() ?? durationSeconds
    durationSeconds = duration
    currentTimeSeconds = duration
  })
  instance.on('timeupdate', (currentTime) => {
    if (waveSurfer !== instance) {
      return
    }

    syncWaveSurferTime(currentTime)
  })
  instance.on('interaction', (currentTime) => {
    if (waveSurfer !== instance) {
      return
    }

    syncWaveSurferTime(currentTime)
  })

  return instance
}

function destroyWaveSurferInstance() {
  waveSurfer?.destroy()
  waveSurfer = undefined
}

function recreateWaveSurferInstance() {
  destroyWaveSurferInstance()
  resetPlaybackState()

  if (!waveformRef.value) {
    return
  }

  waveSurfer = createWaveSurferInstance(waveformRef.value)
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

async function loadAudioSource(src: string) {
  const instance = waveSurfer
  if (!instance || !src) {
    return
  }

  durationSeconds = 0
  currentTimeSeconds = 0
  isLoading = true
  isPlaying = false
  isReady = false
  activeSrc = src

  try {
    await instance.load(src)
  } catch (error) {
    if (waveSurfer !== instance || isAbortError(error)) {
      return
    }

    isLoading = false
    activeSrc = undefined
    shouldAutoplayWhenReady = false
    logger.warn(`辅助面板音频预览加载失败 (${src}): ${String(error)}`)
  }
}

async function playCurrentSource() {
  const instance = waveSurfer
  const src = activeSrc ?? props.src
  if (!instance || !src) {
    return
  }

  try {
    await instance.play()
  } catch (error) {
    logger.warn(`辅助面板音频预览播放失败 (${src}): ${String(error)}`)
  }
}

async function handleTogglePlayback() {
  const instance = waveSurfer
  if (!instance || !props.src || isLoading) {
    return
  }

  if (!isReady || activeSrc !== props.src) {
    shouldAutoplayWhenReady = true
    await loadAudioSource(props.src)
    return
  }

  if (instance.isPlaying()) {
    instance.pause()
    return
  }

  await playCurrentSource()
}

watch(() => props.src, (newSrc, oldSrc) => {
  if (!waveSurfer || newSrc === oldSrc) {
    return
  }

  recreateWaveSurferInstance()
})

onMounted(() => {
  if (!waveformRef.value) {
    return
  }

  waveSurfer = createWaveSurferInstance(waveformRef.value)
})

onBeforeUnmount(() => {
  destroyWaveSurferInstance()
})
</script>

<template>
  <div class="rounded-md bg-muted/20 flex gap-1.5 h-10 max-w-full w-full items-center">
    <Button
      variant="ghost"
      size="icon-sm"
      data-testid="statement-audio-preview-toggle"
      class="rounded-md shrink-0 size-7"
      :aria-label="!canTogglePlayback
        ? $t('edit.visualEditor.audioPreview.unavailable')
        : isPlaying
          ? $t('edit.visualEditor.audioPreview.pause')
          : $t('edit.visualEditor.audioPreview.play')"
      :disabled="!canTogglePlayback"
      @click="handleTogglePlayback"
    >
      <Pause v-if="isPlaying" class="size-3.5" />
      <Play v-else class="size-3.5 translate-x-0.25" />
    </Button>
    <div class="flex-1 h-full min-w-0 relative overflow-hidden">
      <div
        data-testid="statement-audio-preview-placeholder"
        aria-hidden="true"
        class="flex pointer-events-none origin-center transition-all duration-200 ease-out items-center inset-0 absolute"
        :data-state="isReady ? 'hidden' : 'visible'"
        :class="isReady ? 'opacity-0 scale-y-75' : 'opacity-100 scale-y-100'"
      >
        <div data-testid="statement-audio-preview-placeholder-line" class="rounded-full bg-muted-foreground/20 h-[1.5px] w-full" />
      </div>
      <div
        ref="waveformRef"
        data-testid="statement-audio-preview-waveform"
        class="h-full w-full origin-center transition-all duration-200 ease-out relative"
        :data-state="isReady ? 'ready' : 'loading'"
        :class="isReady ? 'opacity-100 scale-y-100' : 'pointer-events-none opacity-0 scale-y-75'"
      />
    </div>
    <span
      data-testid="statement-audio-preview-time"
      class="text-xs text-muted-foreground shrink-0 tabular-nums"
    >
      {{ displayTime }}
    </span>
  </div>
</template>
