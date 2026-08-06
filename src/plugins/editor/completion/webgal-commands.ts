import * as monaco from 'monaco-editor'

import { buildCommandCompletionInfo } from '~/features/editor/command-registry/completion'
import { getI18nLocale, i18n } from '~/plugins/i18n'

import type { EngineRuntimeCapabilities } from '~/domain/engine/runtime-capabilities'

const { t } = i18n.global

let cachedLocale: string | undefined
let cachedCapabilitiesKey: string | undefined
let cachedCommandCompletions: ReturnType<typeof buildCommandCompletionInfo> | undefined

function readCommandCompletions(capabilities?: EngineRuntimeCapabilities) {
  const currentLocale = getI18nLocale()
  const capabilitiesKey = capabilities ? JSON.stringify(capabilities) : undefined
  if (cachedLocale === currentLocale && cachedCapabilitiesKey === capabilitiesKey && cachedCommandCompletions) {
    return cachedCommandCompletions
  }

  cachedLocale = currentLocale
  cachedCapabilitiesKey = capabilitiesKey
  cachedCommandCompletions = buildCommandCompletionInfo(t, capabilities)
  return cachedCommandCompletions
}
export function getCommandCompletions(
  range: monaco.IRange,
  capabilities?: EngineRuntimeCapabilities,
): monaco.languages.CompletionItem[] {
  return readCommandCompletions(capabilities).map(item => ({
    label: item.commandRaw,
    insertText: `${item.commandRaw}:\${1};`,
    insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
    command: {
      id: 'editor.action.triggerSuggest',
      title: '',
    },
    detail: item.detail,
    kind: monaco.languages.CompletionItemKind.Function,
    range,
  }))
}
