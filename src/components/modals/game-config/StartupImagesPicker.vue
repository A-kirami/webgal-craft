<script setup lang="ts">
import { Plus, X } from 'lucide-vue-next'

import { GAME_CONFIG_IMAGE_EXTENSIONS } from '~/features/modals/game-config/game-config-images'

interface StartupImagesPickerProps {
  backgroundRootPath: string
  gamePath: string
  serveUrl?: string
}

const {
  backgroundRootPath,
  gamePath,
  serveUrl,
} = defineProps<StartupImagesPickerProps>()

let modelValue = $(defineModel<string[]>({ default: () => [] }))
let addPickerValue = $ref('')

const STARTUP_THUMBNAIL = {
  width: 480,
  height: 270,
  resizeMode: 'cover',
} as const

function buildPreviewPath(fileName: string): string {
  return `game/background/${fileName}`
}

function handleAddImage(fileName: string) {
  if (!fileName) {
    return
  }

  if (modelValue.includes(fileName)) {
    addPickerValue = ''
    return
  }

  modelValue = [...modelValue, fileName]
  addPickerValue = ''
}

function handleRemoveImage(index: number) {
  modelValue = modelValue.filter((_, imageIndex) => imageIndex !== index)
}
</script>

<template>
  <section class="gap-3 grid">
    <div class="flex gap-3 items-end justify-between">
      <div class="space-y-1">
        <div class="font-medium">
          {{ $t('modals.gameConfig.startupImages.label') }}
        </div>
        <p class="text-sm text-muted-foreground">
          {{ $t('modals.gameConfig.startupImages.description') }}
        </p>
      </div>
      <span class="text-xs text-muted-foreground whitespace-nowrap">
        {{ $t('modals.gameConfig.startupImages.count', { count: modelValue.length }) }}
      </span>
    </div>

    <ScrollArea data-testid="startup-images-scroll-area" class="pr-1 max-h-[10rem] -mt-2">
      <div class="px-1.5 pt-2 gap-3 grid grid-cols-3 content-start">
        <article
          v-for="(fileName, index) in modelValue"
          :key="fileName"
        >
          <div class="bg-muted/30 aspect-video relative">
            <AssetImage
              :path="buildPreviewPath(fileName)"
              :root-path="gamePath"
              :serve-url="serveUrl"
              :thumbnail="STARTUP_THUMBNAIL"
              :alt="$t('modals.gameConfig.startupImages.previewAlt')"
              fallback-image="/placeholder.svg"
              object-fit="cover"
              class="rounded-md h-full w-full"
            />

            <Button
              type="button"
              size="icon"
              variant="secondary"
              class="text-muted-foreground border-2 border-background rounded-full bg-muted size-6 shadow-none absolute hover:text-destructive focus-visible:border-background hover:bg-muted -right-2 -top-2"
              :aria-label="$t('modals.gameConfig.startupImages.remove')"
              @click="handleRemoveImage(index)"
            >
              <X class="size-3.5" />
            </Button>
          </div>
        </article>

        <FilePicker
          :model-value="addPickerValue"
          :root-path="backgroundRootPath"
          :extensions="GAME_CONFIG_IMAGE_EXTENSIONS"
          :popover-title="$t('modals.gameConfig.startupImages.pickerTitle')"
          @update:model-value="handleAddImage"
        >
          <template #trigger>
            <button
              type="button"
              class="group text-sm text-muted-foreground border rounded-md border-dashed bg-muted/20 flex flex-col gap-2 w-full aspect-video transition-colors items-center justify-center hover:text-foreground hover:border-primary/40"
              :aria-label="$t('modals.gameConfig.startupImages.add')"
            >
              <Plus class="size-4" />
              <span>{{ $t('modals.gameConfig.startupImages.add') }}</span>
            </button>
          </template>
        </FilePicker>
      </div>
    </ScrollArea>
  </section>
</template>
