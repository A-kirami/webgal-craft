<script setup lang="ts" generic="T extends object">
import { LucideFile, LucideFolder, LucideFolderOpen } from '@lucide/vue'

import { useFileTreeController } from '~/features/editor/file-tree/useFileTreeController'
import { useShortcut } from '~/features/editor/shortcut/useShortcut'
import { useShortcutContext } from '~/features/editor/shortcut/useShortcutContext'
import { useModalStore } from '~/stores/modal'
import { FileViewerSortBy, FileViewerSortOrder } from '~/types/file-viewer'

import type { FlattenedItem } from 'reka-ui'
import type { ShallowRef } from 'vue'
import type { FileTreeDefaultFileNameParts } from '~/features/editor/file-tree/file-tree'

interface Props {
  items: T[]
  getKey: (item: T) => string
  defaultExpanded?: string[]
  nameField?: keyof T | ((item: T) => string)
  enableTooltip?: boolean
  tooltipContent?: (item: FlattenedItem<T>) => string
  enableContextMenu?: boolean
  defaultFileNameParts?: FileTreeDefaultFileNameParts | (() => FileTreeDefaultFileNameParts)
  isLoading?: boolean
  treeName?: string
  openCreatedFileInTab?: boolean
  sortBy?: FileViewerSortBy
  sortOrder?: FileViewerSortOrder
}

const {
  items,
  getKey,
  defaultExpanded = [],
  nameField,
  enableTooltip = false,
  tooltipContent,
  enableContextMenu = true,
  defaultFileNameParts,
  isLoading = false,
  treeName,
  openCreatedFileInTab = false,
  sortBy = 'name',
  sortOrder = 'asc',
} = defineProps<Props>()
const inputRef: Readonly<ShallowRef<unknown>> = useTemplateRef('inputRef')
const creatingInputRef: Readonly<ShallowRef<unknown>> = useTemplateRef('creatingInputRef')
const fileTreeContainerRef: Readonly<ShallowRef<HTMLDivElement | null>> = useTemplateRef<HTMLDivElement>('fileTreeContainerRef')

const emit = defineEmits<{
  click: [item: FlattenedItem<T>]
  dblclick: [item: FlattenedItem<T>]
  auxclick: [item: FlattenedItem<T>]
  createFile: [item: { path: string, name: string, isDir?: boolean }]
  createFolder: [item: { path: string, name: string, isDir?: boolean }]
}>()

const selectedItem = defineModel<T>('selectedItem')
const modalStore = useModalStore()

const { t } = useI18n()
const scrollAreaRef: Readonly<ShallowRef<unknown>> = useTemplateRef('scrollAreaRef')
const {
  createState,
  expanded,
  itemMap,
  renameState,
  sortedItems,
  cancelCreating,
  collapseAll,
  getItemName,
  getRootPath,
  getViewportElement,
  handleCancelRename,
  handleContextMenuCreateFile,
  handleContextMenuCreateFolder,
  handleContextMenuRename,
  handleCreate,
  handleCreateBlur,
  handleEnterKey,
  handleEscapeKey,
  handleRename,
  handleRenameBlur,
  isCreateDuplicate,
  isCreatingItem,
  isRenameDuplicate,
  isRenaming,
  processFlattenItems,
  startCreating,
  toFileItem,
} = useFileTreeController<T>({
  creatingInputRef,
  defaultExpanded: () => defaultExpanded,
  defaultFileNameParts,
  defaultFileNamePartsFallback: () => ({
    extension: '.txt',
    stem: t('edit.fileTree.defaultFileStem'),
  }),
  defaultFolderName: () => t('edit.fileTree.defaultFolderName'),
  fileTreeContainerRef,
  getKey,
  inputRef,
  items: () => items,
  nameField,
  openCreatedFileInTab: () => openCreatedFileInTab,
  scrollAreaRef,
  sortBy: () => sortBy,
  sortOrder: () => sortOrder,
  treeName: () => treeName,
})

// 暴露创建入口和折叠操作给父组件，便于 toolbar / 快捷键触发
defineExpose({
  startCreating,
  collapseAll,
  getViewportElement,
})

function toSelectedFileItem() {
  const currentSelectedItem = selectedItem.value as Record<string, unknown> | undefined
  if (!currentSelectedItem || typeof currentSelectedItem.path !== 'string') {
    return
  }

  return {
    isDir: Array.isArray(currentSelectedItem.children),
    name: getItemName(selectedItem.value as T),
    path: currentSelectedItem.path,
  }
}

function toFocusedFileItem() {
  if (typeof document === 'undefined') {
    return
  }

  const activeElement = document.activeElement
  if (!(activeElement instanceof HTMLElement) || !fileTreeContainerRef.value?.contains(activeElement)) {
    return
  }

  const treeItemElement = activeElement.closest<HTMLElement>('[data-file-tree-path]')
  const itemPath = treeItemElement?.dataset.fileTreePath
  if (!itemPath) {
    return
  }

  const focusedItem = itemMap.get(itemPath)
  return focusedItem ? toFileItem(focusedItem) : undefined
}

function toShortcutTargetFileItem() {
  return toFocusedFileItem() ?? toSelectedFileItem()
}

function handleShortcutRename() {
  if (!enableContextMenu) {
    return
  }

  const fileItem = toShortcutTargetFileItem()
  if (!fileItem) {
    return
  }

  handleContextMenuRename(fileItem)
}

function handleShortcutDelete() {
  if (!enableContextMenu) {
    return
  }

  const fileItem = toShortcutTargetFileItem()
  if (!fileItem) {
    return
  }

  modalStore.open('DeleteFileModal', {
    file: fileItem,
  })
}

useShortcutContext({
  panelFocus: 'fileTree',
}, {
  target: fileTreeContainerRef,
  trackFocus: true,
})

useShortcut(() => ({
  execute: handleShortcutRename,
  i18nKey: 'shortcut.fileTree.rename',
  id: 'fileTree.rename',
  keys: enableContextMenu ? 'F2' : '',
  when: { panelFocus: 'fileTree' },
}))

useShortcut(() => ({
  execute: handleShortcutDelete,
  i18nKey: 'shortcut.fileTree.delete',
  id: 'fileTree.delete',
  keys: enableContextMenu ? 'Delete' : '',
  when: { panelFocus: 'fileTree' },
}))
</script>

<template>
  <ScrollArea ref="scrollAreaRef" class="flex-scroll-area h-full">
    <!-- 加载状态提示 -->
    <div v-if="isLoading" role="status" :aria-label="$t('common.loading')" class="flex h-full items-center justify-center">
      <div class="text-muted-foreground flex flex-col gap-3 items-center">
        <div class="border-2 border-current border-t-transparent rounded-full size-5 animate-spin" />
      </div>
    </div>

    <!-- 文件树内容 -->
    <Tree
      v-else
      v-slot="{ flattenItems: flattenItemsSlot }"
      v-model="selectedItem"
      ::expanded="expanded"
      :items="sortedItems"
      :get-key="getKey"
      selection-behavior="replace"
      class="text-13px h-full"
    >
      <TooltipProvider :skip-delay-duration="0" :ignore-non-keyboard-focus="true">
        <div ref="fileTreeContainerRef" class="relative">
          <template
            v-for="item in processFlattenItems(flattenItemsSlot)"
            :key="item._id"
          >
            <!-- 创建项的特殊渲染 -->
            <template v-if="isCreatingItem(item)">
              <TreeItem
                v-bind="item.bind"
                :level="item.level"
                :has-children="createState.type === 'folder'"
              >
                <TreeItemLabel :has-children="createState.type === 'folder'">
                  <span class="text-13px flex flex-1 gap-2 min-w-0 w-full items-center">
                    <LucideFile
                      v-if="createState.type === 'file'"
                      class="text-muted-foreground size-4 pointer-events-none"
                    />
                    <LucideFolder
                      v-else-if="createState.type === 'folder'"
                      class="text-muted-foreground size-4 pointer-events-none"
                    />
                    <Input
                      ref="creatingInputRef"
                      ::="createState.value"
                      :class="['px-0 py-0 h-5 text-13px!', isCreateDuplicate() ? 'text-destructive focus-visible:ring-destructive' : '']"
                      data-creating-input
                      autofocus
                      @blur="handleCreateBlur"
                      @keydown.stop
                      @keydown.enter="handleCreate"
                      @keydown.escape="cancelCreating"
                    />
                  </span>
                </TreeItemLabel>
              </TreeItem>
            </template>
            <!-- 正常项的渲染 -->
            <FileTreeContextMenu
              v-else
              :item="(() => {
                const flattenedItem = item as FlattenedItem<T>
                const fileItem = toFileItem(flattenedItem)
                itemMap.set(fileItem.path, flattenedItem)
                return fileItem
              })()"
              :on-rename="handleContextMenuRename"
              :on-create-file="handleContextMenuCreateFile"
              :on-create-folder="handleContextMenuCreateFolder"
              :disabled="!enableContextMenu"
            >
              <TreeItem
                v-slot="{ isExpanded }"
                v-bind="item.bind"
                :level="item.level"
                :has-children="item.hasChildren"
                :data-file-tree-path="toFileItem(item as FlattenedItem<T>).path"
                class="cursor-pointer"
                @keydown.enter.prevent="handleEnterKey(item as FlattenedItem<T>)"
                @keydown.escape.prevent="handleEscapeKey(item as FlattenedItem<T>)"
                @click="() => {
                  if (!isRenaming(item as FlattenedItem<T>)) {
                    emit('click', item as FlattenedItem<T>)
                  }
                }"
                @dblclick="emit('dblclick', item as FlattenedItem<T>)"
                @auxclick="(e: MouseEvent) => e.button === 1 && emit('auxclick', item as FlattenedItem<T>)"
              >
                <Tooltip :disabled="!enableTooltip">
                  <TooltipTrigger as-child>
                    <TreeItemLabel :has-children="item.hasChildren">
                      <span class="text-13px flex flex-1 gap-2 min-w-0 w-full items-center">
                        <template v-if="item.hasChildren">
                          <LucideFolderOpen
                            v-if="isExpanded"
                            class="text-muted-foreground size-4 pointer-events-none"
                          />
                          <LucideFolder
                            v-else
                            class="text-muted-foreground size-4 pointer-events-none"
                          />
                        </template>
                        <LucideFile
                          v-else
                          class="text-muted-foreground size-4 pointer-events-none"
                        />
                        <template v-if="isRenaming(item as FlattenedItem<T>)">
                          <Input
                            ref="inputRef"
                            v-model="renameState.value"
                            :class="['px-0 py-0 h-5 text-13px!', isRenameDuplicate(item as FlattenedItem<T>) ? 'text-destructive focus-visible:ring-destructive' : '']"
                            data-renaming-input
                            autofocus
                            @blur="handleRenameBlur(item as FlattenedItem<T>)"
                            @keydown.stop
                            @keydown.enter="handleRename(item as FlattenedItem<T>)"
                            @keydown.escape="handleCancelRename"
                          />
                        </template>
                        <div v-else class="whitespace-nowrap text-ellipsis overflow-hidden">
                          {{ getItemName((item as FlattenedItem<T>).value) }}
                        </div>
                      </span>
                    </TreeItemLabel>
                  </TooltipTrigger>
                  <TooltipContent
                    v-if="tooltipContent && !isCreatingItem(item)"
                    :disabled-portal="true"
                  >
                    <p>{{ tooltipContent(item as FlattenedItem<T>) }}</p>
                  </TooltipContent>
                </Tooltip>
              </TreeItem>
            </FileTreeContextMenu>
          </template>
        </div>
      </TooltipProvider>
      <!-- 虚拟根目录区域 -->
      <FileTreeContextMenu
        v-if="enableContextMenu"
        :item="{ path: getRootPath(), name: '', isDir: true }"
        :on-create-file="handleContextMenuCreateFile"
        :on-create-folder="handleContextMenuCreateFolder"
        is-root
        :disabled="false"
      >
        <div class="h-full min-h-[26px]" />
      </FileTreeContextMenu>
    </Tree>
  </ScrollArea>
</template>
