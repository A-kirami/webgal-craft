import { getActivePinia } from 'pinia'

import { dispatchShortcut } from './dispatcher'
import { useShortcutContextRegistry } from './shortcut-context-registry'

import type { ShortcutDefinition, ShortcutPlatform } from './types'
import type { InjectionKey } from 'vue'

export interface ShortcutDispatcherRegistry {
  registerBinding: () => symbol
  unregisterBinding: (token: symbol) => void
  updateBinding: (token: symbol, binding: ShortcutDefinition<unknown>) => void
}

export const shortcutDispatcherRegistryKey: InjectionKey<ShortcutDispatcherRegistry> = Symbol('shortcut-dispatcher-registry')

interface UseShortcutDispatcherOptions<TExecuteContext> {
  bindings?: MaybeRefOrGetter<readonly ShortcutDefinition<TExecuteContext>[]>
  executeContext: TExecuteContext
  platform?: ShortcutPlatform
}

function resolveShortcutPlatform(): ShortcutPlatform {
  if (typeof navigator === 'undefined') {
    return 'windows'
  }

  const platform = navigator.userAgent.toLowerCase()
  if (platform.includes('mac') || platform.includes('iphone') || platform.includes('ipad')) {
    return 'mac'
  }

  if (platform.includes('win')) {
    return 'windows'
  }

  return 'linux'
}

export function useShortcutDispatcher<TExecuteContext>(
  options: UseShortcutDispatcherOptions<TExecuteContext>,
) {
  if (!getActivePinia()) {
    return {
      handleKeydown: () => undefined,
    }
  }

  const shortcutContextRegistry = useShortcutContextRegistry()
  const dynamicBindings = new Map<symbol, ShortcutDefinition<unknown>>()
  const platform = options.platform ?? resolveShortcutPlatform()

  function registerBinding(): symbol {
    return Symbol('shortcut-binding')
  }

  function updateBinding(token: symbol, binding: ShortcutDefinition<unknown>) {
    dynamicBindings.set(token, binding)
  }

  function unregisterBinding(token: symbol) {
    dynamicBindings.delete(token)
  }

  provide(shortcutDispatcherRegistryKey, {
    registerBinding,
    unregisterBinding,
    updateBinding,
  })

  function getBindings(): ShortcutDefinition<TExecuteContext>[] {
    const staticBindings = (toValue(options.bindings) ?? []) as readonly ShortcutDefinition<TExecuteContext>[]
    return [
      ...staticBindings,
      ...[...dynamicBindings.values()] as ShortcutDefinition<TExecuteContext>[],
    ]
  }

  function handleKeydown(event: KeyboardEvent) {
    dispatchShortcut({
      bindings: getBindings(),
      context: shortcutContextRegistry.resolveContext(event.target),
      event,
      executeContext: options.executeContext,
      platform,
    })
  }

  useEventListener(globalThis, 'keydown', handleKeydown)

  return {
    handleKeydown,
  }
}
