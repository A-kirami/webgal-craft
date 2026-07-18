import { commandType } from 'webgal-parser/src/interface/sceneInterface'

import { getCommandConfig } from './index'
import { isFlagChoiceField, resolveI18n, UNSPECIFIED } from './schema'

import type { I18nLike, I18nT } from './schema'

export interface ArgumentCompletionInfo {
  key: string
  detail: string
  simplified: boolean
}

interface CompletionOnlyArgument {
  key: string
  label: I18nLike
  simplified?: boolean
}

const WHEN: CompletionOnlyArgument = {
  key: 'when',
  label: t => t('edit.completion.arguments.when'),
}

const completionOnlyArguments = new Map<commandType, CompletionOnlyArgument[]>([
  [commandType.say, [
    { key: 'left', label: t => t('edit.completion.arguments.left'), simplified: true },
    { key: 'right', label: t => t('edit.completion.arguments.right'), simplified: true },
    { key: 'center', label: t => t('edit.completion.arguments.center'), simplified: true },
  ]],
])

export function buildArgumentCompletionInfo(command: commandType, t: I18nT): ArgumentCompletionInfo[] {
  const entry = getCommandConfig(command)
  const result: ArgumentCompletionInfo[] = [{
    key: WHEN.key,
    detail: resolveI18n(WHEN.label, t),
    simplified: false,
  }]

  for (const item of completionOnlyArguments.get(command) ?? []) {
    result.push({
      key: item.key,
      detail: resolveI18n(item.label, t),
      simplified: item.simplified ?? false,
    })
  }

  for (const { storage, field } of entry.fields) {
    if (typeof storage !== 'object') {
      continue
    }

    if (field.type === 'choice' && isFlagChoiceField(field)) {
      for (const option of field.options) {
        if (option.value !== UNSPECIFIED) {
          result.push({
            key: option.value,
            detail: resolveI18n(option.label, t),
            simplified: true,
          })
        }
      }
      continue
    }

    result.push({
      key: storage.arg,
      detail: resolveI18n(field.label, t),
      simplified: field.type === 'switch',
    })
  }

  return result.filter((item, index, items) => items.findIndex(candidate => candidate.key === item.key) === index)
}
