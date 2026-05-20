import { useModalStore } from '~/stores/modal'

import type { EngineSelectionContext } from '~/types/engine-selection'

export function requestEngineSelection(context: EngineSelectionContext = {}): Promise<string | undefined> {
  const modalStore = useModalStore()

  return new Promise((resolve) => {
    modalStore.open('EngineSelectionModal', {
      ...context,
      onCancel: () => resolve(undefined),
      onConfirm: (engineId: string) => resolve(engineId),
    }, crypto.randomUUID())
  })
}
