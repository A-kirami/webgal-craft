import { defineStore } from 'pinia'

import { AbsPath, RelPath } from '~/domain/path'
import { backupManager } from '~/services/backup-manager'
import { useRuntimeTaskStore } from '~/stores/runtime-task'

import type { BackupEntry } from '~/commands/backup'

interface TimelineScope {
  projectPath: AbsPath
  logicalPath: RelPath
}

export const useBackupStore = defineStore('backup', () => {
  let scope = $ref<TimelineScope | undefined>(undefined)
  let timeline = $ref<BackupEntry[]>([])
  let loading = $ref(false)
  let restoring = $ref(false)

  async function loadTimeline(projectPath: AbsPath, logicalPath: RelPath) {
    scope = { projectPath, logicalPath }
    loading = true
    try {
      timeline = await backupManager.loadTimeline(projectPath, logicalPath)
    } finally {
      loading = false
    }
  }

  function clearTimeline() {
    scope = undefined
    timeline = []
  }

  async function restoreEntry(entry: BackupEntry) {
    if (!scope) {
      return
    }
    const finishUpdateBlocker = useRuntimeTaskStore()
      .beginBlockingTask(`backup-restore:${crypto.randomUUID()}`)
    restoring = true
    try {
      await backupManager.restoreBackup(scope.projectPath, scope.logicalPath, RelPath.from(entry.backupPath))
      timeline = await backupManager.loadTimeline(scope.projectPath, scope.logicalPath)
    } finally {
      restoring = false
      finishUpdateBlocker()
    }
  }

  return $$({
    scope,
    timeline,
    loading,
    restoring,
    loadTimeline,
    clearTimeline,
    restoreEntry,
  })
})
