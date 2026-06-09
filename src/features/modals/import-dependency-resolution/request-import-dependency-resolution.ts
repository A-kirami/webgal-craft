import { useModalStore } from '~/stores/modal'

import type { ImportDependencyResolutionContext, ImportDependencyResolutionResult } from '~/types/import-dependency-resolution'

export function requestImportDependencyResolution(
  context: ImportDependencyResolutionContext,
): Promise<ImportDependencyResolutionResult | undefined> {
  const modalStore = useModalStore()

  return new Promise((resolve) => {
    modalStore.open('GameDependencyResolutionModal', {
      context,
      onCancel: () => resolve(undefined),
      onConfirm: (result: ImportDependencyResolutionResult) => resolve(result),
    }, crypto.randomUUID())
  })
}
