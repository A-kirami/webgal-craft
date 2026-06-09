import { useModalStore } from '~/stores/modal'

import type { ImportDependencyResolutionContext, ImportDependencyResolutionResult } from '~/types/import-dependency-resolution'

interface RequestImportDependencyResolutionOptions {
  onCancel?: () => void
}

export function requestImportDependencyResolution(
  context: ImportDependencyResolutionContext,
  options: RequestImportDependencyResolutionOptions = {},
): Promise<ImportDependencyResolutionResult | undefined> {
  const modalStore = useModalStore()

  return new Promise((resolve) => {
    modalStore.open('GameDependencyResolutionModal', {
      context,
      onCancel: () => {
        options.onCancel?.()
        resolve(undefined)
      },
      onConfirm: (result: ImportDependencyResolutionResult) => resolve(result),
    }, crypto.randomUUID())
  })
}
