<script setup lang="ts">
import { GAME_CONFIG_IMAGE_EXTENSIONS } from '~/features/modals/game-config/game-config-images'

interface TitleImgPickerProps {
  backgroundRootPath: string
  gamePath: string
  serveUrl?: string
}

const {
  backgroundRootPath,
  gamePath,
  serveUrl,
} = defineProps<TitleImgPickerProps>()

let modelValue = $(defineModel<string>({ default: '' }))

const COVER_THUMBNAIL = {
  width: 480,
  height: 270,
  resizeMode: 'cover',
} as const

const hasImage = $computed(() => modelValue.length > 0)
const previewPath = $computed(() => hasImage ? `game/background/${modelValue}` : '')
</script>

<template>
  <div class="max-w-xs w-full">
    <FilePicker
      ::="modelValue"
      :root-path="backgroundRootPath"
      :extensions="GAME_CONFIG_IMAGE_EXTENSIONS"
      :popover-title="$t('modals.gameConfig.titleImg.pickerTitle')"
    >
      <template #trigger>
        <button
          type="button"
          class="group text-left w-full"
          :aria-label="hasImage
            ? $t('modals.gameConfig.titleImg.replace')
            : $t('modals.gameConfig.titleImg.pickerTitle')"
        >
          <div
            data-testid="title-img-surface"
            :class="[
              'border rounded-md bg-muted/30 aspect-video relative overflow-hidden',
              !hasImage && 'border-dashed transition-colors duration-200 group-focus-visible:border-primary/40 group-focus-visible:bg-muted/50 group-hover:border-primary/40 group-hover:bg-muted/50',
            ]"
          >
            <AssetImage
              v-if="hasImage"
              :path="previewPath"
              :root-path="gamePath"
              :serve-url="serveUrl"
              :thumbnail="COVER_THUMBNAIL"
              :alt="$t('modals.gameConfig.titleImg.previewAlt')"
              fallback-image="/placeholder.svg"
              object-fit="cover"
              class="h-full w-full"
            />

            <div
              v-if="!hasImage"
              class="text-sm text-muted-foreground px-6 text-center border-dashed flex h-full items-center justify-center"
            >
              {{ $t('modals.gameConfig.titleImg.empty') }}
            </div>

            <div
              v-if="hasImage"
              class="bg-black/0 flex transition-colors duration-200 items-center inset-0 justify-center absolute group-focus-visible:bg-black/45 group-hover:bg-black/45"
            >
              <span class="text-sm font-medium px-4 py-2 rounded-full bg-background/95 opacity-0 shadow-sm transition-opacity duration-200 group-focus-visible:opacity-100 group-hover:opacity-100">
                {{ $t('modals.gameConfig.titleImg.replace') }}
              </span>
            </div>
          </div>
        </button>
      </template>
    </FilePicker>
  </div>
</template>
