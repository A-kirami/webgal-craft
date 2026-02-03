<script setup lang="tsx">
import { useVirtualizer } from '@tanstack/vue-virtual'
import { join } from '@tauri-apps/api/path'
import { File, FileImage, FileJson2, FileMusic, FileVideo, FileVolume, Folder } from 'lucide-vue-next'

import type { ScrollArea } from '~/components/ui/scroll-area'

const { assetType } = $defineProps<{ assetType: string }>()

let currentPath = $(defineModel<string>('current-path', { required: true }))

const preferenceStore = usePreferenceStore()

function handleNavigateTo(newPath: string) {
  currentPath = newPath.replace(assetBasePath.value || '', '')
}

const tabsStore = useTabsStore()

const scrollAreaRef = useTemplateRef<InstanceType<typeof ScrollArea>>('scrollAreaRef')

let scrollTop = 0

const onScroll = useDebounceFn((e: Event) => {
  scrollTop = (e.target as HTMLElement).scrollTop
}, 100)

onActivated(() => {
  const viewport = scrollAreaRef.value?.viewport?.viewportElement
  if (viewport) {
    viewport.scrollTo({ top: scrollTop })
  }
})

const fileStore = useFileStore()
const workspaceStore = useWorkspaceStore()

const assetBasePath = computedAsync(async () => {
  if (!workspaceStore.currentGame?.path) {
    return ''
  }
  return await join(workspaceStore.currentGame.path, 'game', assetType)
})

let isLoading = $ref(false)
let errorMsg = $ref('')

const items = computedAsync(async () => {
  isLoading = true
  errorMsg = ''
  try {
    const basePath = assetBasePath.value
    if (!basePath) {
      return []
    }
    const path = await join(basePath, currentPath)
    const result = await fileStore.getFolderContents(path)
    return result
  } catch (error) {
    errorMsg = error instanceof Error ? error.message : String(error)
    return []
  } finally {
    isLoading = false
  }
}, [])

const iconRules = [
  { match: (item: FileItem) => item.mimeType?.startsWith('image'), icon: FileImage },
  { match: (item: FileItem, assetType: string) => item.mimeType?.startsWith('audio') && assetType !== 'vocal', icon: FileMusic },
  { match: (item: FileItem) => item.mimeType?.startsWith('video'), icon: FileVideo },
  { match: (item: FileItem, assetType: string) => item.mimeType?.startsWith('audio') && assetType === 'vocal', icon: FileVolume },
  { match: (item: FileItem) => item.mimeType?.startsWith('application/json'), icon: FileJson2 },
]

function getFileIconComponent(item: FileItem, assetType: string) {
  const rule = iconRules.find(r => r.match(item, assetType))
  return rule ? rule.icon : File
}

const ItemIcon = (props: { item: FileSystemItem }) => {
  const Icon = props.item.isDir ? Folder : getFileIconComponent(props.item, assetType)
  return (
    <Icon stroke-width={1.25} />
  )
}

const { width: viewportWidth } = useElementSize(scrollAreaRef)
const ITEM_MIN_WIDTH = 100
const gridCols = computed(() => Math.max(1, Math.floor(viewportWidth.value / ITEM_MIN_WIDTH)))
const rowCount = computed(() => Math.ceil((items.value?.length ?? 0) / gridCols.value))

const rowVirtualizer = useVirtualizer(
  computed(() => {
    const isGrid = preferenceStore.assetViewMode === 'grid'
    return {
      count: isGrid ? rowCount.value : items.value?.length ?? 0,
      // eslint-disable-next-line unicorn/no-null
      getScrollElement: () => scrollAreaRef.value?.viewport?.viewportElement ?? null,
      estimateSize: () => isGrid ? 128 : 40,
      overscan: 5,
      getItemKey: index => items.value?.[index]?.path ?? index,
      enabled: !!items.value,
    }
  }),
)
const virtualRows = computed(() => rowVirtualizer.value.getVirtualItems())
const totalSize = computed(() => rowVirtualizer.value.getTotalSize())

watch(() => currentPath, () => {
  rowVirtualizer.value.scrollToIndex(0)
})

const handleClick = async (item: FileSystemItem) => {
  if (item.isDir) {
    handleNavigateTo(item.path)
    return
  }
  tabsStore.openTab(item.name, item.path)
}

const handleDoubleClick = async (item: FileSystemItem) => {
  if (item.isDir) {
    return
  }
  const index = tabsStore.findTabIndex(item.path)
  const tab = tabsStore.tabs[index]
  if (tab.isPreview) {
    tabsStore.fixPreviewTab(index)
  }
}

// TODO: 空文件夹提示
// TODO: 支持右键菜单（如重命名、删除、复制路径等）
// TODO: 悬停或右侧可显示文件详情（如大小、修改时间等）
</script>

<template>
  <ScrollArea ref="scrollAreaRef" @scroll="onScroll">
    <!-- 加载中状态 -->
    <div v-if="isLoading" class="flex flex-col h-full w-full items-center justify-center">
      <div class="i-svg-spinners-ring-resize text-accent mb-2 size-8 animate-spin" />
      <span class="text-xs text-muted-foreground">{{ $t('edit.assetView.loading') }}</span>
    </div>
    <!-- 加载失败状态 -->
    <div v-else-if="errorMsg" class="flex flex-col h-full w-full items-center justify-center">
      <div class="i-lucide-alert-triangle text-destructive mb-2 size-10" />
      <span class="text-xs text-destructive">{{ $t('edit.assetView.loadFailed', { error: errorMsg }) }}</span>
    </div>
    <!-- 空状态 -->
    <div v-else-if="items.length === 0" class="flex flex-col h-full w-full items-center justify-center">
      <div class="i-lucide-folder-open text-muted-foreground mb-2 size-10" />
      <span class="text-xs text-muted-foreground">{{ $t('edit.assetView.noContent') }}</span>
    </div>
    <!-- 文件列表 -->
    <div v-else :style="{ height: `${totalSize}px`, width: '100%', position: 'relative' }">
      <div
        v-for="row in virtualRows"
        :key="(row.key as string)"
        :style="{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: row.size + 'px',
          transform: `translateY(${row.start}px)`
        }"
      >
        <div v-if="preferenceStore.assetViewMode === 'grid'" class="grid h-full" :style="{ gridTemplateColumns: `repeat(${gridCols}, 1fr)` }">
          <div
            v-for="item in items.slice(row.index * gridCols, (row.index + 1) * gridCols)" :key="item.path"
            class="p-1.5 rounded-md flex flex-col gap-1 cursor-pointer items-center hover:bg-accent"
            :style="{width: `${ITEM_MIN_WIDTH}px`}"
            @click="handleClick(item)"
            @dblclick="handleDoubleClick(item)"
          >
            <div class="flex shrink-0 size-20 items-center justify-center">
              <Thumbnail
                v-if="!item.isDir && item.mimeType?.startsWith('image')"
                :path="item.path"
                :alt="item.name"
                fit="contain"
              />
              <ItemIcon v-else :item="item" class="size-12" />
            </div>
            <div class="text-xs text-center break-all line-clamp-2">
              {{ item.name }}
            </div>
          </div>
        </div>
        <div
          v-else
          class="p-2 rounded-md flex gap-2 cursor-pointer items-center hover:bg-accent"
          @click="handleClick(items[row.index])"
          @dblclick="handleDoubleClick(items[row.index])"
        >
          <ItemIcon :item="items[row.index]" class="shrink-0 size-5" />
          <div class="text-xs truncate">
            {{ items[row.index].name }}
          </div>
        </div>
      </div>
    </div>
  </ScrollArea>
</template>
