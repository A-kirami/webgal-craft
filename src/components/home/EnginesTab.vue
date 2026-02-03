<script setup lang="ts">
import { open } from '@tauri-apps/plugin-dialog'
import { openPath } from '@tauri-apps/plugin-opener'
import { Box, Download, Folder, Plus, Trash2 } from 'lucide-vue-next'

const preferenceStore = usePreferenceStore()
const resourceStore = useResourceStore()
const modalStore = useModalStore()

// 过滤引擎列表
const filteredEngines = computed(() => resourceStore.filteredEngines)

// 获取引擎进度信息
function getEngineProgress(engine: Engine) {
  return resourceStore.getProgress(engine.id) ?? 0
}

function hasEngineProgress(engine: Engine) {
  return resourceStore.activeProgress.has(engine.id)
}

const dropZoneEmptyRef = useTemplateRef<HTMLElement>('dropZoneEmptyRef')
const { isOverDropZone: isOverDropZoneEmpty } = useTauriDropZone(dropZoneEmptyRef, handleDrop)

const dropZoneGridRef = useTemplateRef<HTMLElement>('dropZoneGridRef')
const { isOverDropZone: isOverDropZoneGrid } = useTauriDropZone(dropZoneGridRef, handleDrop)

const dropZoneListRef = useTemplateRef<HTMLElement>('dropZoneListRef')
const { isOverDropZone: isOverDropZoneList } = useTauriDropZone(dropZoneListRef, handleDrop)

const { t } = useI18n()

// 导入引擎并处理通知
async function importEngineWithNotify(path: string) {
  try {
    await engineManager.importEngine(path)
    notify.success(t('home.engines.importSuccess'))
  } catch (error: unknown) {
    if (error instanceof GameError) {
      notify.error(t('home.engines.importInvalidFolder'))
    } else {
      notify.error(t('home.engines.importUnknownError'))
    }
  }
}

async function handleDrop(paths: string[]) {
  if (paths.length > 1) {
    notify.error(t('home.engines.importMultipleFolders'))
    return
  }
  await importEngineWithNotify(paths[0])
}

async function selectEngineFolder() {
  const path = await open({
    title: t('common.dialogs.selectEngineFolder'),
    directory: true,
    multiple: false,
  })
  if (path) {
    await importEngineWithNotify(path)
  }
}

// 打开引擎文件夹
async function handleOpenFolder(engine: Engine) {
  await openPath(engine.path)
}

// 删除引擎
async function handleDelete(engine: Engine) {
  modalStore.open('DeleteEngineModal', { engine })
}
</script>

<template>
  <template v-if="filteredEngines.length > 0">
    <!-- 网格视图 -->
    <div v-if="preferenceStore.viewMode === 'grid'" class="gap-4 grid grid-cols-1 lg:grid-cols-4 md:grid-cols-3 sm:grid-cols-2">
      <ContextMenu v-for="engine in filteredEngines" :key="engine.id">
        <ContextMenuTrigger>
          <Card
            class="group rounded-lg shadow-sm transition-all duration-300 relative overflow-hidden hover:shadow"
            :class="{ 'cursor-wait': hasEngineProgress(engine) }"
          >
            <CardContent class="p-0">
              <div class="p-4 flex gap-4 items-start">
                <div class="rounded shrink-0 h-15 w-15 overflow-hidden">
                  <Thumbnail
                    :path="engine.metadata.icon"
                    :alt="$t('home.engines.engineIcon', { name: engine.metadata.name })"
                    :size="128"
                    fit="cover"
                    fallback-image="/placeholder.svg"
                  />
                </div>
                <div class="flex-1">
                  <div class="flex items-center justify-between">
                    <h4 class="font-medium">
                      {{ engine.metadata.name }}
                    </h4>
                  </div>
                  <p class="text-sm text-muted-foreground mt-1">
                    {{ engine.metadata.description }}
                  </p>
                </div>
              </div>
            </CardContent>
            <Progress v-if="hasEngineProgress(engine)" :model-value="getEngineProgress(engine)" class="rounded-none h-1 inset-x-0 bottom-0 absolute" />
          </Card>
        </ContextMenuTrigger>
        <ContextMenuContent class="w-42">
          <ContextMenuItem @click="handleOpenFolder(engine)">
            <Folder class="mr-2 size-3.5" />
            {{ $t('common.openFolder') }}
          </ContextMenuItem>
          <ContextMenuItem class="text-destructive text-13px! focus:text-destructive-foreground focus:bg-destructive" @click="handleDelete(engine)">
            <Trash2 class="mr-2 size-3.5" />
            {{ $t('home.engines.uninstallEngine') }}
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
      <div
        ref="dropZoneGridRef"
        class="p-4 border-1 rounded-lg border-dashed bg-gray-50 flex flex-row gap-4 cursor-pointer shadow-none transition-colors items-center justify-center overflow-hidden overflow-hidden dark:bg-gray-900"
        :class="{
          'border-purple-300 bg-purple-50': isOverDropZoneGrid,
          'border-gray-300 dark:border-gray-700 hover:border-purple-300 dark:hover:border-purple-700': !isOverDropZoneGrid
        }"
        @click="selectEngineFolder"
      >
        <div class="p-3 rounded-full bg-purple-100 dark:bg-purple-900/20">
          <Box class="text-purple-600 h-6 w-6 dark:text-purple-400" />
        </div>
        <div>
          <p class="text-sm font-medium">
            {{ $t('home.engines.installEngine') }}
          </p>
          <p class="text-xs text-muted-foreground mt-1">
            {{ $t('home.engines.installEngineHint') }}
          </p>
        </div>
      </div>
    </div>

    <!-- 列表视图 -->
    <div v-else class="border rounded-lg overflow-hidden divide-y">
      <div
        v-for="engine in filteredEngines"
        :key="engine.id"
        class="p-3 flex transition-colors duration-200 items-center justify-between relative hover:bg-primary/5 dark:hover:bg-primary/10"
        :class="{ 'cursor-wait': hasEngineProgress(engine) }"
      >
        <div class="flex gap-3 items-center">
          <div class="rounded h-10 w-10 overflow-hidden">
            <Thumbnail
              :path="engine.metadata.icon"
              :alt="$t('home.engines.engineIcon', { name: engine.metadata.name })"
              :size="128"
              fit="cover"
              fallback-image="/placeholder.svg"
            />
          </div>
          <div>
            <h3 class="font-medium">
              {{ engine.metadata.name }}
            </h3>
            <p class="text-xs text-muted-foreground">
              {{ engine.metadata.description }}
            </p>
          </div>
        </div>
        <div v-if="!hasEngineProgress(engine)" class="flex gap-2 items-center">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger as-child>
                <Button
                  variant="ghost"
                  size="icon"
                  class="h-8 w-8"
                  @click="handleOpenFolder(engine)"
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
                  @click="handleDelete(engine)"
                >
                  <Trash2 class="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>{{ $t('home.engines.uninstallEngine') }}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <Progress v-if="hasEngineProgress(engine)" :model-value="getEngineProgress(engine)" class="rounded-none h-0.75 inset-x-0 bottom-0 absolute" />
      </div>
      <div
        ref="dropZoneListRef"
        class="p-3 border-t flex cursor-pointer transition-colors items-center justify-between"
        :class="{
          'bg-purple-50': isOverDropZoneList,
          'bg-gray-50/50 dark:bg-gray-800/10 hover:bg-gray-100 dark:hover:bg-gray-800/20': !isOverDropZoneList
        }"
        @click="selectEngineFolder"
      >
        <div class="flex gap-3 items-center">
          <div class="rounded-md bg-purple-100 flex h-10 w-10 items-center justify-center dark:bg-purple-900/20">
            <Box class="text-purple-600 h-5 w-5 dark:text-purple-400" />
          </div>
          <div>
            <h3 class="font-medium">
              {{ $t('home.engines.installEngine') }}
            </h3>
            <p class="text-xs text-muted-foreground">
              {{ $t('home.engines.installEngineHint') }}
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
      <Box class="text-muted-foreground h-10 w-10" />
    </div>
    <h3 class="text-lg font-medium mb-1">
      {{ $t('home.engines.noEngines') }}
    </h3>
    <p class="text-sm text-muted-foreground mb-4 text-center max-w-md">
      {{ $t('home.engines.noEnginesDesc') }}
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
        <span class="text-sm text-muted-foreground">{{ $t('home.engines.dropEngineFolder') }}</span>
      </div>
      <p class="text-xs text-muted-foreground">
        {{ $t('common.or') }}
      </p>
    </div>
    <Button variant="outline" class="gap-2" @click="selectEngineFolder">
      <Plus class="h-4 w-4" />
      {{ $t('home.engines.installGameEngine') }}
    </Button>
  </div>
</template>
