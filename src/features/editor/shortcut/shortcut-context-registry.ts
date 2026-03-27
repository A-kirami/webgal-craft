import { defineStore } from 'pinia'

import type { ShortcutContext, ShortcutContextValue } from './types'

interface ShortcutContextEntry {
  active: boolean
  order: number
  target?: HTMLElement
  trackFocus: boolean
  values: ShortcutContext
}

interface ShortcutContextEntryOptions {
  active?: boolean
  target?: HTMLElement
  trackFocus?: boolean
}

function isNodeLike(value: unknown): value is Node {
  return value !== null
    && typeof value === 'object'
    && 'nodeType' in value
}

function resolveFocusNode(target?: EventTarget | null): Node | undefined {
  if (typeof document !== 'undefined' && isNodeLike(document.activeElement)) {
    return document.activeElement
  }

  return isNodeLike(target) ? target : undefined
}

export const useShortcutContextRegistry = defineStore('shortcut-context-registry', () => {
  const entries = new Map<symbol, ShortcutContextEntry>()
  let nextOrder = 0

  function mergeContextValue(
    currentValue: ShortcutContextValue,
    key: string,
    nextValue: ShortcutContextValue,
  ): ShortcutContextValue {
    if (key !== 'isModalOpen') {
      return nextValue
    }

    if (currentValue === true || nextValue === true) {
      return true
    }

    if (currentValue === undefined) {
      return nextValue
    }

    return currentValue
  }

  function isEntryActive(
    entry: ShortcutContextEntry,
    focusNode: Node | undefined,
  ): boolean {
    if (!entry.active) {
      return false
    }

    if (!entry.trackFocus) {
      return true
    }

    if (!entry.target || !isNodeLike(focusNode)) {
      return false
    }

    return entry.target.contains(focusNode)
  }

  function resolveContext(target?: EventTarget | null): ShortcutContext {
    const focusNode = resolveFocusNode(target)
    const nextContext: Record<string, ShortcutContextValue> = {}

    for (const entry of [...entries.values()].toSorted((left, right) => left.order - right.order)) {
      if (!isEntryActive(entry, focusNode)) {
        continue
      }

      for (const [key, value] of Object.entries(entry.values)) {
        nextContext[key] = mergeContextValue(nextContext[key], key, value)
      }
    }

    return nextContext
  }

  function registerEntry(): symbol {
    const token = Symbol('shortcut-context-entry')
    entries.set(token, {
      active: false,
      order: nextOrder++,
      trackFocus: false,
      values: {},
    })
    return token
  }

  function updateEntry(
    token: symbol,
    values: ShortcutContext,
    options: ShortcutContextEntryOptions = {},
  ): void {
    const entry = entries.get(token)
    if (!entry) {
      return
    }

    entry.values = { ...values }
    entry.active = options.active ?? true
    entry.target = options.target
    entry.trackFocus = options.trackFocus === true
  }

  function unregisterEntry(token: symbol): void {
    entries.delete(token)
  }

  return {
    registerEntry,
    resolveContext,
    unregisterEntry,
    updateEntry,
  }
})
