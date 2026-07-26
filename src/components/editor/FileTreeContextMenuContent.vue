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
import { openPath, revealItemInDir } from '@tauri-apps/plugin-opener'

import { usePathOperationFeedback } from '~/composables/usePathOperationFeedback'
import { AbsPath, RelPath } from '~/domain/path'
import { useFileClipboard } from '~/features/editor/file-tree/useFileClipboard'
import { backupManager } from '~/services/backup-manager'
import { gameFs } from '~/services/game-fs'
import { pathOperation } from '~/services/path-operation'
import { createPathOperationRewriteConfirm } from '~/services/path-operation-confirm'
import { useModalStore } from '~/stores/modal'
import { useWorkspaceStore } from '~/stores/workspace'
import { settleBatch } from '~/utils/batch'
import { handleError } from '~/utils/error-handler'

import type { PathOperationResult } from '~/services/path-operation'
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
  revealInExplorerDisabled?: boolean
}

const {
  item,
  onRename,
  onCreateFile,
  onCreateFolder,
  clipboardKey = 'default',
  isRoot = false,
  revealInExplorerDisabled = false,
} = defineProps<Props>()

const { clipboard, operationType, canPaste, setClipboard, clearClipboard } = $(useFileClipboard(clipboardKey))
const modalStore = useModalStore()
const workspaceStore = useWorkspaceStore()
const { t } = useI18n()
const confirmPathOperationRewrite = createPathOperationRewriteConfirm(t)
const pathOperationFeedback = usePathOperationFeedback()

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

    const { succeeded, failed } = await settleBatch<PathOperationResult | undefined>(
      clipboard.map(clipboardItem => () =>
        isCut
          ? pathOperation.perform({
              kind: 'move',
              sourcePath: AbsPath.from(clipboardItem.path),
              target: { type: 'directory', directory: AbsPath.from(targetPath) },
            }, confirmPathOperationRewrite).then((result) => {
              pathOperationFeedback.reportWarnings(result.warnings)
              return result
            }).catch((error) => {
              throw pathOperationFeedback.createError(error)
            })
          : gameFs.copyFile(AbsPath.from(clipboardItem.path), AbsPath.from(targetPath)).then(() => undefined),
      ),
    )

    const completedCutResults = isCut
      ? succeeded.filter((result): result is PathOperationResult => !!result && !result.cancelled)
      : []
    const completedCount = isCut ? completedCutResults.length : succeeded.length

    if (failed.length > 0) {
      const errorMsg = failed.map(f => f.error.message).join('; ')
      logger.error(`粘贴失败: ${errorMsg}`)
      toast.error(
        completedCount > 0
          ? t('edit.fileTree.pastePartialFailed', { failed: failed.length, total: clipboard.length })
          : t('edit.fileTree.pasteFailed'),
      )
    }

    if (completedCount > 0 && isCut && completedCount === clipboard.length && failed.length === 0) {
      clearClipboard()
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
    if (isRoot) {
      await openPath(item.path)
      return
    }

    await revealItemInDir(item.path)
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
    items.push({
      icon: FolderOpen,
      label: t('edit.fileTree.revealInExplorer'),
      onClick: handleRevealInExplorer,
      disabled: revealInExplorerDisabled,
    })
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
