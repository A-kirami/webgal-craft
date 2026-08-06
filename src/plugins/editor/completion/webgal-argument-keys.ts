import * as monaco from 'monaco-editor'
import { commandType } from 'webgal-parser/src/interface/sceneInterface'

import { isExtendedFigurePosition } from '~/domain/script/types'
import { buildArgumentCompletionInfo } from '~/features/editor/command-registry/completion'
import { getI18nLocale, i18n } from '~/plugins/i18n'

import type { EngineRuntimeCapabilities } from '~/domain/engine/runtime-capabilities'

const { t } = i18n.global

let cachedLocale: string | undefined
let cachedArgKeyMap = new Map<commandType, ReturnType<typeof buildArgumentCompletionInfo>>()

function readArgumentCompletions(command: commandType) {
  const currentLocale = getI18nLocale()
  if (cachedLocale !== currentLocale) {
    cachedLocale = currentLocale
    cachedArgKeyMap = new Map()
  }

  const cached = cachedArgKeyMap.get(command)
  if (cached) {
    return cached
  }

  const completions = buildArgumentCompletionInfo(command, t)
  cachedArgKeyMap.set(command, completions)
  return completions
}

export function getArgKeyCompletions(
  range: monaco.IRange,
  command: commandType,
  hasLeadingDash: boolean,
  runtimeCapabilities?: EngineRuntimeCapabilities,
): monaco.languages.CompletionItem[] {
  return readArgumentCompletions(command)
    .filter(item => runtimeCapabilities?.figurePositions !== false || !isExtendedFigurePosition(item.key))
    .map(item => ({
      label: item.key,
      insertText: `${hasLeadingDash ? '' : '-'}${item.key}${item.simplified ? '' : '='}`,
      detail: item.detail,
      kind: monaco.languages.CompletionItemKind.Function,
      range,
      ...(item.hasValueCompletions && {
        command: {
          id: 'editor.action.triggerSuggest',
          title: '',
        },
      }),
    }))
}
