<script setup lang="ts">
import { EllipsisVertical, LayoutTemplate } from '@lucide/vue'

import type { TemplateCollectionItem } from '~/features/home/home-collection-items'
import type {
  StandaloneTemplateSourceItem,
  TemplateGroupSourceItem,
} from '~/features/home/templates-tab/template-groups'
import type { AssetThumbnailOptions } from '~/services/platform/asset-url'
import type { MenuItem } from '~/types/menu-item'

interface Props {
  item: TemplateCollectionItem
  viewMode: 'grid' | 'list'
  menuItems: MenuItem[]
  hasProgress: boolean
  progress: number
}

const { item, viewMode, menuItems, hasProgress, progress } = defineProps<Props>()
const { t } = useI18n()

const emit = defineEmits<{
  openSourceFolder: [source: TemplateGroupSourceItem]
}>()

const GRID_ICON_THUMBNAIL: AssetThumbnailOptions = { width: 120, height: 120, resizeMode: 'cover' }
const LIST_ICON_THUMBNAIL: AssetThumbnailOptions = { width: 80, height: 80, resizeMode: 'cover' }

const isEngineBuiltin = $computed(() => item.templateGroup.sourceKind === 'engineBuiltin')

const showEngineIcon = $computed(() =>
  isEngineBuiltin && !!item.representativeEngineItem?.serveUrl,
)

const sourceKindLabel = $computed(() => {
  switch (item.templateGroup.sourceKind) {
    case 'standalone': { return t('home.templates.sourceKind.standalone') }
    case 'engineBuiltin': { return t('home.templates.sourceKind.engineBuiltin') }
    default: { return '' }
  }
})

const metadataText = $computed(() => {
  const group = item.templateGroup
  if (group.sourceKind === 'standalone') {
    const standalone = group.sources.find(
      (source): source is StandaloneTemplateSourceItem => source.kind === 'standalone',
    )
    return standalone?.webgalVersion
      ? t('home.templates.compatibilityVersion', { version: standalone.webgalVersion })
      : ''
  }
  return t('home.templates.sourceSummary.engineBuiltin', { count: group.sources.length })
})

const iconThumbnail = $computed(() =>
  viewMode === 'grid' ? GRID_ICON_THUMBNAIL : LIST_ICON_THUMBNAIL,
)
</script>

<template>
  <ContextMenu>
    <ContextMenuTrigger as-child :disabled="menuItems.length === 0">
      <Card
        v-if="viewMode === 'grid'"
        class="rounded-lg shadow-sm relative"
        :class="{ 'cursor-wait': hasProgress }"
      >
        <CardContent class="p-3 flex flex-col gap-1">
          <div class="flex gap-4 items-start justify-between">
            <div class="flex flex-1 gap-4 min-w-0 items-stretch">
              <div
                class="rounded-md flex shrink-0 h-12 w-12 items-center justify-center overflow-hidden"
                :class="{ 'bg-muted': !showEngineIcon }"
              >
                <AssetImage
                  v-if="showEngineIcon"
                  :path="item.representativeEngineItem!.engine.previewAssets.icon.path"
                  :root-path="item.representativeEngineItem!.engine.path"
                  :serve-url="item.representativeEngineItem!.serveUrl"
                  :alt="$t('home.engines.engineIcon', { name: item.templateGroup.name })"
                  :cache-version="item.representativeEngineItem!.engine.previewAssets.icon.cacheVersion"
                  object-fit="cover"
                  fallback-image="/placeholder.svg"
                  :thumbnail="iconThumbnail"
                  class="h-full w-full"
                />
                <LayoutTemplate v-else aria-hidden="true" class="text-muted-foreground size-6.5" />
              </div>

              <div class="flex flex-1 flex-col min-w-0 justify-between">
                <div class="flex flex-wrap gap-2 items-center">
                  <h4 class="font-medium truncate">
                    {{ item.templateGroup.name }}
                  </h4>
                  <Badge v-if="isEngineBuiltin" variant="secondary">
                    {{ sourceKindLabel }}
                  </Badge>
                </div>

                <Popover v-if="isEngineBuiltin">
                  <PopoverTrigger as-child>
                    <Button variant="ghost" class="text-[13px] text-muted-foreground font-normal mt-1 p-0 text-left h-auto w-fit">
                      <span>{{ metadataText }}</span>
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="start" class="px-3 py-2 w-56">
                    <TemplateSourcesPopoverContent
                      :sources="item.templateGroup.sources"
                      @open-source-folder="source => emit('openSourceFolder', source)"
                    />
                  </PopoverContent>
                </Popover>
                <p
                  v-else-if="metadataText"
                  class="text-13px text-muted-foreground"
                >
                  {{ metadataText }}
                </p>
              </div>
            </div>

            <DropdownMenu v-if="menuItems.length > 0">
              <DropdownMenuTrigger as-child>
                <Button :aria-label="$t('home.templates.actions.more')" variant="ghost" size="icon" class="shrink-0 h-8 w-8">
                  <EllipsisVertical class="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" class="text-13px w-44">
                <DropdownMenuItem
                  v-for="(menuItem, menuIndex) in menuItems"
                  :key="menuIndex"
                  :class="menuItem.class"
                  :disabled="menuItem.disabled"
                  @click="menuItem.onClick"
                >
                  <component :is="menuItem.icon" class="mr-2 size-3.5" />
                  {{ menuItem.label }}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </CardContent>

        <Progress
          v-if="hasProgress"
          :model-value="progress"
          class="rounded-none h-1 inset-x-0 bottom-0 absolute"
        />
      </Card>

      <div
        v-else
        class="p-3 flex transition-colors duration-200 items-center justify-between relative hover:bg-primary/5 dark:hover:bg-primary/10"
        :class="{ 'cursor-wait': hasProgress }"
      >
        <div class="flex flex-1 gap-3 min-w-0 items-center">
          <div
            class="rounded-md flex shrink-0 h-10 w-10 items-center justify-center overflow-hidden"
            :class="{ 'bg-muted': !showEngineIcon }"
          >
            <AssetImage
              v-if="showEngineIcon"
              :path="item.representativeEngineItem!.engine.previewAssets.icon.path"
              :root-path="item.representativeEngineItem!.engine.path"
              :serve-url="item.representativeEngineItem!.serveUrl"
              :alt="$t('home.engines.engineIcon', { name: item.templateGroup.name })"
              :cache-version="item.representativeEngineItem!.engine.previewAssets.icon.cacheVersion"
              object-fit="cover"
              fallback-image="/placeholder.svg"
              :thumbnail="iconThumbnail"
              class="h-full w-full"
            />
            <LayoutTemplate v-else aria-hidden="true" class="text-muted-foreground size-4.5" />
          </div>

          <div class="flex flex-1 flex-col min-w-0 justify-center">
            <div class="flex flex-wrap gap-2 items-center">
              <h3 class="font-medium truncate">
                {{ item.templateGroup.name }}
              </h3>
              <Badge v-if="isEngineBuiltin" variant="secondary">
                {{ sourceKindLabel }}
              </Badge>
            </div>

            <Popover v-if="isEngineBuiltin">
              <PopoverTrigger as-child>
                <Button variant="ghost" class="text-xs text-muted-foreground font-normal px-0 py-0 h-auto w-fit justify-start">
                  {{ metadataText }}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" class="p-2 w-56">
                <TemplateSourcesPopoverContent
                  :sources="item.templateGroup.sources"
                  @open-source-folder="source => emit('openSourceFolder', source)"
                />
              </PopoverContent>
            </Popover>
            <p
              v-else-if="metadataText"
              class="text-xs text-muted-foreground"
            >
              {{ metadataText }}
            </p>
          </div>
        </div>

        <div v-if="menuItems.length > 0" class="flex shrink-0 items-center">
          <DropdownMenu>
            <DropdownMenuTrigger as-child>
              <Button :aria-label="$t('home.templates.actions.more')" variant="ghost" size="icon" class="shrink-0 h-8 w-8">
                <EllipsisVertical class="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" class="w-44">
              <DropdownMenuItem
                v-for="(menuItem, menuIndex) in menuItems"
                :key="menuIndex"
                :class="menuItem.class"
                :disabled="menuItem.disabled"
                @click="menuItem.onClick"
              >
                <component :is="menuItem.icon" class="mr-2 size-3.5" />
                {{ menuItem.label }}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <Progress
          v-if="hasProgress"
          :model-value="progress"
          class="rounded-none h-0.75 inset-x-0 bottom-0 absolute"
        />
      </div>
    </ContextMenuTrigger>

    <ContextMenuContent
      v-if="menuItems.length > 0"
      class="w-44"
      @close-auto-focus.prevent
    >
      <ContextMenuItem
        v-for="(menuItem, menuIndex) in menuItems"
        :key="menuIndex"
        :class="menuItem.class"
        :disabled="menuItem.disabled"
        @click="menuItem.onClick"
      >
        <component :is="menuItem.icon" class="mr-2 size-3.5" />
        {{ menuItem.label }}
      </ContextMenuItem>
    </ContextMenuContent>
  </ContextMenu>
</template>
