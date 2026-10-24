import { useModalStore } from '~/stores/modal'

import type { GameDependencyResolutionContext, GameDependencyResolutionResult } from '~/types/game-dependency-resolution'

interface RequestGameDependencyResolutionOptions {
  onCancel?: () => void
}

export function requestGameDependencyResolution(
  context: GameDependencyResolutionContext,
  options: RequestGameDependencyResolutionOptions = {},
): Promise<GameDependencyResolutionResult | undefined> {
  const modalStore = useModalStore()

  return new Promise((resolve) => {
    modalStore.open('GameDependencyResolutionModal', {
      context,
      onCancel: () => {
        options.onCancel?.()
        resolve(undefined)
      },
      onConfirm: (result: GameDependencyResolutionResult) => resolve(result),
    }, crypto.randomUUID())
  })
}
