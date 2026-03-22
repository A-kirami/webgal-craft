<script setup lang="ts">
import { dirname } from '@tauri-apps/api/path'
import { openPath } from '@tauri-apps/plugin-opener'
import {
  ClipboardPaste,
  Copy,
  FilePlus,
  FolderOpen,
  FolderPlus,
  Pencil,
  Scissors,
  Trash2,
} from 'lucide-vue-next'

import { useFileClipboard } from '~/composables/useFileClipboard'
import { gameFs } from '~/services/game-fs'
import { useModalStore } from '~/stores/modal'
import { settleBatch } from '~/utils/batch'
import { handleError } from '~/utils/error-handler'

import type { Component } from 'vue'

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

const { clipboard, operationType, canPaste, setClipboard, clearClipboard } = $(useFileClipboard(clipboardKey))
const modalStore = useModalStore()
const { t } = useI18n()

// ==================== 菜单操作 ====================

function handleCreateFile() {
  onCreateFile?.(item)
}

function handleCreateFolder() {
  onCreateFolder?.(item)
}

function handleCopy() {
  setClipboard({
    path: item.path,
    isDir: item.isDir ?? false,
    isCut: false,
  })
}

function handleCut() {
  setClipboard({
    path: item.path,
    isDir: item.isDir ?? false,
    isCut: true,
  })
}

async function handlePaste() {
  if (!canPaste) {
    return
  }

  try {
    const targetPath = item.isDir ? item.path : await dirname(item.path)
    const isCut = operationType === 'cut'

    const { succeeded, failed } = await settleBatch(
      clipboard.map(clipboardItem => () =>
        isCut ? gameFs.moveFile(clipboardItem.path, targetPath) : gameFs.copyFile(clipboardItem.path, targetPath),
      ),
    )

    if (failed.length > 0) {
      const errorMsg = failed.map(f => f.error.message).join('; ')
      logger.error(`粘贴失败: ${errorMsg}`)
      toast.error(succeeded.length > 0 ? t('edit.fileTree.pastePartialFailed', { failed: failed.length, total: clipboard.length }) : t('edit.fileTree.pasteFailed'))
    }

    if (succeeded.length > 0) {
      if (isCut) {
        clearClipboard()
      }
      toast.success(clipboard.length === 1 ? t('edit.fileTree.pasteSuccess') : t('edit.fileTree.pasteMultipleSuccess', { count: succeeded.length }))
    }
  } catch (error) {
    handleError(error)
  }
}

function handleRename() {
  onRename?.(item)
}

function handleDelete() {
  modalStore.open('DeleteFileModal', {
    file: item,
  })
}

async function handleRevealInExplorer() {
  try {
    const pathToOpen = item.isDir ? item.path : await dirname(item.path)
    await openPath(pathToOpen)
  } catch (error) {
    logger.error(`打开文件管理器失败: ${error}`)
  }
}

// ==================== 菜单结构 ====================

interface MenuItem {
  icon: Component
  label: string
  onClick: () => void
  disabled?: boolean
  class?: string
}

const menuItems = $computed(() => {
  const items: (MenuItem | 'separator')[] = []
  const canCreateItems = isRoot || item.isDir

  if (canCreateItems) {
    items.push(
      { icon: FilePlus, label: t('edit.fileTree.newFile'), onClick: handleCreateFile },
      { icon: FolderPlus, label: t('edit.fileTree.newFolder'), onClick: handleCreateFolder },
      'separator',
    )
  }

  if (!isRoot) {
    items.push(
      { icon: Copy, label: t('edit.fileTree.copy'), onClick: handleCopy },
      { icon: Scissors, label: t('edit.fileTree.cut'), onClick: handleCut },
    )
  }

  if (canCreateItems) {
    items.push({
      icon: ClipboardPaste,
      label: t('edit.fileTree.paste'),
      onClick: handlePaste,
      disabled: !canPaste,
    })
  }

  if (!isRoot) {
    items.push(
      'separator',
      { icon: Pencil, label: t('edit.fileTree.rename'), onClick: handleRename },
      {
        icon: Trash2,
        label: t('common.delete'),
        onClick: handleDelete,
        class: 'text-destructive text-13px! focus:text-destructive-foreground focus:bg-destructive',
      },
    )
  }

  items.push(
    'separator',
    { icon: FolderOpen, label: t('edit.fileTree.revealInExplorer'), onClick: handleRevealInExplorer },
  )

  return items
})
</script>

<template>
  <ContextMenu>
    <ContextMenuTrigger as-child :disabled="disabled">
      <slot />
    </ContextMenuTrigger>
    <ContextMenuContent class="w-52" @close-auto-focus.prevent>
      <template v-for="(menuItem, index) in menuItems" :key="index">
        <ContextMenuSeparator v-if="menuItem === 'separator'" />
        <ContextMenuItem
          v-else
          :class="menuItem.class"
          :disabled="menuItem.disabled"
          @click="menuItem.onClick"
        >
          <component :is="menuItem.icon" class="mr-2 size-3.5" />
          {{ menuItem.label }}
        </ContextMenuItem>
      </template>
    </ContextMenuContent>
  </ContextMenu>
</template>
