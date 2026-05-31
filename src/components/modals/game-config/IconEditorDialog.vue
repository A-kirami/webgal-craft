<script setup lang="ts">
import { ImagePlus, Info } from '@lucide/vue'

import { Button } from '~/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '~/components/ui/dialog'
import { AbsPath } from '~/domain/path'
import { useIconEditorSession } from '~/features/modals/game-config/icon-editor/useIconEditorSession'

import type { IconPreviewKind } from '~/features/modals/game-config/icon-editor/icon-editor-render'

interface Props {
  gamePath: AbsPath
}

interface PreviewItem {
  key: IconPreviewKind
  label: string
}

const props = defineProps<Props>()
const open = defineModel<boolean>('open', { default: false })

const { t } = useI18n()

const {
  backgroundName,
  backgroundSelectLabel,
  backgroundTransformControls,
  canGenerate,
  foregroundName,
  foregroundSelectLabel,
  foregroundTransformControls,
  generate,
  previewVersion,
  selectBackgroundImage,
  selectForeground,
  setBackgroundColor,
  setBackgroundType,
  setIconShape,
  state,
} = useIconEditorSession({
  gamePath: () => props.gamePath,
  open,
  t,
})

const previewItems = $computed((): PreviewItem[] => [
  { key: 'web', label: t('modals.gameConfig.iconEditor.preview.web') },
  { key: 'web-maskable', label: t('modals.gameConfig.iconEditor.preview.webMaskable') },
  { key: 'desktop', label: t('modals.gameConfig.iconEditor.preview.desktop') },
  { key: 'android-full-bleed', label: t('modals.gameConfig.iconEditor.preview.androidFullBleed') },
  { key: 'android-legacy', label: t('modals.gameConfig.iconEditor.preview.androidLegacy') },
  { key: 'android-round', label: t('modals.gameConfig.iconEditor.preview.androidRound') },
])
</script>

<template>
  <Dialog :open="open" @update:open="open = $event">
    <DialogContent
      data-testid="icon-editor-dialog"
      class="grid grid-rows-[auto_minmax(0,1fr)_auto] h-38rem max-w-228 overflow-hidden"
    >
      <DialogHeader>
        <DialogTitle>{{ $t('modals.gameConfig.iconEditor.title') }}</DialogTitle>
        <DialogDescription>
          {{ $t('modals.gameConfig.iconEditor.description') }}
        </DialogDescription>
      </DialogHeader>

      <div class="gap-5 grid min-h-0 lg:grid-cols-[minmax(18rem,22rem)_minmax(0,1fr)]">
        <ScrollArea class="min-h-0">
          <div class="mr-3 flex flex-col gap-5">
            <section
              class="flex flex-col gap-2.5"
              data-testid="icon-editor-foreground-section"
            >
              <div class="flex gap-3 items-center justify-between">
                <h3 class="text-sm font-medium">
                  {{ $t('modals.gameConfig.iconEditor.foreground.title') }}
                </h3>
                <p
                  v-if="!state.foregroundImage"
                  class="text-xs text-muted-foreground flex gap-1 min-w-0 items-center"
                  data-testid="icon-editor-generate-hint"
                >
                  <Info
                    class="shrink-0 size-3.5"
                    aria-hidden="true"
                    data-testid="icon-editor-generate-hint-icon"
                  />
                  <span class="truncate">{{ $t('modals.gameConfig.iconEditor.generateHint') }}</span>
                </p>
              </div>

              <div class="flex items-center justify-between">
                <p class="text-xs text-muted-foreground min-w-0 truncate">
                  {{ foregroundName }}
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  data-testid="icon-editor-select-foreground"
                  class="shrink-0 h-7 shadow-none"
                  @click="selectForeground"
                >
                  <ImagePlus class="size-3.5" />
                  {{ foregroundSelectLabel }}
                </Button>
              </div>

              <IconEditorTransformControls
                v-if="state.foregroundImage"
                :controls="foregroundTransformControls"
                class="mt-2.5"
                data-testid="icon-editor-foreground-transform-controls"
              />
            </section>

            <section class="pt-4 border-t flex flex-col gap-2.5">
              <h3 class="text-sm font-medium">
                {{ $t('modals.gameConfig.iconEditor.background.title') }}
              </h3>

              <Tabs
                :model-value="state.backgroundType"
                @update:model-value="setBackgroundType"
              >
                <TabsList class="p-0.75 h-8 w-full">
                  <TabsTrigger
                    value="color"
                    class="flex-1 data-[state=active]:shadow-none"
                    data-testid="icon-editor-background-color-tab"
                  >
                    {{ $t('modals.gameConfig.iconEditor.background.color') }}
                  </TabsTrigger>
                  <TabsTrigger
                    value="image"
                    class="flex-1 data-[state=active]:shadow-none"
                    data-testid="icon-editor-background-image-tab"
                  >
                    {{ $t('modals.gameConfig.iconEditor.background.image') }}
                  </TabsTrigger>
                </TabsList>

                <TabsContent
                  value="color"
                  class="mt-2.5"
                  data-testid="icon-editor-background-color-panel"
                >
                  <div class="flex gap-2 items-start">
                    <Label
                      for="icon-editor-background-color-picker"
                      class="text-xs text-muted-foreground pt-1 shrink-0 min-w-0 w-12"
                    >
                      <span class="block truncate">{{ $t('modals.gameConfig.iconEditor.background.color') }}</span>
                    </Label>
                    <div class="flex flex-1 gap-2 min-w-0 items-center">
                      <ColorPicker
                        id="icon-editor-background-color-picker"
                        :model-value="state.backgroundColor"
                        class="h-7 w-24"
                        data-testid="icon-editor-background-color-picker"
                        @update:model-value="setBackgroundColor"
                      />
                    </div>
                  </div>
                </TabsContent>

                <TabsContent
                  value="image"
                  class="mt-2.5"
                  data-testid="icon-editor-background-image-panel"
                >
                  <div class="flex items-center justify-between">
                    <p class="text-xs text-muted-foreground truncate">
                      {{ backgroundName }}
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      data-testid="icon-editor-select-background"
                      class="h-7 shadow-none"
                      @click="selectBackgroundImage"
                    >
                      <ImagePlus class="size-3.5" />
                      {{ backgroundSelectLabel }}
                    </Button>
                  </div>

                  <IconEditorTransformControls
                    v-if="state.backgroundImage"
                    :controls="backgroundTransformControls"
                    class="mt-2.5"
                    data-testid="icon-editor-background-transform-controls"
                  />
                </TabsContent>
              </Tabs>
            </section>
          </div>
        </ScrollArea>

        <section class="flex flex-col gap-2.5 h-full min-h-0">
          <div
            class="flex items-center justify-between"
            data-testid="icon-editor-preview-header"
          >
            <h3 class="text-sm font-medium">
              {{ $t('modals.gameConfig.iconEditor.preview.title') }}
            </h3>
            <Tabs
              :model-value="state.iconShape"
              @update:model-value="setIconShape"
            >
              <TabsList
                class="p-0.5 rounded-md grid grid-cols-3 h-7.5 w-40"
                :aria-label="$t('modals.gameConfig.iconEditor.shape.title')"
              >
                <TabsTrigger
                  value="square"
                  class="text-xs h-full data-[state=active]:shadow-none"
                  data-testid="icon-editor-shape-square-tab"
                >
                  {{ $t('modals.gameConfig.iconEditor.shape.square') }}
                </TabsTrigger>
                <TabsTrigger
                  value="rounded"
                  class="text-xs h-full data-[state=active]:shadow-none"
                  data-testid="icon-editor-shape-rounded-tab"
                >
                  {{ $t('modals.gameConfig.iconEditor.shape.rounded') }}
                </TabsTrigger>
                <TabsTrigger
                  value="circle"
                  class="text-xs h-full data-[state=active]:shadow-none"
                  data-testid="icon-editor-shape-circle-tab"
                >
                  {{ $t('modals.gameConfig.iconEditor.shape.circle') }}
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          <div
            class="rounded-lg bg-muted/20 flex-1 min-h-0 overflow-hidden"
            data-testid="icon-editor-preview-panel"
          >
            <div
              class="flex h-full min-h-0 items-center justify-center"
              data-testid="icon-editor-preview-viewport"
            >
              <div
                class="gap-x-4 gap-y-3 grid grid-cols-3 grid-rows-2 max-w-[38rem] w-full content-center justify-items-center"
                data-testid="icon-editor-preview-grid"
              >
                <article
                  v-for="preview in previewItems"
                  :key="`${preview.key}-${previewVersion}`"
                  class="flex max-w-[clamp(8rem,22vh,11rem)] min-w-0 w-full items-center"
                  data-testid="icon-editor-preview-item"
                >
                  <div
                    class="border rounded-md bg-card flex flex-col w-full shadow-xs overflow-hidden"
                    data-testid="icon-editor-preview-card"
                  >
                    <div
                      class="bg-checkerboard flex w-full aspect-square items-center justify-center overflow-hidden"
                      data-testid="icon-editor-preview-canvas-frame"
                    >
                      <IconEditorPreviewCanvas
                        :state="state"
                        :kind="preview.key"
                        :label="preview.label"
                        class="size-full"
                      />
                    </div>
                    <p
                      class="text-xs text-muted-foreground font-medium px-2 py-1.5 text-center border-t max-w-full truncate"
                      data-testid="icon-editor-preview-label"
                    >
                      {{ preview.label }}
                    </p>
                  </div>
                </article>
              </div>
            </div>
          </div>
        </section>
      </div>

      <DialogFooter data-testid="icon-editor-dialog-footer">
        <Button
          type="button"
          :disabled="!canGenerate"
          data-testid="icon-editor-generate"
          @click="generate"
        >
          {{ $t('modals.gameConfig.iconEditor.generate') }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
