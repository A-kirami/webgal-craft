import { defineStore } from 'pinia'

import type {
  ImportResourceKind,
  ManagedImportActivity,
  ManagedImportProgress,
} from '~/types/managed-import'

export const useManagedImportStore = defineStore('managed-import', () => {
  const activeActivity = shallowRef<ManagedImportActivity>()
  const activeKind = shallowRef<ImportResourceKind>()
  const progress = shallowRef<ManagedImportProgress>()

  const isBusy = computed(() => activeKind.value !== undefined)
  const activeSessionId = computed(() => progress.value?.sessionId)

  function begin(kind: ImportResourceKind, activity?: ManagedImportActivity): boolean {
    if (activeKind.value !== undefined) {
      return false
    }

    activeActivity.value = activity
    activeKind.value = kind
    progress.value = undefined
    return true
  }

  function updateProgress(nextProgress: ManagedImportProgress): void {
    if (nextProgress.resourceKind === activeKind.value) {
      progress.value = nextProgress
    }
  }

  function updatePhase(phase: ManagedImportProgress['phase']): void {
    if (progress.value) {
      progress.value = { ...progress.value, phase }
    }
  }

  function finish(): void {
    activeActivity.value = undefined
    activeKind.value = undefined
    progress.value = undefined
  }

  return {
    activeActivity,
    activeKind,
    activeSessionId,
    isBusy,
    progress,
    begin,
    finish,
    updatePhase,
    updateProgress,
  }
})
