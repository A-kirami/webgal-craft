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

/**
 * 浮层内容（popover 等）会被 teleport 到 body，焦点落在其中时 `contains` 判定失效，
 * 宿主表面的焦点上下文随之失效——表面上依赖该上下文的快捷键（撤销、复制…）会整片停摆。
 * 浮层与它的触发元素之间由 aria-controls 关联，而触发元素仍在宿主表面内，据此把焦点算回宿主表面。
 */
function isFocusInFloatingLayerOpenedFrom(target: HTMLElement, focusNode: Node): boolean {
  // 只有元素节点有 closest；其他焦点节点取最近的元素祖先
  const element = 'closest' in focusNode ? focusNode as Element : focusNode.parentElement
  const layer = element?.closest('[data-dismissable-layer]')
  if (!layer) {
    return false
  }

  for (let node: Element | null = layer; node; node = node.parentElement) {
    if (node.id && target.querySelector(`[aria-controls~="${CSS.escape(node.id)}"]`)) {
      return true
    }
  }

  return false
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
    modalOpen: boolean,
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

    if (entry.target.contains(focusNode)) {
      return true
    }

    // 模态浮层自带焦点上下文（isModalOpen 也由它决定），不做回算
    return !modalOpen && isFocusInFloatingLayerOpenedFrom(entry.target, focusNode)
  }

  function resolveContext(target?: EventTarget | null): ShortcutContext {
    const focusNode = resolveFocusNode(target)
    const orderedEntries = [...entries.values()].toSorted((left, right) => left.order - right.order)
    const modalOpen = orderedEntries.some(entry => entry.active && entry.values.isModalOpen === true)
    const nextContext: Record<string, ShortcutContextValue> = {}

    for (const entry of orderedEntries) {
      if (!isEntryActive(entry, focusNode, modalOpen)) {
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
