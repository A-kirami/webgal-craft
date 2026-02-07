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

    const results = await Promise.allSettled(
      clipboard.map(clipboardItem =>
        isCut ? fsCmds.moveFile(clipboardItem.path, targetPath) : fsCmds.copyFile(clipboardItem.path, targetPath),
      ),
    )

    const failures = results.filter(r => r.status === 'rejected') as PromiseRejectedResult[]
    const successCount = results.length - failures.length

    if (failures.length > 0) {
      const errorMsg = failures.map(f => f.reason?.message || String(f.reason)).join('; ')
      logger.error(`粘贴失败: ${errorMsg}`)
      toast.error(successCount > 0 ? t('edit.fileTree.pastePartialFailed', { failed: failures.length, total: results.length }) : t('edit.fileTree.pasteFailed'))
    }

    if (successCount > 0) {
      if (isCut) {
        clearClipboard()
      }
      toast.success(clipboard.length === 1 ? t('edit.fileTree.pasteSuccess') : t('edit.fileTree.pasteMultipleSuccess', { count: successCount }))
      await gameManager.updateCurrentGameLastModified()
    }
  } catch (error) {
    logger.error(error instanceof Error ? error.message : String(error))
    toast.error('粘贴失败')
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
    <ContextMenuContent class="w-52">
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
