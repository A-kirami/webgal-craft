<script setup lang="ts">
import FileTreeContextMenuContent from '~/components/editor/FileTreeContextMenuContent.vue'

interface FileItem {
  path: string
  name: string
  isDir?: boolean
}

interface Props {
  item: FileItem
  onRename?: (item: FileItem) => void
  onCreateFile?: (item: FileItem) => void
  onCreateFolder?: (item: FileItem) => void
  clipboardKey?: string
  disabled?: boolean
  isRoot?: boolean
}

const {
  item,
  onRename,
  onCreateFile,
  onCreateFolder,
  clipboardKey = 'default',
  disabled = false,
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
        :on-create-file="onCreateFile"
        :on-create-folder="onCreateFolder"
        :on-rename="onRename"
      />
    </ContextMenuContent>
  </ContextMenu>
</template>
