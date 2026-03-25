<script setup lang="ts" generic="T extends Record<string, any>">
import { basename } from '@tauri-apps/api/path'
import { LucideFile, LucideFolder, LucideFolderOpen } from 'lucide-vue-next'

import {
  getFileTreeNameSelectionEnd,
  getFileTreeParentPath,
  hasFileTreeDuplicateName,
  insertCreatingFileTreeItem,
  resolveFileTreeCreateBlurAction,
  resolveFileTreeCreateStart,
  resolveFileTreeRenameBlurAction,
} from '~/helper/file-tree'
import { gameFs } from '~/services/game-fs'
import { useEditorUIStateStore } from '~/stores/editor-ui-state'
import { useTabsStore } from '~/stores/tabs'
import { useWorkspaceStore } from '~/stores/workspace'
import { FileViewerSortBy, FileViewerSortOrder } from '~/types/file-viewer'
import { handleError } from '~/utils/error-handler'
import { createItemComparator, SortableItemAccessor } from '~/utils/sort'

import type { FlattenedItem } from 'reka-ui'

interface Props {
  items: T[]
  getKey: (item: T) => string
  defaultExpanded?: string[]
  nameField?: keyof T | ((item: T) => string)
  enableTooltip?: boolean
  tooltipContent?: (item: FlattenedItem<T>) => string
  enableContextMenu?: boolean
  defaultFileName?: string | (() => string)
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
  defaultFileName,
  isLoading = false,
  treeName,
  openCreatedFileInTab = false,
  sortBy = 'name',
  sortOrder = 'asc',
} = defineProps<Props>()

function getItemName(item: T): string {
  if (typeof nameField === 'function') {
    return nameField(item)
  }
  if (nameField) {
    return String(item[nameField] ?? '')
  }
  return String((item as Record<string, unknown>).name ?? '')
}

function getItemPath(item: T): string {
  return (item as Record<string, unknown>).path as string
}

function getItemChildren(item: T): T[] | undefined {
  const children = (item as Record<string, unknown>).children
  return Array.isArray(children) ? children as T[] : undefined
}

function hasItemChildren(item: T): boolean {
  return Array.isArray((item as Record<string, unknown>).children)
}

const treeAccessor: SortableItemAccessor<T> = {
  isDirectory: item => hasItemChildren(item),
  name: item => getItemName(item),
  size: item => (item as Record<string, unknown>).size as number | undefined,
  modifiedAt: item => (item as Record<string, unknown>).modifiedAt as number | undefined,
  createdAt: item => (item as Record<string, unknown>).createdAt as number | undefined,
}

function sortItemsRecursively(sourceItems: T[], comparator: (a: T, b: T) => number): T[] {
  return sourceItems.toSorted(comparator).map((item) => {
    const children = getItemChildren(item)
    if (!children || children.length === 0) {
      return item
    }

    return {
      ...item,
      children: sortItemsRecursively(children, comparator),
    }
  })
}

const sortedItems = $computed(() =>
  sortItemsRecursively(items, createItemComparator(sortBy, sortOrder, treeAccessor)),
)

function getRootPath(): string {
  if (sortedItems.length === 0) {
    return ''
  }
  return getFileTreeParentPath(getItemPath(sortedItems[0]))
}

function checkDuplicateName(parentPath: string, name: string, excludePath?: string): boolean {
  return hasFileTreeDuplicateName(items, {
    getChildren: getItemChildren,
    getName: getItemName,
    getPath: getItemPath,
  }, parentPath, name, excludePath)
}

function focusInput(
  inputElement: InstanceType<typeof Input> | null,
  containerElement: HTMLElement | null,
  dataAttr: string,
  selectStart: number,
  selectEnd: number,
) {
  requestAnimationFrame(() => {
    nextTick(() => {
      const inputEl = inputElement?.$el as HTMLInputElement | undefined
      if (inputEl) {
        inputEl.focus()
        inputEl.setSelectionRange(selectStart, selectEnd)
        return
      }

      if (containerElement) {
        const input = containerElement.querySelector(`[${dataAttr}]`) as HTMLInputElement | null
        if (input) {
          input.focus()
          input.setSelectionRange(selectStart, selectEnd)
        }
      }
    })
  })
}

// ==================== 重命名相关 ====================

let renameState = $ref({
  itemKey: undefined as string | undefined,
  value: '',
  isStarting: false,
  isInProgress: false,
})

const inputRef = $(useTemplateRef('inputRef'))
const fileTreeContainerRef = $(useTemplateRef('fileTreeContainerRef'))
const BLUR_CANCEL_DELAY = 50

function isRenameDuplicate(item: FlattenedItem<T>): boolean {
  const itemPath = getItemPath(item.value)
  const parentPath = getFileTreeParentPath(itemPath)
  return checkDuplicateName(parentPath, renameState.value, itemPath)
}

function startRenaming(item: FlattenedItem<T>) {
  const key = getKey(item.value)
  renameState.itemKey = key
  renameState.value = getItemName(item.value)
  renameState.isStarting = true

  const fileName = renameState.value
  const selectionEnd = getFileTreeNameSelectionEnd(fileName, item.hasChildren)

  focusInput(
    inputRef as InstanceType<typeof Input> | null,
    fileTreeContainerRef,
    'data-renaming-input',
    0,
    selectionEnd,
  )

  nextTick(() => {
    renameState.isStarting = false
  })
}

async function handleRename(item: FlattenedItem<T>) {
  const key = getKey(item.value)
  if (renameState.itemKey !== key || renameState.isStarting || renameState.isInProgress) {
    return
  }

  const newName = renameState.value.trim()
  const oldName = getItemName(item.value)

  if (!newName || newName === oldName) {
    renameState.itemKey = undefined
    return
  }

  if (isRenameDuplicate(item)) {
    return
  }

  renameState.isInProgress = true
  try {
    const oldPath = getItemPath(item.value)
    await gameFs.renameFile(oldPath, newName)
    renameState.itemKey = undefined
  } catch (error) {
    handleError(error)
    renameState.value = oldName
  } finally {
    renameState.isInProgress = false
  }
}

function handleRenameBlur(item: FlattenedItem<T>) {
  const key = getKey(item.value)
  const action = resolveFileTreeRenameBlurAction({
    currentItemKey: key,
    currentValue: renameState.value,
    isStarting: renameState.isStarting,
    originalName: getItemName(item.value),
    renamingItemKey: renameState.itemKey,
  })

  if (action === 'noop') {
    return
  }

  if (action === 'cancel') {
    setTimeout(() => {
      if (!renameState.isStarting) {
        renameState.itemKey = undefined
      }
    }, BLUR_CANCEL_DELAY)
    return
  }

  handleRename(item)
}

function handleCancelRename() {
  renameState.itemKey = undefined
}

function isRenaming(item: FlattenedItem<T>) {
  return renameState.itemKey === getKey(item.value)
}

// ==================== 创建相关 ====================
const CREATE_DELAY = 150
const CREATING_ITEM_ID_PREFIX = '__creating__'

let createState = $ref({
  parentPath: undefined as string | undefined,
  type: undefined as 'file' | 'folder' | undefined,
  value: '',
  isStarting: false,
  isInProgress: false,
})

const creatingInputRef = $(useTemplateRef('creatingInputRef'))

function isCreateDuplicate(): boolean {
  if (!createState.parentPath) {
    return false
  }
  return checkDuplicateName(createState.parentPath, createState.value)
}

function getDefaultFileName(): string {
  if (!defaultFileName) {
    return t('edit.fileTree.defaultFileName')
  }
  return typeof defaultFileName === 'function'
    ? defaultFileName()
    : defaultFileName
}

function startCreating(parentPath: string, type: 'file' | 'folder') {
  createState.isStarting = true
  createState.parentPath = parentPath
  createState.type = type
  const defaultFolderName = t('edit.fileTree.defaultFolderName')
  const createStart = resolveFileTreeCreateStart({
    accessor: {
      getChildren: getItemChildren,
      getPath: getItemPath,
    },
    defaultFileName: getDefaultFileName(),
    defaultFolderName,
    getKey,
    hasCustomFileName: !!defaultFileName,
    items,
    parentPath,
    type,
  })
  createState.value = createStart.value

  // 创建子项前强制展开父文件夹，避免输入框出现在折叠状态下用户看不见
  if (createStart.expandParentKey && !expanded.includes(createStart.expandParentKey)) {
    expanded = [...expanded, createStart.expandParentKey]
  }

  nextTick(() => {
    createState.isStarting = false
    focusInput(
      creatingInputRef as InstanceType<typeof Input> | null,
      fileTreeContainerRef,
      'data-creating-input',
      0,
      createStart.selectionEnd,
    )
  })
}

async function handleCreate() {
  if (createState.isStarting || createState.isInProgress) {
    return
  }

  const fileName = createState.value.trim()
  if (!createState.parentPath || !createState.type || !fileName) {
    cancelCreating()
    return
  }

  if (isCreateDuplicate()) {
    return
  }

  createState.isInProgress = true
  try {
    const isFile = createState.type === 'file'
    const createdPath = await (isFile
      ? gameFs.createFile(createState.parentPath, fileName)
      : gameFs.createFolder(createState.parentPath, fileName))

    if (openCreatedFileInTab && isFile && createdPath) {
      const createdName = await basename(createdPath)
      tabsStore.openTab(createdName, createdPath, { forceNormal: true, focus: true })
    }
    cancelCreating()
  } catch (error) {
    handleError(error)
  } finally {
    createState.isInProgress = false
  }
}

function handleCreateBlur() {
  const action = resolveFileTreeCreateBlurAction({
    defaultFileName: getDefaultFileName(),
    defaultFolderName: t('edit.fileTree.defaultFolderName'),
    isStarting: createState.isStarting,
    parentPath: createState.parentPath,
    type: createState.type,
    value: createState.value,
  })

  if (action === 'noop') {
    return
  }

  if (action === 'cancel') {
    setTimeout(() => {
      if (!createState.isStarting) {
        cancelCreating()
      }
    }, BLUR_CANCEL_DELAY)
    return
  }

  setTimeout(() => {
    if (!createState.isStarting) {
      handleCreate()
    }
  }, CREATE_DELAY)
}

function cancelCreating() {
  createState.parentPath = undefined
  createState.type = undefined
  createState.value = ''
}

function isCreatingItem(item: FlattenedItem<T>): boolean {
  return item._id.startsWith(CREATING_ITEM_ID_PREFIX)
}

function createCreatingItem(
  parentPath: string,
  type: 'file' | 'folder',
  parentLevel: number,
): FlattenedItem<T> {
  const creatingId = `${CREATING_ITEM_ID_PREFIX}${parentPath}${type}`
  const isFolder = type === 'folder'
  const creatingValue = {
    path: parentPath,
    name: '',
    __isCreating: true,
    __creatingType: type,
    ...(isFolder ? { children: [] } : {}),
  } as unknown as T

  return {
    _id: creatingId,
    value: creatingValue,
    index: -1,
    level: parentLevel + 1,
    hasChildren: isFolder,
    bind: {
      value: creatingValue,
      level: parentLevel + 1,
      ariaSetsize: 1,
      ariaPosinset: 1,
    },
  } as FlattenedItem<T>
}

function processFlattenItems(flattenItems: FlattenedItem<T>[]): FlattenedItem<T>[] {
  return insertCreatingFileTreeItem(flattenItems, {
    creation: createState,
    createItem: (parentPath, type, parentLevel) => createCreatingItem(parentPath, type, parentLevel),
    getItemPath,
  })
}

// ==================== 上下文菜单相关 ====================
function toFileItem(item: FlattenedItem<T>) {
  return {
    path: getItemPath(item.value),
    name: getItemName(item.value),
    isDir: item.hasChildren,
  }
}

const itemMap = new Map<string, FlattenedItem<T>>()

function handleContextMenuRename(fileItem: { path: string, name: string, isDir?: boolean }): void {
  const flattenedItem = itemMap.get(fileItem.path)
  if (flattenedItem) {
    startRenaming(flattenedItem)
  }
}

function handleContextMenuCreateFile(fileItem: { path: string, name: string, isDir?: boolean }): void {
  startCreating(fileItem.path, 'file')
}

function handleContextMenuCreateFolder(fileItem: { path: string, name: string, isDir?: boolean }): void {
  startCreating(fileItem.path, 'folder')
}

// ==================== 键盘事件处理 ====================

function handleF2Key(item: FlattenedItem<T>) {
  startRenaming(item)
}

function handleEnterKey(item: FlattenedItem<T>) {
  if (isRenaming(item) && !isRenameDuplicate(item)) {
    handleRename(item)
  }
}

function handleEscapeKey(item: FlattenedItem<T>) {
  if (isRenaming(item)) {
    handleCancelRename()
  }
}

// ==================== 组件状态管理 ====================

const emit = defineEmits<{
  click: [item: FlattenedItem<T>]
  dblclick: [item: FlattenedItem<T>]
  auxclick: [item: FlattenedItem<T>]
  createFile: [item: { path: string, name: string, isDir?: boolean }]
  createFolder: [item: { path: string, name: string, isDir?: boolean }]
}>()

const selectedItem = defineModel<T>('selectedItem')

const { t } = useI18n()
const workspaceStore = useWorkspaceStore()
const currentGameId = $computed(() => workspaceStore.currentGame?.id)

const editorUIStateStore = useEditorUIStateStore()
const tabsStore = useTabsStore()

function resolveExpandedState(): string[] {
  if (currentGameId && treeName) {
    const saved = editorUIStateStore.getFileTreeExpanded(currentGameId, treeName)
    return saved.length > 0 ? saved : defaultExpanded
  }
  return defaultExpanded
}

let expanded = $ref<string[]>(resolveExpandedState())

// 按 gameId + treeName 维度持久化展开状态，保证每个项目/面板的展开状态独立
watch($$(expanded), (newExpanded) => {
  if (currentGameId && treeName) {
    editorUIStateStore.setFileTreeExpanded(currentGameId, treeName, newExpanded)
  }
})

// 当 gameId 或 treeName 变化时，重新加载展开状态
watch([$$(currentGameId), () => treeName], () => {
  expanded = resolveExpandedState()
}, { immediate: true })

const scrollAreaRef = $(useTemplateRef('scrollAreaRef'))

// 暴露创建入口和折叠操作给父组件，便于 toolbar / 快捷键触发
defineExpose({
  startCreating,
  collapseAll: () => expanded = [],
  getViewportElement: () => scrollAreaRef?.viewport?.viewportElement ?? undefined,
})
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
                class="cursor-pointer"
                @keydown.f2.prevent="handleF2Key(item as FlattenedItem<T>)"
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
                            ::="renameState.value"
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
