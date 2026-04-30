import { useModalStore } from '~/stores/modal'

import type { EngineRef } from '~/types/project-config'

export function requestEngineSelection(hint?: EngineRef): Promise<string | undefined> {
  const modalStore = useModalStore()

  return new Promise((resolve) => {
    modalStore.open('EngineSelectionModal', {
      hint,
      onCancel: () => resolve(undefined),
      onConfirm: (engineId: string) => resolve(engineId),
    }, crypto.randomUUID())
  })
}
