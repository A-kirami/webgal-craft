<script setup lang="ts">
import { EllipsisVertical, Folder, Star, Trash2, TriangleAlert } from '@lucide/vue'

import type { Engine } from '~/database/model'
import type { EngineGroupCollectionItem } from '~/features/home/home-collection-items'
import type { AssetThumbnailOptions } from '~/services/platform/asset-url'
import type { MenuItem } from '~/types/menu-item'

interface Props {
  group: EngineGroupCollectionItem
  viewMode: 'grid' | 'list'
}

const { group, viewMode } = defineProps<Props>()
const { t } = useI18n()

const emit = defineEmits<{
  deleteEngine: [engine: Engine]
  deleteGroup: [engineId: string]
  openGroupFolder: [group: EngineGroupCollectionItem]
  setDefaultEngine: [engineId: string | undefined]
}>()

const GRID_ICON_THUMBNAIL: AssetThumbnailOptions = { width: 120, height: 120, resizeMode: 'cover' }
const LIST_ICON_THUMBNAIL: AssetThumbnailOptions = { width: 80, height: 80, resizeMode: 'cover' }

const versionSummary = $computed(() => {
  if (!group.hasAvailableVersion || !group.latestVersionLabel) {
    return t('engine.noAvailableVersionSummary', { count: group.versionCount })
  }

  return t('engine.versionSummary', {
    count: group.versionCount,
    version: group.latestVersionLabel,
  })
})

const menuItems = $computed<MenuItem[]>(() => [
  {
    icon: Star,
    label: group.isDefault ? t('engine.unsetDefaultEngine') : t('engine.setDefaultEngine'),
    onClick: () => emit('setDefaultEngine', group.isDefault ? undefined : group.engineId),
    disabled: !group.hasAvailableVersion && !group.isDefault,
  },
  {
    icon: Folder,
    label: t('common.openFolder'),
    onClick: () => emit('openGroupFolder', group),
  },
  {
    icon: Trash2,
    label: t('engine.uninstallAllVersions'),
    onClick: () => emit('deleteGroup', group.engineId),
    class: 'text-destructive focus:text-destructive-foreground focus:bg-destructive',
  },
])
</script>

<template>
  <ContextMenu>
    <ContextMenuTrigger as-child>
      <Card
        v-if="viewMode === 'grid'"
        :data-availability="group.hasAvailableVersion ? 'available' : 'unavailable'"
        class="rounded-lg shadow-sm"
        :class="{ 'ring-1 ring-destructive/40 border-destructive/30 bg-destructive/[0.03]': !group.hasAvailableVersion }"
      >
        <CardContent class="p-3 flex flex-col gap-1">
          <div class="flex gap-4 items-start justify-between">
            <div class="flex flex-1 gap-4 min-w-0 items-stretch">
              <div class="rounded-md shrink-0 size-12 overflow-hidden">
                <AssetImage
                  v-if="group.representativeItem"
                  :path="group.representativeItem.engine.previewAssets.icon.path"
                  :root-path="group.representativeItem.engine.path"
                  :serve-url="group.representativeItem.serveUrl"
                  :alt="$t('home.engines.engineIcon', { name: group.name })"
                  :cache-version="group.representativeItem.engine.previewAssets.icon.cacheVersion"
                  object-fit="cover"
                  fallback-image="/placeholder.svg"
                  :thumbnail="GRID_ICON_THUMBNAIL"
                  class="h-full w-full"
                />
                <div v-else class="bg-muted flex h-full w-full items-center justify-center" />
              </div>

              <div class="flex flex-1 flex-col min-w-0 justify-between">
                <div class="flex flex-wrap gap-2 items-center">
                  <h4 class="font-medium">
                    {{ group.name }}
                  </h4>
                  <Badge v-if="group.isDefault" variant="secondary">
                    {{ $t('engine.defaultEngine') }}
                  </Badge>
                  <Badge v-if="!group.hasAvailableVersion" variant="destructive">
                    <TriangleAlert class="size-3" />
                    {{ $t('home.unavailableBadge') }}
                  </Badge>
                </div>

                <Popover>
                  <PopoverTrigger as-child>
                    <Button variant="ghost" class="text-[13px] text-muted-foreground font-normal px-1.5 py-0 text-left h-auto w-fit justify-start -ml-1.5">
                      <span>
                        {{ versionSummary }}
                      </span>
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="start" class="px-3 py-2 w-56">
                    <EngineVersionPopover :group="group" @delete-engine="engine => emit('deleteEngine', engine)" />
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger as-child>
                <Button :aria-label="$t('common.more')" variant="ghost" size="icon" class="h-8 w-8">
                  <EllipsisVertical class="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" class="text-13px w-44">
                <DropdownMenuItem
                  v-for="(item, index) in menuItems"
                  :key="index"
                  :class="item.class"
                  :disabled="item.disabled"
                  @click="item.onClick"
                >
                  <component :is="item.icon" class="mr-2 size-3.5" />
                  {{ item.label }}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <p v-if="group.summary" class="text-13px text-muted-foreground line-clamp-2">
            {{ group.summary }}
          </p>
        </CardContent>
      </Card>

      <div
        v-else
        :data-availability="group.hasAvailableVersion ? 'available' : 'unavailable'"
        class="p-3 flex transition-colors duration-200 items-center justify-between relative hover:bg-primary/5 dark:hover:bg-primary/10"
        :class="{ 'bg-destructive/[0.04] hover:bg-destructive/[0.08] dark:hover:bg-destructive/[0.12]': !group.hasAvailableVersion }"
      >
        <div class="flex flex-1 gap-3 min-w-0 items-center">
          <div class="rounded-md flex shrink-0 h-10 w-10 items-center justify-center overflow-hidden">
            <AssetImage
              v-if="group.representativeItem"
              :path="group.representativeItem.engine.previewAssets.icon.path"
              :root-path="group.representativeItem.engine.path"
              :serve-url="group.representativeItem.serveUrl"
              :alt="$t('home.engines.engineIcon', { name: group.name })"
              :cache-version="group.representativeItem.engine.previewAssets.icon.cacheVersion"
              object-fit="cover"
              fallback-image="/placeholder.svg"
              :thumbnail="LIST_ICON_THUMBNAIL"
              class="h-full w-full"
            />
            <div v-else class="bg-muted flex h-full w-full items-center justify-center" />
          </div>

          <div class="flex flex-1 flex-col min-w-0 justify-center">
            <div class="flex flex-wrap gap-2 items-center">
              <h3 class="font-medium">
                {{ group.name }}
              </h3>
              <Badge v-if="group.isDefault" variant="secondary">
                {{ $t('engine.defaultEngine') }}
              </Badge>
              <Badge v-if="!group.hasAvailableVersion" variant="destructive">
                <TriangleAlert class="size-3" />
                {{ $t('home.unavailableBadge') }}
              </Badge>
            </div>
            <p v-if="group.summary" class="text-xs text-muted-foreground line-clamp-1">
              {{ group.summary }}
            </p>
          </div>
        </div>

        <div class="flex shrink-0 gap-3 items-center">
          <Popover>
            <PopoverTrigger as-child>
              <Button variant="ghost" class="text-[13px] text-muted-foreground font-normal p-0 h-auto">
                {{ versionSummary }}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" class="p-2 w-56">
              <EngineVersionPopover :group="group" @delete-engine="engine => emit('deleteEngine', engine)" />
            </PopoverContent>
          </Popover>

          <DropdownMenu>
            <DropdownMenuTrigger as-child>
              <Button :aria-label="$t('common.more')" variant="ghost" size="icon" class="h-8 w-8">
                <EllipsisVertical class="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" class="w-44">
              <DropdownMenuItem
                v-for="(item, index) in menuItems"
                :key="index"
                :class="item.class"
                :disabled="item.disabled"
                @click="item.onClick"
              >
                <component :is="item.icon" class="mr-2 size-3.5" />
                {{ item.label }}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </ContextMenuTrigger>

    <ContextMenuContent class="w-44" @close-auto-focus.prevent>
      <ContextMenuItem
        v-for="(item, index) in menuItems"
        :key="index"
        :class="item.class"
        :disabled="item.disabled"
        @click="item.onClick"
      >
        <component :is="item.icon" class="mr-2 size-3.5" />
        {{ item.label }}
      </ContextMenuItem>
    </ContextMenuContent>
  </ContextMenu>
</template>
