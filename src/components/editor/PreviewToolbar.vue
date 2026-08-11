<script setup lang="ts">
import { ExternalLink, Lightbulb, LightbulbOff, RotateCw, Volume1, Volume2, Volume, VolumeX } from '@lucide/vue'

import { usePreferenceStore } from '~/stores/preference'

import type { PreviewConnectionStatus } from '~/stores/preview-sync'

interface Props {
  connectionStatus: PreviewConnectionStatus
  previewAvailable: boolean
}

interface Emits {
  openInBrowser: []
  refresh: []
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()
const preferenceStore = usePreferenceStore()
const { t } = useI18n()
const controlsCloseDelay = 100
type PreviewOutputControl = 'brightness' | 'volume'
type PreviewOutputControlOpenSource = 'keyboard' | 'pointer'
let activeOutputControl = $ref<PreviewOutputControl>()
let activeOutputControlOpenSource = $ref<PreviewOutputControlOpenSource>()

const volumeControlsOpen = $computed(() => activeOutputControl === 'volume')
const brightnessControlsOpen = $computed(() => activeOutputControl === 'brightness')

function createControlsCloseDelay(close: () => void) {
  let timeoutId: ReturnType<typeof setTimeout> | undefined

  function cancel(): void {
    if (timeoutId === undefined) {
      return
    }

    clearTimeout(timeoutId)
    timeoutId = undefined
  }

  function schedule(): void {
    cancel()
    timeoutId = setTimeout(() => {
      timeoutId = undefined
      close()
    }, controlsCloseDelay)
  }

  onScopeDispose(cancel)

  return { cancel, schedule }
}

const volumeControlsClose = createControlsCloseDelay(() => {
  closeOutputControl('volume')
})
const brightnessControlsClose = createControlsCloseDelay(() => {
  closeOutputControl('brightness')
})

const statusLabel = $computed(() => {
  switch (props.connectionStatus) {
    case 'connected': {
      return t('edit.previewPanel.connected')
    }
    case 'failed': {
      return t('edit.previewPanel.connectionFailed')
    }
    default: {
      return t('edit.previewPanel.connecting')
    }
  }
})
const statusDotClass = $computed(() => ({
  connected: 'bg-emerald-500',
  connecting: 'bg-blue-500',
  failed: 'bg-red-500',
})[props.connectionStatus])
const volumeButtonLabel = $computed(() => preferenceStore.previewMuted
  ? t('edit.previewPanel.unmute')
  : t('edit.previewPanel.mute'))
const brightnessButtonLabel = $computed(() => preferenceStore.previewBrightnessEnabled
  ? t('edit.previewPanel.disableBrightness')
  : t('edit.previewPanel.enableBrightness'))

function toggleMute(event: MouseEvent): void {
  preferenceStore.previewMuted = !preferenceStore.previewMuted
  volumeControlsClose.cancel()
  if (preferenceStore.previewMuted) {
    closeOutputControl('volume')
    return
  }

  showOutputControl('volume', getOutputControlOpenSource(event))
}

function toggleBrightness(event: MouseEvent): void {
  preferenceStore.previewBrightnessEnabled = !preferenceStore.previewBrightnessEnabled
  brightnessControlsClose.cancel()
  if (!preferenceStore.previewBrightnessEnabled) {
    closeOutputControl('brightness')
    return
  }

  showOutputControl('brightness', getOutputControlOpenSource(event))
}

function handleVolumeControlsOpenChange(open: boolean): void {
  volumeControlsClose.cancel()
  if (open && !preferenceStore.previewMuted) {
    showOutputControl('volume', 'pointer')
    return
  }

  closeOutputControl('volume')
}

function handleBrightnessControlsOpenChange(open: boolean): void {
  brightnessControlsClose.cancel()
  if (open && preferenceStore.previewBrightnessEnabled) {
    showOutputControl('brightness', 'pointer')
    return
  }

  closeOutputControl('brightness')
}

function showVolumeControls(): void {
  volumeControlsClose.cancel()
  if (!preferenceStore.previewMuted) {
    showOutputControl('volume', 'pointer')
  }
}

function showBrightnessControls(): void {
  brightnessControlsClose.cancel()
  if (preferenceStore.previewBrightnessEnabled) {
    showOutputControl('brightness', 'pointer')
  }
}

function getOutputControlOpenSource(event: MouseEvent): PreviewOutputControlOpenSource {
  return event.detail === 0 ? 'keyboard' : 'pointer'
}

function handleOutputControlOpenAutoFocus(event: Event): void {
  if (activeOutputControlOpenSource !== 'keyboard') {
    event.preventDefault()
  }
}

function showOutputControl(control: PreviewOutputControl, openSource: PreviewOutputControlOpenSource): void {
  volumeControlsClose.cancel()
  brightnessControlsClose.cancel()
  activeOutputControl = control
  activeOutputControlOpenSource = openSource
}

function closeOutputControl(control: PreviewOutputControl): void {
  if (activeOutputControl === control) {
    activeOutputControl = undefined
    activeOutputControlOpenSource = undefined
  }
}
</script>

<template>
  <div data-testid="preview-toolbar" class="px-2 py-1 flex flex-shrink-0 gap-2 items-center justify-between">
    <div class="flex flex-1 min-w-0 items-center overflow-hidden">
      <h2 class="text-sm text-foreground font-medium px-1.5 min-w-0 truncate">
        {{ $t('edit.previewPanel.preview') }}
      </h2>
      <div
        role="status"
        aria-live="polite"
        data-testid="preview-connection-status"
        class="text-xs text-muted-foreground px-1.5 flex gap-1.5 h-6 min-w-0 items-center overflow-hidden"
        :data-status="connectionStatus"
      >
        <span class="flex shrink-0 size-2 relative" aria-hidden="true">
          <span
            v-if="connectionStatus === 'connecting'"
            class="rounded-full bg-blue-500 opacity-70 inline-flex size-full absolute animate-ping"
          />
          <span class="rounded-full inline-flex size-2 relative" :class="statusDotClass" />
        </span>
        <span class="truncate">{{ statusLabel }}</span>
      </div>
    </div>

    <TooltipProvider>
      <div data-testid="preview-toolbar-actions" class="text-muted-foreground flex flex-shrink-0 gap-1">
        <Popover
          :open="volumeControlsOpen"
          @update:open="handleVolumeControlsOpenChange"
        >
          <PopoverTrigger as-child>
            <Button
              variant="ghost"
              size="icon"
              class="size-6"
              :aria-label="volumeButtonLabel"
              :aria-pressed="preferenceStore.previewMuted"
              @click="toggleMute"
              @pointerenter="showVolumeControls"
              @pointerleave="volumeControlsClose.schedule"
            >
              <VolumeX
                v-if="preferenceStore.previewMuted"
                data-testid="preview-volume-muted-icon"
                class="size-4"
              />
              <Volume
                v-else-if="preferenceStore.previewVolume[0] === 0"
                data-testid="preview-volume-zero-icon"
                class="size-4"
              />
              <Volume1 v-else-if="preferenceStore.previewVolume[0] < 50" class="size-4" />
              <Volume2 v-else class="size-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent
            side="bottom"
            align="end"
            class="p-3 w-48"
            :style="{ pointerEvents: volumeControlsOpen ? undefined : 'none' }"
            @open-auto-focus="handleOutputControlOpenAutoFocus"
            @close-auto-focus.prevent
            @pointerenter="volumeControlsClose.cancel"
            @pointerleave="volumeControlsClose.schedule"
          >
            <div class="text-xs mb-2 flex items-center justify-between">
              <span>{{ $t('edit.previewPanel.volume') }}</span>
              <output class="font-mono tabular-nums">{{ preferenceStore.previewVolume[0] }}%</output>
            </div>
            <Slider
              ::="preferenceStore.previewVolume"
              data-testid="preview-volume-slider"
              :min="0"
              :max="100"
              :step="1"
              :aria-label="$t('edit.previewPanel.volume')"
            />
          </PopoverContent>
        </Popover>

        <Popover
          :open="brightnessControlsOpen"
          @update:open="handleBrightnessControlsOpenChange"
        >
          <PopoverTrigger as-child>
            <Button
              variant="ghost"
              size="icon"
              class="size-6"
              :aria-label="brightnessButtonLabel"
              :aria-pressed="preferenceStore.previewBrightnessEnabled"
              @click="toggleBrightness"
              @pointerenter="showBrightnessControls"
              @pointerleave="brightnessControlsClose.schedule"
            >
              <Lightbulb v-if="preferenceStore.previewBrightnessEnabled" class="size-4" />
              <LightbulbOff v-else class="size-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent
            side="bottom"
            align="end"
            class="p-3 w-48"
            :style="{ pointerEvents: brightnessControlsOpen ? undefined : 'none' }"
            @open-auto-focus="handleOutputControlOpenAutoFocus"
            @close-auto-focus.prevent
            @pointerenter="brightnessControlsClose.cancel"
            @pointerleave="brightnessControlsClose.schedule"
          >
            <div class="text-xs mb-2 flex items-center justify-between">
              <span>{{ $t('edit.previewPanel.brightness') }}</span>
              <output class="font-mono tabular-nums">{{ preferenceStore.previewBrightness[0] }}%</output>
            </div>
            <Slider
              ::="preferenceStore.previewBrightness"
              data-testid="preview-brightness-slider"
              :min="0"
              :max="100"
              :step="1"
              :disabled="!preferenceStore.previewBrightnessEnabled"
              :aria-label="$t('edit.previewPanel.brightness')"
            />
          </PopoverContent>
        </Popover>

        <Tooltip>
          <TooltipTrigger as-child>
            <Button
              variant="ghost"
              size="icon"
              class="size-6"
              :disabled="!previewAvailable"
              @click="emit('refresh')"
            >
              <RotateCw class="size-4" />
              <span class="sr-only">{{ $t('edit.previewPanel.refreshPreview') }}</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>{{ $t('edit.previewPanel.refreshPreview') }}</p>
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger as-child>
            <Button
              variant="ghost"
              size="icon"
              class="size-6"
              :disabled="!previewAvailable"
              @click="emit('openInBrowser')"
            >
              <ExternalLink class="size-4" />
              <span class="sr-only">{{ $t('edit.previewPanel.openInBrowser') }}</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>{{ $t('edit.previewPanel.openInBrowser') }}</p>
          </TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  </div>
</template>
