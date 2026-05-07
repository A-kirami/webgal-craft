<script setup lang="ts">
import {
  ClipboardPaste,
  Copy,
  FilePlus,
  FolderOpen,
  FolderPlus,
  History,
  Pencil,
  Scissors,
  Trash2,
} from '@lucide/vue'
import { openPath } from '@tauri-apps/plugin-opener'

import { AbsPath, RelPath } from '~/domain/path'
import { useFileClipboard } from '~/features/editor/file-tree/useFileClipboard'
import { backupManager } from '~/services/backup-manager'
import { gameFs } from '~/services/game-fs'
import { useModalStore } from '~/stores/modal'
import { useWorkspaceStore } from '~/stores/workspace'
import { settleBatch } from '~/utils/batch'
import { handleError } from '~/utils/error-handler'

import type { MenuItem } from '~/types/menu-item'

interface FileItem {
  path: string
  name: string
  isDir?: boolean
  source?: string
}

interface Props {
  item: FileItem
  onRename?: (item: FileItem) => void
  onCreateFile?: (item: FileItem) => void
  onCreateFolder?: (item: FileItem) => void
  clipboardKey?: string
  isRoot?: boolean
}

const {
  item,
  onRename,
  onCreateFile,
  onCreateFolder,
  clipboardKey = 'default',
  isRoot = false,
} = defineProps<Props>()

const { clipboard, operationType, canPaste, setClipboard, clearClipboard } = $(useFileClipboard(clipboardKey))
const modalStore = useModalStore()
const workspaceStore = useWorkspaceStore()
const { t } = useI18n()

const sceneLogicalPath = $computed(() => {
  if (item.isDir || isRoot) {
    return
  }
  const projectPath = workspaceStore.CWD
  if (!projectPath) {
    return
  }
  const relative = backupManager.toProjectRelative(AbsPath.from(projectPath), AbsPath.from(item.path))
  return relative && backupManager.isScenePath(relative) ? relative : undefined
})

function handleCreateFile(): void {
  onCreateFile?.(item)
}

function handleCreateFolder(): void {
  onCreateFolder?.(item)
}

function handleCopy(): void {
  setClipboard({
    path: item.path,
    isCut: false,
    isDir: item.isDir ?? false,
  })
}

function handleCut(): void {
  setClipboard({
    path: item.path,
    isCut: true,
    isDir: item.isDir ?? false,
  })
}

async function handlePaste(): Promise<void> {
  if (!canPaste) {
    return
  }

  try {
    const targetPath = item.isDir ? item.path : AbsPath.parent(AbsPath.from(item.path))
    const isCut = operationType === 'cut'

    const { succeeded, failed } = await settleBatch(
      clipboard.map(clipboardItem => () =>
        isCut
          ? gameFs.moveFile(AbsPath.from(clipboardItem.path), AbsPath.from(targetPath))
          : gameFs.copyFile(AbsPath.from(clipboardItem.path), AbsPath.from(targetPath)),
      ),
    )

    if (failed.length > 0) {
      const errorMsg = failed.map(f => f.error.message).join('; ')
      logger.error(`粘贴失败: ${errorMsg}`)
      toast.error(
        succeeded.length > 0
          ? t('edit.fileTree.pastePartialFailed', { failed: failed.length, total: clipboard.length })
          : t('edit.fileTree.pasteFailed'),
      )
    }

    if (succeeded.length > 0) {
      if (isCut) {
        clearClipboard()
      }
      toast.success(
        clipboard.length === 1
          ? t('edit.fileTree.pasteSuccess')
          : t('edit.fileTree.pasteMultipleSuccess', { count: succeeded.length }),
      )
    }
  } catch (error) {
    handleError(error)
  }
}

function handleRename(): void {
  onRename?.(item)
}

function handleDelete(): void {
  modalStore.open('DeleteFileModal', {
    file: item,
  })
}

function handleViewHistory(): void {
  const projectPath = workspaceStore.CWD
  const logicalPath = sceneLogicalPath
  if (!projectPath || !logicalPath) {
    return
  }
  modalStore.open('BackupTimelineDialog', {
    projectPath: AbsPath.from(projectPath),
    logicalPath: RelPath.from(logicalPath),
  })
}

async function handleRevealInExplorer(): Promise<void> {
  try {
    const pathToOpen = item.isDir ? item.path : AbsPath.parent(AbsPath.from(item.path))
    await openPath(pathToOpen)
  } catch (error) {
    logger.error(`打开文件管理器失败: ${error}`)
  }
}

function pushSeparator(items: (MenuItem | 'separator')[]): void {
  if (items.length > 0 && items.at(-1) !== 'separator') {
    items.push('separator')
  }
}

const menuItems = $computed(() => {
  const items: (MenuItem | 'separator')[] = []
  const canCreateTarget = isRoot || item.isDir

  if (canCreateTarget && onCreateFile) {
    items.push({ icon: FilePlus, label: t('edit.fileTree.newFile'), onClick: handleCreateFile })
  }

  if (canCreateTarget && onCreateFolder) {
    items.push({ icon: FolderPlus, label: t('edit.fileTree.newFolder'), onClick: handleCreateFolder })
  }

  if (items.length > 0) {
    pushSeparator(items)
  }

  if (!isRoot) {
    items.push(
      { icon: Copy, label: t('edit.fileTree.copy'), onClick: handleCopy },
      { icon: Scissors, label: t('edit.fileTree.cut'), onClick: handleCut },
    )
  }

  if (canCreateTarget) {
    items.push({
      icon: ClipboardPaste,
      label: t('edit.fileTree.paste'),
      onClick: handlePaste,
      disabled: !canPaste,
    })
  }

  if (!isRoot) {
    pushSeparator(items)

    if (onRename) {
      items.push({ icon: Pencil, label: t('edit.fileTree.rename'), onClick: handleRename })
    }

    if (sceneLogicalPath) {
      items.push({ icon: History, label: t('edit.fileTree.viewHistory'), onClick: handleViewHistory })
    }

    items.push({
      icon: Trash2,
      label: t('common.delete'),
      onClick: handleDelete,
      class: 'text-destructive focus:text-destructive-foreground focus:bg-destructive',
    })
  }

  if (item.source !== 'engineLower' && item.source !== 'templateLower') {
    pushSeparator(items)
    items.push({ icon: FolderOpen, label: t('edit.fileTree.revealInExplorer'), onClick: handleRevealInExplorer })
  }

  return items
})
</script>

<template>
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
</template>
