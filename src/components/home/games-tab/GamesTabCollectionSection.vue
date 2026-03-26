<script setup lang="ts">
import { Folder, Scroll, Trash2 } from 'lucide-vue-next'

import { useTauriDropZone } from '~/composables/useTauriDropZone'
import dayjs from '~/plugins/dayjs'

import type { Game } from '~/database/model'

interface Props {
  games: Game[]
  getGameProgress: (game: Game) => number
  hasGameProgress: (game: Game) => boolean
  viewMode: 'grid' | 'list'
}

defineProps<Props>()

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
</script>

<template>
  <div v-if="viewMode === 'grid'" class="gap-4 grid grid-cols-1 lg:grid-cols-4 md:grid-cols-3 sm:grid-cols-2">
    <ContextMenu v-for="game in games" :key="game.id">
      <ContextMenuTrigger as-child>
        <Card
          class="group rounded-lg cursor-pointer shadow-sm transition-all duration-300 relative overflow-hidden hover:shadow"
          :class="{ 'cursor-wait': hasGameProgress(game) }"
          @click="emit('gameClick', game)"
        >
          <div class="bg-gray-100 w-full aspect-16/9 overflow-hidden">
            <Thumbnail
              :path="game.metadata.cover"
              :alt="$t('home.games.gameCover', { name: game.metadata.name })"
              :size="512"
              fit="cover"
              fallback-image="/placeholder.svg"
              class="transition-transform duration-300 group-hover:scale-105"
            />
          </div>
          <CardContent class="p-3">
            <div class="flex gap-4 items-center">
              <Thumbnail :path="game.metadata.icon" :alt="$t('home.games.gameIcon', { name: game.metadata.name })" class="rounded-md size-8" />
              <div>
                <h3 class="font-medium">
                  {{ game.metadata.name }}
                </h3>
                <p class="text-xs text-muted-foreground/80">
                  {{ hasGameProgress(game) ? $t('home.games.creating') : $t('home.games.modifiedAt', { time: dayjs(game.lastModified).fromNow() }) }}
                </p>
              </div>
            </div>
          </CardContent>
          <Progress v-if="hasGameProgress(game)" :model-value="getGameProgress(game)" class="rounded-none h-1 inset-x-0 bottom-0 absolute" />
        </Card>
      </ContextMenuTrigger>
      <ContextMenuContent class="w-42">
        <ContextMenuItem @click="emit('openFolder', game)">
          <Folder class="mr-2 size-3.5" />
          {{ $t('common.openFolder') }}
        </ContextMenuItem>
        <ContextMenuItem
          v-if="!hasGameProgress(game)"
          class="text-destructive text-13px! focus:text-destructive-foreground focus:bg-destructive"
          @click="emit('deleteGame', game)"
        >
          <Trash2 class="mr-2 size-3.5" />
          {{ $t('home.games.deleteGame') }}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
    <button
      ref="dropZoneGridRef"
      type="button"
      class="p-4 border-1 rounded-lg border-dashed bg-gray-50 flex flex-col w-full cursor-pointer shadow-none transition-colors items-center justify-center overflow-hidden dark:bg-gray-900"
      :class="{
        'border-purple-300 bg-purple-50': isOverDropZoneGrid,
        'border-gray-300 dark:border-gray-700 hover:border-purple-300 dark:hover:border-purple-700': !isOverDropZoneGrid
      }"
      @click="emit('importClick')"
    >
      <div class="mb-3 p-3 rounded-full bg-purple-100 dark:bg-purple-900/20">
        <Scroll class="text-purple-600 h-6 w-6 dark:text-purple-400" />
      </div>
      <p class="text-sm font-medium text-center">
        {{ $t('home.games.importGame') }}
      </p>
      <p class="text-xs text-muted-foreground mt-1 text-center">
        {{ $t('home.games.importGameHint') }}
      </p>
    </button>
  </div>
  <div v-else class="border rounded-lg overflow-hidden divide-y">
    <div
      v-for="game in games"
      :key="game.id"
      class="p-3 flex cursor-pointer transition-colors duration-200 items-center justify-between relative hover:bg-primary/5 dark:hover:bg-primary/10"
      :class="{ 'cursor-wait': hasGameProgress(game) }"
      @click="emit('gameClick', game)"
    >
      <div class="flex gap-3 items-center">
        <div class="rounded-md h-10 w-10 overflow-hidden">
          <Thumbnail
            :path="game.metadata.cover"
            :alt="$t('home.games.gameCover', { name: game.metadata.name })"
            :size="128"
            fit="cover"
            fallback-image="/placeholder.svg"
          />
        </div>
        <div>
          <h3 class="font-medium">
            {{ game.metadata.name }}
          </h3>
          <p class="text-xs text-muted-foreground">
            {{ hasGameProgress(game) ? $t('home.games.creating') : $t('home.games.modifiedAt', { time: dayjs(game.lastModified).fromNow() }) }}
          </p>
        </div>
      </div>
      <div v-if="!hasGameProgress(game)" class="flex gap-2 items-center">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger as-child>
              <Button
                :aria-label="$t('common.openFolder')"
                variant="ghost"
                size="icon"
                class="h-8 w-8"
                @click.stop="emit('openFolder', game)"
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
                @click.stop="emit('deleteGame', game)"
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
      <Progress v-if="hasGameProgress(game)" :model-value="getGameProgress(game)" class="rounded-none h-0.75 inset-x-0 bottom-0 absolute" />
    </div>
    <button
      ref="dropZoneListRef"
      type="button"
      class="p-3 border-t bg-gray-50/50 flex w-full cursor-pointer transition-colors items-center justify-between dark:bg-gray-800/10 hover:bg-gray-100 dark:hover:bg-gray-800/20"
      :class="{
        'bg-purple-50': isOverDropZoneList
      }"
      @click="emit('importClick')"
    >
      <div class="flex gap-3 items-center">
        <div class="rounded-md bg-purple-100 flex h-10 w-10 items-center justify-center dark:bg-purple-900/20">
          <Scroll class="text-purple-600 h-5 w-5 dark:text-purple-400" />
        </div>
        <div>
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
</template>
