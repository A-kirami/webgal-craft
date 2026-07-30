import { storeToRefs } from 'pinia'
import { computed } from 'vue'

import { useManagedImportStore } from '~/stores/managed-import'

import { androidDirectoryMaterializer } from './android-directory-materializer'

export function useManagedImportStatus() {
  const store = useManagedImportStore()
  const { activeSessionId, isBusy, progress } = storeToRefs(store)
  const canCancel = computed(() => progress.value?.phase === 'copying' && !!activeSessionId.value)

  async function cancel(): Promise<void> {
    if (canCancel.value && activeSessionId.value) {
      await androidDirectoryMaterializer.cancel(activeSessionId.value)
    }
  }

  return {
    canCancel,
    isBusy,
    progress,
    cancel,
  }
}
