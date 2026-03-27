import { handleError } from '~/utils/error-handler'

import { normalizeShortcutBindingKeys, normalizeShortcutEventKeys } from './keys'

import type { ShortcutKeyboardEventLike } from './keys'
import type { ShortcutContext, ShortcutDefinition, ShortcutPlatform, ShortcutWhen } from './types'

interface ShortcutEventTargetLike {
  closest?: (selector: string) => unknown
  isContentEditable?: boolean
  tagName?: string
}

export interface ShortcutEventLike extends ShortcutKeyboardEventLike {
  defaultPrevented?: boolean
  preventDefault: () => void
  target?: EventTarget | null
}

interface DispatchShortcutOptions<TExecuteContext> {
  bindings: readonly ShortcutDefinition<TExecuteContext>[]
  context: ShortcutContext
  event: ShortcutEventLike
  executeContext: TExecuteContext
  platform: ShortcutPlatform
}

function isEditableTarget(target: EventTarget | null | undefined): boolean {
  if (!target || typeof target !== 'object') {
    return false
  }

  const element = target as ShortcutEventTargetLike
  if (element.isContentEditable) {
    return true
  }

  return ['INPUT', 'TEXTAREA'].includes(String(element.tagName ?? '').toUpperCase())
}

function isMonacoTarget(target: EventTarget | null | undefined): boolean {
  if (!target || typeof target !== 'object') {
    return false
  }

  const element = target as ShortcutEventTargetLike
  return !!element.closest?.('.monaco-editor')
}

function resolveWhenSpecificity(when?: ShortcutWhen): number {
  return Object.keys(when ?? {}).length
}

export function matchesShortcutWhen(
  when: ShortcutWhen | undefined,
  context: ShortcutContext,
): boolean {
  if (!when) {
    return true
  }

  return Object.entries(when).every(([key, expected]) => {
    const actual = context[key]
    if (typeof expected === 'string' && expected.startsWith('!')) {
      return actual !== expected.slice(1)
    }

    return actual === expected
  })
}

export function dispatchShortcut<TExecuteContext>(
  options: DispatchShortcutOptions<TExecuteContext>,
): boolean {
  const triggeredKey = normalizeShortcutEventKeys(options.event)
  if (!triggeredKey) {
    return false
  }

  const candidates = options.bindings
    .map((binding, index) => ({
      binding,
      index,
      keys: normalizeShortcutBindingKeys(binding.keys, options.platform),
      specificity: resolveWhenSpecificity(binding.when),
    }))
    .filter(candidate => candidate.keys.includes(triggeredKey))
    .filter(candidate => matchesShortcutWhen(candidate.binding.when, options.context))
    .filter((candidate) => {
      if (options.context.isModalOpen === true && !candidate.binding.allowInModal) {
        return false
      }

      if (isMonacoTarget(options.event.target)) {
        if (!candidate.binding.overrideMonaco) {
          return false
        }
      } else if (
        isEditableTarget(options.event.target)
        && !candidate.binding.allowInInput
      ) {
        return false
      }

      return true
    })
    .toSorted((left, right) => {
      if (left.specificity !== right.specificity) {
        return right.specificity - left.specificity
      }

      return right.index - left.index
    })

  const matched = candidates[0]
  if (!matched) {
    return false
  }

  options.event.preventDefault()

  try {
    const result = matched.binding.execute(options.executeContext)
    if (result && typeof result === 'object' && 'then' in result) {
      void Promise.resolve(result).catch((error) => {
        handleError(error, { silent: true })
      })
    }
  } catch (error) {
    handleError(error, { silent: true })
  }

  return true
}
