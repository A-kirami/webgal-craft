import { getActivePinia } from 'pinia'

import { detectSystemPlatform } from '~/utils/platform'

import { dispatchShortcut } from './dispatcher'
import { useShortcutContextRegistry } from './shortcut-context-registry'

import type { ShortcutDefinition, ShortcutPlatform } from './types'
import type { InjectionKey } from 'vue'

export interface ShortcutDispatcherRegistry {
  registerBinding: () => symbol
  registerSource: () => symbol
  unregisterBinding: (token: symbol) => void
  unregisterSource: (token: symbol) => void
  updateBinding: (token: symbol, binding: ShortcutDefinition<unknown>) => void
  updateSource: (token: symbol, bindings: readonly ShortcutDefinition<unknown>[]) => void
}

export const shortcutDispatcherRegistryKey: InjectionKey<ShortcutDispatcherRegistry> = Symbol('shortcut-dispatcher-registry')

interface UseShortcutDispatcherOptions<TExecuteContext> {
  bindings?: MaybeRefOrGetter<readonly ShortcutDefinition<TExecuteContext>[]>
  executeContext: TExecuteContext
  platform?: ShortcutPlatform
}

/**
 * 注册快捷键派发器。
 *
 * 最外层调用（应用根：同时覆盖路由视图与根窗模态）是宿主，持有唯一的 window 监听器与上下文注册表；
 * 之后各层的调用只把自己那份静态绑定与执行上下文贡献给宿主。不能让每个宿主各挂一个监听器：
 * 同一次按键会被多个派发器各派发一次，而「后注册优先」只有在同一份绑定表里才能正确裁决跨宿主冲突。
 */
export function useShortcutDispatcher<TExecuteContext>(
  options: UseShortcutDispatcherOptions<TExecuteContext>,
): void {
  if (!getActivePinia()) {
    return
  }

  const inheritedRegistry = inject(shortcutDispatcherRegistryKey, undefined)
  if (inheritedRegistry) {
    registerDispatcherSource(inheritedRegistry, options)
    return
  }

  const shortcutContextRegistry = useShortcutContextRegistry()
  const dynamicBindings = new Map<symbol, ShortcutDefinition<unknown>>()
  const sourceBindings = new Map<symbol, readonly ShortcutDefinition<unknown>[]>()
  const platform = options.platform ?? detectSystemPlatform()

  function registerBinding(): symbol {
    return Symbol('shortcut-binding')
  }

  function updateBinding(token: symbol, binding: ShortcutDefinition<unknown>) {
    dynamicBindings.set(token, binding)
  }

  function unregisterBinding(token: symbol) {
    dynamicBindings.delete(token)
  }

  function registerSource(): symbol {
    return Symbol('shortcut-source')
  }

  function updateSource(token: symbol, bindings: readonly ShortcutDefinition<unknown>[]) {
    sourceBindings.set(token, bindings)
  }

  function unregisterSource(token: symbol) {
    sourceBindings.delete(token)
  }

  function getBindings(): readonly ShortcutDefinition<TExecuteContext>[] {
    const staticBindings = (toValue(options.bindings) ?? []) as readonly ShortcutDefinition<TExecuteContext>[]
    return [
      ...staticBindings,
      ...[...sourceBindings.values()].flat() as ShortcutDefinition<TExecuteContext>[],
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

  provide(shortcutDispatcherRegistryKey, {
    registerBinding,
    registerSource,
    unregisterBinding,
    unregisterSource,
    updateBinding,
    updateSource,
  })
}

/** 非宿主层：把自己的静态绑定与执行上下文交给宿主派发，绑定表里的位置仍按注册顺序参与「后注册优先」裁决。 */
function registerDispatcherSource<TExecuteContext>(
  registry: ShortcutDispatcherRegistry,
  options: UseShortcutDispatcherOptions<TExecuteContext>,
): void {
  const token = registry.registerSource()

  watchEffect(() => {
    registry.updateSource(token, (toValue(options.bindings) ?? []).map(binding => ({
      ...binding,
      execute: () => binding.execute(options.executeContext),
    })))
  })

  tryOnUnmounted(() => {
    registry.unregisterSource(token)
  })
}
