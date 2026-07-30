import { defineStore } from 'pinia'
import { computed, shallowRef } from 'vue'

import type {
  ImportResourceKind,
  ManagedImportProgress,
} from '~/features/resource-import/directory-materializer'

export const useManagedImportStore = defineStore('managed-import', () => {
  const activeKind = shallowRef<ImportResourceKind>()
  const progress = shallowRef<ManagedImportProgress>()

  const isBusy = computed(() => activeKind.value !== undefined)
  const activeSessionId = computed(() => progress.value?.sessionId)

  function begin(kind: ImportResourceKind): boolean {
    if (activeKind.value !== undefined) {
      return false
    }

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
    activeKind.value = undefined
    progress.value = undefined
  }

  return {
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
