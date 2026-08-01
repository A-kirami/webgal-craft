<script setup lang="ts">
import { Folder, Scroll, Trash2, TriangleAlert } from '@lucide/vue'

import { useTauriDropZone } from '~/composables/useTauriDropZone'
import dayjs from '~/plugins/dayjs'

import type { Game } from '~/database/model'
import type { GameCollectionItem } from '~/features/home/home-collection-items'
import type { AssetThumbnailOptions } from '~/services/platform/asset-url'

interface Props {
  items: GameCollectionItem[]
  getGameProgress: (game: Game) => number
  hasGameProgress: (game: Game) => boolean
  viewMode: 'grid' | 'list'
}

const {
  items,
  getGameProgress,
  hasGameProgress,
  viewMode,
} = defineProps<Props>()

const emit = defineEmits<{
  deleteGame: [game: Game]
  gameClick: [game: Game]
  importClick: []
  openFolder: [game: Game]
  drop: [paths: string[]]
}>()

const dropZoneGridRef = useTemplateRef<HTMLElement>('dropZoneGridRef')
const { isOverDropZone: isOverDropZoneGrid } = useTauriDropZone(dropZoneGridRef, paths => emit('drop', paths))

const dropZoneListRef = useTemplateRef<HTMLElement>('dropZoneListRef')
const { isOverDropZone: isOverDropZoneList } = useTauriDropZone(dropZoneListRef, paths => emit('drop', paths))

const GRID_COVER_THUMBNAIL: AssetThumbnailOptions = {
  width: 640,
  height: 360,
  resizeMode: 'cover',
}

const GRID_ICON_THUMBNAIL: AssetThumbnailOptions = {
  width: 64,
  height: 64,
  resizeMode: 'contain',
}

const LIST_COVER_THUMBNAIL: AssetThumbnailOptions = {
  width: 80,
  height: 80,
  resizeMode: 'cover',
}
</script>

<template>
  <ScrollArea class="h-full min-h-0">
    <div v-if="viewMode === 'grid'" class="gap-4 grid auto-rows-fr grid-cols-1 lg:grid-cols-4 md:grid-cols-3 sm:grid-cols-2">
      <ContextMenu v-for="item in items" :key="item.game.id">
        <ContextMenuTrigger as-child>
          <Card
            :data-testid="`game-card-${item.game.id}`"
            :data-availability="item.game.availability"
            class="group rounded-lg h-full cursor-pointer shadow-sm transition-all duration-300 relative overflow-hidden hover:shadow"
            :class="{
              'cursor-wait': hasGameProgress(item.game),
              'opacity-90 ring-1 ring-destructive/40 border-destructive/30 bg-destructive/[0.03]': item.game.availability !== 'available',
            }"
            @click="emit('gameClick', item.game)"
          >
            <div class="bg-gray-100 w-full aspect-16/9 relative overflow-hidden">
              <AssetImage
                :path="item.game.previewAssets.cover.path"
                :root-path="item.rootPath"
                :serve-url="item.serveUrl"
                :alt="$t('home.games.gameCover', { name: item.game.metadata.name })"
                :cache-version="item.game.previewAssets.cover.cacheVersion"
                object-fit="cover"
                fallback-image="/placeholder.svg"
                :thumbnail="GRID_COVER_THUMBNAIL"
                class="h-full w-full transition-transform duration-300 group-hover:scale-105"
                :class="{ 'grayscale': item.game.availability !== 'available' }"
              />
              <div
                v-if="item.game.availability !== 'available'"
                aria-hidden="true"
                class="bg-destructive/15 pointer-events-none inset-0 absolute"
              />
              <Badge
                v-if="item.game.availability !== 'available'"
                variant="destructive"
                class="shadow-sm right-2 top-2 absolute"
              >
                <TriangleAlert class="size-3" />
                {{ $t('home.unavailableBadge') }}
              </Badge>
            </div>
            <CardContent class="p-3">
              <div class="flex gap-4 items-center">
                <AssetImage
                  :path="item.game.previewAssets.icon.path"
                  :root-path="item.rootPath"
                  :serve-url="item.serveUrl"
                  :alt="$t('home.games.gameIcon', { name: item.game.metadata.name })"
                  :cache-version="item.game.previewAssets.icon.cacheVersion"
                  :thumbnail="GRID_ICON_THUMBNAIL"
                  class="rounded-md size-8"
                />
                <div>
                  <h3 class="font-medium">
                    {{ item.game.metadata.name }}
                  </h3>
                  <p class="text-xs text-muted-foreground/80">
                    {{ hasGameProgress(item.game) ? $t('home.games.creating') : $t('home.games.modifiedAt', { time: dayjs(item.game.lastModified).fromNow() }) }}
                  </p>
                </div>
              </div>
            </CardContent>
            <Progress v-if="hasGameProgress(item.game)" :model-value="getGameProgress(item.game)" class="rounded-none h-1 inset-x-0 bottom-0 absolute" />
          </Card>
        </ContextMenuTrigger>
        <ContextMenuContent class="w-42">
          <ContextMenuItem
            v-if="item.game.availability !== 'missing'"
            @click="emit('openFolder', item.game)"
          >
            <Folder class="mr-2 size-3.5" />
            {{ $t('common.openFolder') }}
          </ContextMenuItem>
          <ContextMenuItem
            v-if="!hasGameProgress(item.game)"
            class="text-destructive focus:text-destructive-foreground focus:bg-destructive"
            @click="emit('deleteGame', item.game)"
          >
            <Trash2 class="mr-2 size-3.5" />
            {{ $t('home.games.deleteGame') }}
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
      <button
        ref="dropZoneGridRef"
        type="button"
        :aria-label="$t('home.games.importGame')"
        class="p-4 text-center border-1 border-gray-300 rounded-lg border-dashed bg-gray-50 flex flex-col gap-3 h-full w-full cursor-pointer shadow-none transition-colors items-center justify-center overflow-hidden dark:border-gray-700 hover:border-purple-300 dark:bg-gray-900 dark:hover:border-purple-700"
        :class="{ 'border-purple-300 bg-purple-50': isOverDropZoneGrid }"
        @click="emit('importClick')"
      >
        <div class="p-3 rounded-full bg-purple-100 dark:bg-purple-900/20">
          <Scroll class="text-purple-600 h-6 w-6 dark:text-purple-400" />
        </div>
        <div class="px-4 min-w-0">
          <p class="text-sm font-medium">
            {{ $t('home.games.importGame') }}
          </p>
          <p class="text-xs text-muted-foreground mt-1">
            {{ $t('home.games.importGameHint') }}
          </p>
        </div>
      </button>
    </div>
    <div v-else class="border rounded-lg overflow-hidden divide-y">
      <div
        v-for="item in items"
        :key="item.game.id"
        :data-testid="`game-row-${item.game.id}`"
        :data-availability="item.game.availability"
        class="p-3 flex cursor-pointer transition-colors duration-200 items-center justify-between relative hover:bg-primary/5 dark:hover:bg-primary/10"
        :class="{
          'cursor-wait': hasGameProgress(item.game),
          'bg-destructive/[0.04] hover:bg-destructive/[0.08] dark:hover:bg-destructive/[0.12]': item.game.availability !== 'available',
        }"
        @click="emit('gameClick', item.game)"
      >
        <div class="flex flex-1 gap-3 min-w-0 items-center">
          <div
            class="rounded-md h-10 w-10 relative overflow-hidden"
            :class="{ 'ring-1 ring-destructive/40': item.game.availability !== 'available' }"
          >
            <AssetImage
              :path="item.game.previewAssets.cover.path"
              :root-path="item.rootPath"
              :serve-url="item.serveUrl"
              :alt="$t('home.games.gameCover', { name: item.game.metadata.name })"
              :cache-version="item.game.previewAssets.cover.cacheVersion"
              object-fit="cover"
              fallback-image="/placeholder.svg"
              :thumbnail="LIST_COVER_THUMBNAIL"
              class="h-full w-full"
              :class="{ 'grayscale': item.game.availability !== 'available' }"
            />
          </div>
          <div class="flex flex-col min-w-0">
            <div class="flex flex-wrap gap-2 items-center">
              <h3 class="font-medium truncate">
                {{ item.game.metadata.name }}
              </h3>
              <Badge
                v-if="item.game.availability !== 'available'"
                variant="destructive"
              >
                <TriangleAlert class="size-3" />
                {{ $t('home.unavailableBadge') }}
              </Badge>
            </div>
            <p class="text-xs text-muted-foreground">
              {{ hasGameProgress(item.game) ? $t('home.games.creating') : $t('home.games.modifiedAt', { time: dayjs(item.game.lastModified).fromNow() }) }}
            </p>
          </div>
        </div>
        <div v-if="!hasGameProgress(item.game)" class="flex gap-2 items-center">
          <TooltipProvider>
            <Tooltip v-if="item.game.availability !== 'missing'">
              <TooltipTrigger as-child>
                <Button
                  :aria-label="$t('common.openFolder')"
                  variant="ghost"
                  size="icon"
                  class="h-8 w-8"
                  @click.stop="emit('openFolder', item.game)"
                >
                  <Folder class="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>{{ $t('common.openFolder') }}</p>
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger as-child>
                <Button
                  :aria-label="$t('home.games.deleteGame')"
                  variant="ghost"
                  size="icon"
                  class="text-destructive h-8 w-8 hover:text-destructive-foreground hover:bg-destructive"
                  @click.stop="emit('deleteGame', item.game)"
                >
                  <Trash2 class="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>{{ $t('home.games.deleteGame') }}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <Progress v-if="hasGameProgress(item.game)" :model-value="getGameProgress(item.game)" class="rounded-none h-0.75 inset-x-0 bottom-0 absolute" />
      </div>
      <button
        ref="dropZoneListRef"
        type="button"
        :aria-label="$t('home.games.importGame')"
        class="p-3 bg-gray-50/50 flex w-full cursor-pointer transition-colors items-center justify-between dark:bg-gray-800/10 hover:bg-gray-100 dark:hover:bg-gray-800/20"
        :class="{'bg-purple-50': isOverDropZoneList}"
        @click="emit('importClick')"
      >
        <div class="flex gap-3 items-center">
          <div class="rounded-md bg-purple-100 flex h-10 w-10 items-center justify-center dark:bg-purple-900/20">
            <Scroll class="text-purple-600 h-5 w-5 dark:text-purple-400" />
          </div>
          <div class="text-left">
            <h3 class="font-medium">
              {{ $t('home.games.importGame') }}
            </h3>
            <p class="text-xs text-muted-foreground">
              {{ $t('home.games.importGameHint') }}
            </p>
          </div>
        </div>
      </button>
    </div>
  </ScrollArea>
</template>
