<script setup lang="ts">
import { open } from '@tauri-apps/plugin-dialog'
import { openPath } from '@tauri-apps/plugin-opener'
import { Download, Folder, Plus, Scroll, Trash2 } from 'lucide-vue-next'

import dayjs from '~/plugins/dayjs'

const preferenceStore = usePreferenceStore()
const resourceStore = useResourceStore()
const modalStore = useModalStore()
const router = useRouter()

// 过滤游戏列表
const filteredGames = computed(() => resourceStore.filteredGames)

// 获取游戏进度信息
function getGameProgress(game: Game) {
  return resourceStore.getProgress(game.id) ?? 0
}

function hasGameProgress(game: Game) {
  return resourceStore.activeProgress.has(game.id)
}

const dropZoneEmptyRef = useTemplateRef<HTMLElement>('dropZoneEmptyRef')
const { isOverDropZone: isOverDropZoneEmpty } = useTauriDropZone(dropZoneEmptyRef, handleDrop)

const dropZoneGridRef = useTemplateRef<HTMLElement>('dropZoneGridRef')
const { isOverDropZone: isOverDropZoneGrid } = useTauriDropZone(dropZoneGridRef, handleDrop)

const dropZoneListRef = useTemplateRef<HTMLElement>('dropZoneListRef')
const { isOverDropZone: isOverDropZoneList } = useTauriDropZone(dropZoneListRef, handleDrop)

const { t } = useI18n()

// 导入游戏并处理通知
async function importGameWithNotify(path: string) {
  try {
    await gameManager.importGame(path)
    notify.success(t('home.games.importSuccess'))
  } catch (error: unknown) {
    if (error instanceof GameError) {
      notify.error(t('home.games.importInvalidFolder'))
    } else {
      notify.error(t('home.games.importUnknownError'))
    }
  }
}

async function handleDrop(paths: string[]) {
  if (paths.length > 1) {
    notify.error(t('home.games.importMultipleFolders'))
    return
  }
  await importGameWithNotify(paths[0])
}

async function selectGameFolder() {
  const path = await open({
    title: t('modals.dialogs.selectGameFolder'),
    directory: true,
    multiple: false,
  })
  if (path) {
    await importGameWithNotify(path)
  }
}

// 打开游戏文件夹
async function handleOpenFolder(game: Game) {
  await openPath(game.path)
}

// 删除游戏
async function handleDeleteGame(game: Game) {
  modalStore.open('DeleteGameModal', { game })
}

// 处理游戏点击
function handleGameClick(game: Game) {
  if (hasGameProgress(game)) {
    notify.warning(t('home.games.importCreating'))
    return
  }
  router.push(`/edit/${game.id}`)
}

const workspaceStore = useWorkspaceStore()

function createGame() {
  if (!resourceStore.engines) {
    return
  }

  if (resourceStore.engines.length === 0) {
    modalStore.open('AlertModal', {
      title: t('home.noEngineTitle'),
      content: t('home.noEngineContent'),
      confirmText: t('home.goToInstall'),
      cancelText: t('home.later'),
      onConfirm: () => {
        workspaceStore.activeTab = 'engines'
      },
    })
    return
  }

  modalStore.open('CreateGameModal')
}
</script>

<template>
  <template v-if="filteredGames.length > 0">
    <div v-if="preferenceStore.viewMode === 'grid'" class="gap-4 grid grid-cols-1 lg:grid-cols-4 md:grid-cols-3 sm:grid-cols-2">
      <ContextMenu v-for="game in filteredGames" :key="game.id">
        <ContextMenuTrigger>
          <Card
            class="group rounded-lg cursor-pointer shadow-sm transition-all duration-300 relative overflow-hidden hover:shadow"
            :class="{ 'cursor-wait': hasGameProgress(game) }"
            @click="handleGameClick(game)"
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
          <ContextMenuItem @click="handleOpenFolder(game)">
            <Folder class="mr-2 h-4 w-4" />
            {{ $t('common.openFolder') }}
          </ContextMenuItem>
          <ContextMenuItem class="text-destructive focus:text-destructive-foreground focus:bg-destructive" @click="handleDeleteGame(game)">
            <Trash2 class="mr-2 h-4 w-4" />
            {{ $t('home.games.deleteGame') }}
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
      <div
        ref="dropZoneGridRef"
        class="p-4 border-1 rounded-lg border-dashed bg-gray-50 flex flex-col cursor-pointer shadow-none transition-colors items-center justify-center overflow-hidden overflow-hidden dark:bg-gray-900"
        :class="{
          'border-purple-300 bg-purple-50': isOverDropZoneGrid,
          'border-gray-300 dark:border-gray-700 hover:border-purple-300 dark:hover:border-purple-700': !isOverDropZoneGrid
        }"
        @click="selectGameFolder"
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
      </div>
    </div>
    <div v-else class="border rounded-lg overflow-hidden divide-y">
      <div
        v-for="game in filteredGames"
        :key="game.id"
        class="p-3 flex cursor-pointer transition-colors duration-200 items-center justify-between relative hover:bg-primary/5 dark:hover:bg-primary/10"
        :class="{ 'cursor-wait': hasGameProgress(game) }"
        @click="handleGameClick(game)"
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
              {{ $t('home.games.modifiedAt', { time: dayjs(game.lastModified).fromNow() }) }}
            </p>
          </div>
        </div>
        <div v-if="!hasGameProgress(game)" class="flex gap-2 items-center">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger as-child>
                <Button
                  variant="ghost"
                  size="icon"
                  class="h-8 w-8"
                  @click.stop="handleOpenFolder(game)"
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
                  variant="ghost"
                  size="icon"
                  class="text-destructive h-8 w-8 hover:text-destructive-foreground hover:bg-destructive"
                  @click.stop="handleDeleteGame(game)"
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
      <div
        ref="dropZoneListRef"
        class="p-3 border-t bg-gray-50/50 flex cursor-pointer transition-colors items-center justify-between dark:bg-gray-800/10 hover:bg-gray-100 dark:hover:bg-gray-800/20"
        :class="{
          'bg-purple-50': isOverDropZoneList,
          'bg-gray-50/50 dark:bg-gray-800/10 hover:bg-gray-100 dark:hover:bg-gray-800/20': !isOverDropZoneList
        }"
        @click="selectGameFolder"
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
      </div>
    </div>
  </template>
  <div
    v-else
    ref="dropZoneEmptyRef"
    class="py-12 border rounded-lg border-dashed flex flex-col transition-colors items-center justify-center"
    :class="{
      'border-primary/50 bg-primary/5': isOverDropZoneEmpty,
      'border-gray-300 dark:border-gray-700': !isOverDropZoneEmpty
    }"
  >
    <div class="mb-4 p-4 rounded-full bg-gray-100 dark:bg-gray-800">
      <Scroll class="text-muted-foreground h-10 w-10" />
    </div>
    <h3 class="text-lg font-medium mb-1">
      {{ $t('home.games.noGames') }}
    </h3>
    <p class="text-sm text-muted-foreground mb-4 text-center max-w-md">
      {{ $t('home.games.noGamesDesc') }}
    </p>
    <div class="mb-3 flex flex-col items-center">
      <div
        class="mb-3 px-6 py-4 border-2 rounded-md border-dashed flex transition-colors items-center justify-center"
        :class="{
          'border-primary/35 bg-primary/5': isOverDropZoneEmpty,
          'border-gray-300 bg-gray-50 dark:border-gray-700 dark:bg-gray-800/50': !isOverDropZoneEmpty
        }"
      >
        <Download class="text-muted-foreground mr-2 h-6 w-6" />
        <span class="text-sm text-muted-foreground">{{ $t('home.games.dropGameFolder') }}</span>
      </div>
      <p class="text-xs text-muted-foreground">
        {{ $t('common.or') }}
      </p>
    </div>
    <Button class="gap-2" @click="createGame">
      <Plus class="h-4 w-4" />
      {{ $t('home.games.createNewGame') }}
    </Button>
  </div>
</template>
