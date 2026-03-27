import { getActivePinia } from 'pinia'

import { useShortcutContextRegistry } from './shortcut-context-registry'

import type { ShortcutContext, ShortcutContextValue } from './types'
import type { ComponentPublicInstance } from 'vue'

interface ReadonlyRefLike<T> {
  readonly value: T
}

interface UseShortcutContextOptions {
  active?: MaybeRefOrGetter<boolean>
  target?: MaybeRefOrGetter<FocusableTarget | null | undefined>
  trackFocus?: boolean
}

type FocusableTarget = ComponentPublicInstance | HTMLElement | ReadonlyRefLike<ComponentPublicInstance | HTMLElement | null | undefined>

type ShortcutContextSource = Record<string, MaybeRefOrGetter<ShortcutContextValue>>

function resolveElement(source: FocusableTarget | null | undefined): HTMLElement | undefined {
  if (!source) {
    return undefined
  }

  if (source instanceof HTMLElement) {
    return source
  }

  if (typeof source === 'object' && '$el' in source) {
    const element = source.$el
    return element instanceof HTMLElement ? element : undefined
  }

  if (typeof source === 'object' && 'value' in source) {
    return resolveElement(source.value)
  }

  return undefined
}

function resolveDefaultTarget(instance: ReturnType<typeof getCurrentInstance>): HTMLElement | undefined {
  const proxyElement = instance?.proxy?.$el
  if (proxyElement instanceof HTMLElement) {
    return proxyElement
  }

  const subTreeElement = instance?.subTree?.el
  return subTreeElement instanceof HTMLElement ? subTreeElement : undefined
}

export function useShortcutContext(
  values: ShortcutContextSource,
  options: UseShortcutContextOptions = {},
) {
  if (!getActivePinia()) {
    return
  }

  const instance = getCurrentInstance()
  const shortcutContextRegistry = useShortcutContextRegistry()
  const defaultTarget = shallowRef<HTMLElement>()
  const token = shortcutContextRegistry.registerEntry()

  onMounted(() => {
    if (!options.target) {
      defaultTarget.value = resolveDefaultTarget(instance)
    }
  })

  const targetElement = computed(() => resolveElement(toValue(options.target) ?? defaultTarget.value))

  const isEntryActive = computed(() => {
    return options.active === undefined ? true : Boolean(toValue(options.active))
  })

  watchEffect(() => {
    const resolvedValues: ShortcutContext = {}

    for (const [key, value] of Object.entries(values)) {
      resolvedValues[key] = toValue(value)
    }

    shortcutContextRegistry.updateEntry(token, resolvedValues, {
      active: isEntryActive.value,
      target: targetElement.value,
      trackFocus: options.trackFocus,
    })
  })

  tryOnUnmounted(() => {
    shortcutContextRegistry.unregisterEntry(token)
  })
}
