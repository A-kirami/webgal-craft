<script setup lang="ts">
interface FileItem {
  path: string
  name: string
  isDir?: boolean
  source?: string
}

interface Props {
  item: FileItem
  selectedItems?: FileItem[]
  onRename?: (item: FileItem) => void
  onCreateFile?: (item: FileItem) => void
  onCreateFolder?: (item: FileItem) => void
  clipboardKey?: string
  disabled?: boolean
  operationDisabled?: boolean
  isRoot?: boolean
}

const {
  item,
  selectedItems,
  onRename,
  onCreateFile,
  onCreateFolder,
  clipboardKey = 'default',
  disabled = false,
  operationDisabled = false,
  isRoot = false,
} = defineProps<Props>()
</script>

<template>
  <ContextMenu>
    <ContextMenuTrigger as-child :disabled="disabled">
      <slot />
    </ContextMenuTrigger>
    <ContextMenuContent class="w-52" @close-auto-focus.prevent>
      <FileTreeContextMenuContent
        :clipboard-key="clipboardKey"
        :is-root="isRoot"
        :item="item"
        :selected-items="selectedItems"
        :on-create-file="onCreateFile"
        :on-create-folder="onCreateFolder"
        :on-rename="onRename"
        :operation-disabled="operationDisabled"
      />
    </ContextMenuContent>
  </ContextMenu>
</template>
