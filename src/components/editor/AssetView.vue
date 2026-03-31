<script setup lang="ts">
import { basename, join } from '@tauri-apps/api/path'
import { File, FileImage, FileJson2, FileMusic, FileVideo, FileVolume, Folder } from 'lucide-vue-next'

import FileTreeContextMenuContent from '~/components/editor/FileTreeContextMenuContent.vue'
import { useAssetViewItemsLoader } from '~/components/editor/useAssetViewItemsLoader'
import { PopoverAnchor } from '~/components/ui/popover'
import { useFileSystemEvents } from '~/composables/useFileSystemEvents'
import { getFileTreeNameSelectionEnd } from '~/features/editor/file-tree/file-tree'
import { gameFs } from '~/services/game-fs'
import { gameAssetDir } from '~/services/platform/app-paths'
import { FileSystemItem, useFileStore } from '~/stores/file'
import { usePreferenceStore } from '~/stores/preference'
import { useTabsStore } from '~/stores/tabs'
import { useWorkspaceStore } from '~/stores/workspace'
import { FileViewerItem, FileViewerSortBy, FileViewerSortOrder } from '~/types/file-viewer'
import { handleError } from '~/utils/error-handler'

import type { FileSystemEvent } from '~/composables/useFileSystemEvents'

interface AssetViewProps {
  assetType: string
  searchQuery?: string
  sortBy?: FileViewerSortBy
  sortOrder?: FileViewerSortOrder
}

interface AssetViewEmits {
  'update:sortBy': [sortBy: FileViewerSortBy]
  'update:sortOrder': [sortOrder: FileViewerSortOrder]
}

interface AssetViewExpose {
  createFolderInCurrentDirectory: () => Promise<void>
}

const {
  assetType,
  searchQuery = '',
  sortBy = 'name',
  sortOrder = 'asc',
} = defineProps<AssetViewProps>()
const emit = defineEmits<AssetViewEmits>()

let currentPath = $(defineModel<string>('current-path', { required: true }))

const preferenceStore = usePreferenceStore()
const tabsStore = useTabsStore()
const fileStore = useFileStore()
const fileSystemEvents = useFileSystemEvents()
const workspaceStore = useWorkspaceStore()
const { t } = useI18n()

const fileViewerRef = useTemplateRef<InstanceType<typeof FileViewer>>('fileViewerRef')
const renameInputRef = useTemplateRef('renameInputRef')

let scrollTop = 0
let lastSelectedPath = $ref('')
let lastSelectedAt = $ref(0)
let renameAnchorElement = $ref<HTMLElement>()
let renameTargetItem = $ref<FileViewerItem>()
let renameValue = $ref('')
let isRenamePopoverOpen = $ref(false)
let isRenameSubmitting = $ref(false)

const DOUBLE_CLICK_THRESHOLD_MS = 260
const CREATE_FOLDER_RENAME_POLL_DELAY_MS = 50
const CREATE_FOLDER_RENAME_POLL_RETRY_COUNT = 20
const FILE_SYSTEM_REFRESH_EVENT_TYPES = [
  'file:created',
  'file:removed',
  'file:renamed',
  'file:modified',
  'directory:created',
  'directory:removed',
  'directory:renamed',
  'directory:modified',
] as const satisfies FileSystemEvent['type'][]

function resolveInputElement(source: unknown): HTMLInputElement | undefined {
  if (typeof HTMLInputElement !== 'undefined' && source instanceof HTMLInputElement) {
    return source
  }

  if (Array.isArray(source)) {
    return source
      .map(item => resolveInputElement(item))
      .find((item): item is HTMLInputElement => item instanceof HTMLInputElement)
  }

  if (typeof source === 'object' && source !== null && '$el' in source) {
    const element = (source as { $el?: unknown }).$el
    return typeof HTMLInputElement !== 'undefined' && element instanceof HTMLInputElement
      ? element
      : undefined
  }
}

const onScroll = useDebounceFn((event: Event) => {
  scrollTop = (event.target as HTMLElement).scrollTop
  if (isRenamePopoverOpen && renameAnchorElement && !renameAnchorElement.isConnected) {
    closeRenamePopover()
  }
}, 100)

useEventListener(() => fileViewerRef.value?.viewport, 'scroll', onScroll)

onActivated(() => {
  fileViewerRef.value?.viewport?.scrollTo({ top: scrollTop })
})

const assetBasePath = computedAsync(async () => {
  if (!workspaceStore.currentGame?.path) {
    return ''
  }

  return await gameAssetDir(workspaceStore.currentGame.path, assetType)
}, '')

const currentDirectoryPath = computedAsync(async () => {
  const basePath = assetBasePath.value
  if (!basePath) {
    return ''
  }

  return await join(basePath, currentPath)
}, '')

const {
  errorMsg: errorMsgRef,
  isLoading: isLoadingRef,
  items: itemsRef,
  scheduleItemsRefresh,
} = useAssetViewItemsLoader({
  assetBasePath,
  currentDirectoryPath,
  currentPath: () => currentPath,
  loadDirectory: directoryPath => fileStore.getFolderContents(directoryPath),
  mapItem: toFileViewerItem,
})

const items = $computed(() => itemsRef.value)
const isLoading = $computed(() => isLoadingRef.value)
const errorMsg = $computed(() => errorMsgRef.value)

const filteredItems = $computed(() => {
  const keyword = searchQuery.trim().toLocaleLowerCase()
  if (!keyword) {
    return items
  }

  return items.filter(item => item.name.toLocaleLowerCase().includes(keyword))
})

const currentDirectoryContextMenuItem = $computed(() => {
  const directoryPath = currentDirectoryPath.value
  if (!directoryPath) {
    return
  }

  const directoryName = currentPath
    .split(/[/\\]+/)
    .findLast(Boolean) ?? assetType

  return {
    isDir: true,
    name: directoryName,
    path: directoryPath,
  }
})

const renamePopoverAlign = $computed(() =>
  preferenceStore.assetViewMode === 'grid' ? 'center' : 'start',
)
const previewCwd = $computed(() => workspaceStore.currentGame?.path)
const previewBaseUrl = $computed(() => workspaceStore.currentGameServeUrl)

const isRenameDuplicate = $computed(() => {
  const currentItem = renameTargetItem
  const nextName = renameValue.trim().toLocaleLowerCase()

  if (!currentItem || !nextName) {
    return false
  }

  return items.some(item =>
    item.path !== currentItem.path
    && item.name.trim().toLocaleLowerCase() === nextName,
  )
})

watch(() => currentPath, () => {
  fileViewerRef.value?.scrollToIndex(0)
  closeRenamePopover()
})

watch(() => searchQuery, () => {
  fileViewerRef.value?.scrollToIndex(0)
  closeRenamePopover()
})

watch(() => filteredItems.map(item => item.path).join('|'), () => {
  if (isRenamePopoverOpen && renameAnchorElement && !renameAnchorElement.isConnected) {
    closeRenamePopover()
  }
})

function toFileViewerItem(item: FileSystemItem): FileViewerItem {
  return {
    name: item.name,
    path: item.path,
    isDir: item.isDir,
    mimeType: item.isDir ? undefined : item.mimeType,
    size: item.size,
    modifiedAt: item.modifiedAt,
    createdAt: item.createdAt,
  }
}

function normalizeFileSystemPath(path: string): string {
  return path
    .replaceAll('\\', '/')
    .replace(/\/+$/, '')
}

function isPathWithinDirectory(path: string, directoryPath: string): boolean {
  const normalizedPath = normalizeFileSystemPath(path)
  const normalizedDirectoryPath = normalizeFileSystemPath(directoryPath)

  return normalizedPath === normalizedDirectoryPath
    || normalizedPath.startsWith(`${normalizedDirectoryPath}/`)
}

function isFileSystemEventRelevant(event: FileSystemEvent): boolean {
  const directoryPath = currentDirectoryPath.value
  if (!directoryPath) {
    return false
  }

  if ('path' in event) {
    return isPathWithinDirectory(event.path, directoryPath)
      || (event.type.startsWith('directory:') && isPathWithinDirectory(directoryPath, event.path))
  }

  return isPathWithinDirectory(event.oldPath, directoryPath)
    || isPathWithinDirectory(event.newPath, directoryPath)
    || (event.type.startsWith('directory:') && (
      isPathWithinDirectory(directoryPath, event.oldPath)
      || isPathWithinDirectory(directoryPath, event.newPath)
    ))
}

function getIconComponent(item: FileViewerItem) {
  if (item.isDir) {
    return Folder
  }

  const mimeType = item.mimeType ?? ''
  if (mimeType.startsWith('image/')) {
    return FileImage
  }
  if (mimeType.startsWith('video/')) {
    return FileVideo
  }
  if (mimeType.startsWith('audio/')) {
    return assetType === 'vocal' ? FileVolume : FileMusic
  }
  if (mimeType === 'application/json') {
    return FileJson2
  }

  return File
}

function handleNavigate(item: FileViewerItem): void {
  const basePath = assetBasePath.value
  if (!basePath) {
    currentPath = ''
    return
  }

  currentPath = item.path.replace(basePath, '')
}

function handleSelect(item: FileViewerItem): void {
  tabsStore.openTab(item.name, item.path)

  const now = Date.now()
  if (item.path === lastSelectedPath && now - lastSelectedAt <= DOUBLE_CLICK_THRESHOLD_MS) {
    const index = tabsStore.findTabIndex(item.path)
    const tab = tabsStore.tabs[index]
    if (tab?.isPreview) {
      tabsStore.fixPreviewTab(index)
    }
  }

  lastSelectedPath = item.path
  lastSelectedAt = now
}

function closeRenamePopover(): void {
  isRenamePopoverOpen = false
  isRenameSubmitting = false
  renameAnchorElement = undefined
  renameTargetItem = undefined
  renameValue = ''
}

function findRenameAnchor(path: string): HTMLElement | undefined {
  const viewport = fileViewerRef.value?.viewport
  if (!viewport) {
    return undefined
  }

  const itemElement = [...viewport.querySelectorAll<HTMLElement>('[data-file-viewer-path]')]
    .find(element => element.dataset.fileViewerPath === path)

  return itemElement?.querySelector<HTMLElement>('[data-file-viewer-name]') ?? undefined
}

function getRenameFallbackAnchor(): HTMLElement | undefined {
  return fileViewerRef.value?.viewport
}

function isItemVisibleInCurrentFilter(path: string): boolean {
  return filteredItems.some(item => item.path === path)
}

function isCurrentDirectorySnapshotActive(directoryPathSnapshot: string | undefined): boolean {
  return !!directoryPathSnapshot && currentDirectoryPath.value === directoryPathSnapshot
}

async function resolveRenameAnchor(
  path: string,
  directoryPathSnapshot?: string,
): Promise<HTMLElement | undefined> {
  if (directoryPathSnapshot && !isCurrentDirectorySnapshotActive(directoryPathSnapshot)) {
    return undefined
  }

  if (!isItemVisibleInCurrentFilter(path)) {
    return getRenameFallbackAnchor()
  }

  return await waitForRenameAnchor(path, directoryPathSnapshot) ?? getRenameFallbackAnchor()
}

function normalizeRenameTarget(item: { path: string, name: string, isDir?: boolean }): FileViewerItem {
  return items.find(entry => entry.path === item.path) ?? {
    isDir: item.isDir ?? false,
    name: item.name,
    path: item.path,
  }
}

function hasItemWithName(name: string): boolean {
  const normalizedName = name.trim().toLocaleLowerCase()
  if (!normalizedName) {
    return false
  }

  return items.some(item => item.name.trim().toLocaleLowerCase() === normalizedName)
}

function resolveNextCreatedFolderName(): string {
  const defaultFolderName = t('edit.fileTree.defaultFolderName')
  if (!hasItemWithName(defaultFolderName)) {
    return defaultFolderName
  }

  let suffix = 2
  while (hasItemWithName(`${defaultFolderName} ${suffix}`)) {
    suffix++
  }

  return `${defaultFolderName} ${suffix}`
}

async function waitForCreatedItem(
  path: string,
  directoryPathSnapshot?: string,
  attempt: number = 0,
): Promise<FileViewerItem | undefined> {
  if (directoryPathSnapshot && !isCurrentDirectorySnapshotActive(directoryPathSnapshot)) {
    return undefined
  }

  const targetItem = items.find(item => item.path === path)
  if (targetItem || attempt >= CREATE_FOLDER_RENAME_POLL_RETRY_COUNT - 1) {
    return targetItem
  }

  await nextTick()
  await new Promise<void>(resolve => setTimeout(resolve, CREATE_FOLDER_RENAME_POLL_DELAY_MS))
  return waitForCreatedItem(path, directoryPathSnapshot, attempt + 1)
}

async function waitForRenameAnchor(
  path: string,
  directoryPathSnapshot?: string,
  attempt: number = 0,
): Promise<HTMLElement | undefined> {
  if (directoryPathSnapshot && !isCurrentDirectorySnapshotActive(directoryPathSnapshot)) {
    return undefined
  }

  const anchorElement = findRenameAnchor(path)
  if (anchorElement || attempt >= CREATE_FOLDER_RENAME_POLL_RETRY_COUNT - 1) {
    return anchorElement
  }

  await nextTick()
  await new Promise<void>(resolve => setTimeout(resolve, CREATE_FOLDER_RENAME_POLL_DELAY_MS))
  return waitForRenameAnchor(path, directoryPathSnapshot, attempt + 1)
}

async function scrollRenameTargetIntoView(path: string): Promise<void> {
  fileViewerRef.value?.scrollToItemPath(path)
  await nextTick()
}

async function handleContextMenuRename(
  item: { path: string, name: string, isDir?: boolean },
  directoryPathSnapshot?: string,
): Promise<void> {
  if (directoryPathSnapshot && !isCurrentDirectorySnapshotActive(directoryPathSnapshot)) {
    return
  }

  const targetItem = normalizeRenameTarget(item)
  const anchorElement = await resolveRenameAnchor(targetItem.path, directoryPathSnapshot)
  if (directoryPathSnapshot && !isCurrentDirectorySnapshotActive(directoryPathSnapshot)) {
    return
  }
  if (!anchorElement) {
    return
  }

  renameAnchorElement = anchorElement
  renameTargetItem = targetItem
  renameValue = targetItem.name
  isRenamePopoverOpen = true

  await nextTick()

  const inputElement = resolveInputElement(renameInputRef.value)
  if (!inputElement) {
    return
  }

  inputElement.focus()
  inputElement.setSelectionRange(0, getFileTreeNameSelectionEnd(targetItem.name, targetItem.isDir))
}

async function handleContextMenuCreateFolder(item: { path: string, name: string, isDir?: boolean }): Promise<void> {
  if (!item.path) {
    return
  }

  const folderName = resolveNextCreatedFolderName()
  const currentDirectorySnapshot = currentDirectoryPath.value || item.path

  try {
    const createdPath = await gameFs.createFolder(item.path, folderName)
    const createdName = await basename(createdPath)

    scheduleItemsRefresh(true)

    const targetItem = await waitForCreatedItem(createdPath, currentDirectorySnapshot)
    if (!isCurrentDirectorySnapshotActive(currentDirectorySnapshot)) {
      return
    }

    if (targetItem) {
      await scrollRenameTargetIntoView(targetItem.path)
      await handleContextMenuRename(targetItem, currentDirectorySnapshot)
      return
    }

    await handleContextMenuRename({
      isDir: true,
      name: createdName || folderName,
      path: createdPath,
    }, currentDirectorySnapshot)
  } catch (error) {
    handleError(error)
  }
}

async function createFolderInCurrentDirectory(): Promise<void> {
  if (!currentDirectoryContextMenuItem) {
    return
  }

  await handleContextMenuCreateFolder(currentDirectoryContextMenuItem)
}

const assetViewExpose: AssetViewExpose = {
  createFolderInCurrentDirectory,
}

defineExpose(assetViewExpose)

function handleRenamePopoverOpenChange(nextOpen: boolean): void {
  if (!nextOpen) {
    closeRenamePopover()
  }
}

function handleRenameCancel(): void {
  closeRenamePopover()
}

async function handleRenameSubmit(): Promise<void> {
  const item = renameTargetItem
  if (!item || isRenameSubmitting) {
    return
  }

  const nextName = renameValue.trim()
  if (!nextName || nextName === item.name) {
    closeRenamePopover()
    return
  }

  if (isRenameDuplicate) {
    return
  }

  isRenameSubmitting = true

  try {
    await gameFs.renameFile(item.path, nextName)
    closeRenamePopover()
  } catch (error) {
    handleError(error)
    renameValue = item.name
    isRenameSubmitting = false
  }
}

const debouncedRefreshItems = useDebounceFn(() => {
  scheduleItemsRefresh(true)
}, 100)

for (const eventType of FILE_SYSTEM_REFRESH_EVENT_TYPES) {
  fileSystemEvents.on(eventType, (event) => {
    if (!isFileSystemEventRelevant(event)) {
      return
    }

    debouncedRefreshItems()
  })
}
</script>

<template>
  <div class="h-full">
    <FileViewer
      ref="fileViewerRef"
      :error-msg="errorMsg"
      :highlighted-item-path="renameTargetItem?.path"
      :is-loading="isLoading"
      :items="filteredItems"
      :preview-cwd="previewCwd"
      :preview-base-url="previewBaseUrl"
      :sort-by="sortBy"
      :sort-order="sortOrder"
      :view-mode="preferenceStore.assetViewMode"
      :zoom="preferenceStore.assetZoom[0]"
      @navigate="handleNavigate"
      @select="handleSelect"
      @update:sort-by="(value) => emit('update:sortBy', value)"
      @update:sort-order="(value) => emit('update:sortOrder', value)"
    >
      <template #icon="{ item, iconSize }">
        <component
          :is="getIconComponent(item)"
          class="shrink-0"
          :stroke-width="1.25"
          :style="{ width: `${iconSize}px`, height: `${iconSize}px` }"
        />
      </template>
      <template #context-menu="{ item }">
        <FileTreeContextMenuContent :item="item" :on-rename="handleContextMenuRename" />
      </template>
      <template v-if="currentDirectoryContextMenuItem" #background-context-menu>
        <FileTreeContextMenuContent
          :item="currentDirectoryContextMenuItem"
          is-root
          :on-create-folder="handleContextMenuCreateFolder"
        />
      </template>
    </FileViewer>

    <Popover :open="isRenamePopoverOpen" @update:open="handleRenamePopoverOpenChange">
      <PopoverAnchor v-if="renameAnchorElement" :reference="renameAnchorElement" />
      <PopoverContent
        v-if="renameTargetItem"
        :align="renamePopoverAlign"
        class="p-2 max-w-56 w-auto"
        side="bottom"
        @close-auto-focus.prevent
      >
        <Input
          ref="renameInputRef"
          ::="renameValue"
          :class="[
            'h-7 text-xs shadow-none field-sizing-content w-auto max-w-full',
            isRenameDuplicate ? 'text-destructive focus-visible:ring-destructive' : ''
          ]"
          :disabled="isRenameSubmitting"
          @keydown.stop
          @keydown.enter="handleRenameSubmit"
          @keydown.escape="handleRenameCancel"
        />
      </PopoverContent>
    </Popover>
  </div>
</template>
