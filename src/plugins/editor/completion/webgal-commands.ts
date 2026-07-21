import * as monaco from 'monaco-editor'

import { buildCommandCompletionInfo } from '~/features/editor/command-registry/completion'
import { getI18nLocale, i18n } from '~/plugins/i18n'

const { t } = i18n.global

let cachedLocale: string | undefined
let cachedCommandCompletions: ReturnType<typeof buildCommandCompletionInfo> | undefined

function readCommandCompletions() {
  const currentLocale = getI18nLocale()
  if (cachedLocale === currentLocale && cachedCommandCompletions) {
    return cachedCommandCompletions
  }

  cachedLocale = currentLocale
  cachedCommandCompletions = buildCommandCompletionInfo(t)
  return cachedCommandCompletions
}
export function getCommandCompletions(range: monaco.IRange): monaco.languages.CompletionItem[] {
  return readCommandCompletions().map(item => ({
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
