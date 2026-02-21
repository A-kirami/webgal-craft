<script setup lang="ts">
import { join } from '@tauri-apps/api/path'
import { File, FileImage, FileJson2, FileMusic, FileVideo, FileVolume, Folder } from 'lucide-vue-next'

const { assetType } = defineProps<{ assetType: string }>()

let currentPath = $(defineModel<string>('current-path', { required: true }))

const preferenceStore = usePreferenceStore()
const tabsStore = useTabsStore()
const fileStore = useFileStore()
const workspaceStore = useWorkspaceStore()

const fileViewerRef = useTemplateRef<InstanceType<typeof FileViewer>>('fileViewerRef')

let scrollTop = 0
let lastSelectedPath = $ref('')
let lastSelectedAt = $ref(0)

const DOUBLE_CLICK_THRESHOLD_MS = 260

const onScroll = useDebounceFn((event: Event) => {
  scrollTop = (event.target as HTMLElement).scrollTop
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
    return result.map(item => toFileViewerItem(item))
  } catch (error) {
    errorMsg = error instanceof Error ? error.message : String(error)
    return []
  } finally {
    isLoading = false
  }
}, [])

watch(() => currentPath, () => {
  fileViewerRef.value?.scrollToIndex(0)
})

function toFileViewerItem(item: FileSystemItem): FileViewerItem {
  return {
    name: item.name,
    path: item.path,
    isDir: item.isDir,
    mimeType: item.isDir ? undefined : item.mimeType,
  }
}

function getIconComponent(item: FileViewerItem) {
  if (item.isDir) {
    return Folder
  }
  const mime = item.mimeType ?? ''
  if (mime.startsWith('image/')) {
    return FileImage
  }
  if (mime.startsWith('video/')) {
    return FileVideo
  }
  if (mime.startsWith('audio/')) {
    return assetType === 'vocal' ? FileVolume : FileMusic
  }
  if (mime === 'application/json') {
    return FileJson2
  }
  return File
}

function handleNavigate(item: FileViewerItem) {
  const basePath = assetBasePath.value
  if (!basePath) {
    currentPath = ''
    return
  }
  currentPath = item.path.replace(basePath, '')
}

function handleSelect(item: FileViewerItem) {
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
</script>

<template>
  <FileViewer
    ref="fileViewerRef"
    :items="items"
    :view-mode="preferenceStore.assetViewMode"
    :is-loading="isLoading"
    :error-msg="errorMsg"
    :zoom="preferenceStore.assetZoom[0]"
    @select="handleSelect"
    @navigate="handleNavigate"
  >
    <template #icon="{ item, iconSize }">
      <component
        :is="getIconComponent(item)"
        class="shrink-0"
        :style="{ width: `${iconSize}px`, height: `${iconSize}px` }"
        :stroke-width="1.25"
      />
    </template>
  </FileViewer>
</template>
