import { shortcutDispatcherRegistryKey } from './useShortcutDispatcher'

import type { ShortcutDefinition } from './types'

export function useShortcut<TExecuteContext>(
  binding: MaybeRefOrGetter<ShortcutDefinition<TExecuteContext>>,
) {
  const registry = inject(shortcutDispatcherRegistryKey, undefined)
  if (!registry) {
    return
  }

  const token = registry.registerBinding()

  watchEffect(() => {
    registry.updateBinding(token, toValue(binding) as ShortcutDefinition<unknown>)
  })

  tryOnUnmounted(() => {
    registry.unregisterBinding(token)
  })
}
