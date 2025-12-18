import * as monaco from 'monaco-editor'

import { getI18nLocale, i18n } from '~/plugins/i18n'

interface CompletionInfo {
  commandRaw: string
  detail: string
}

const { t } = i18n.global

let cachedLocale: string | undefined
let cachedCommandCompletions: CompletionInfo[] | undefined

function buildCommandCompletions(): CompletionInfo[] {
  const currentLocale = getI18nLocale()
  if (cachedLocale === currentLocale && cachedCommandCompletions) {
    return cachedCommandCompletions
  }

  const completions: CompletionInfo[] = [
    { commandRaw: 'changeBg', detail: t('edit.completion.commands.changeBg') },
    { commandRaw: 'changeFigure', detail: t('edit.completion.commands.changeFigure') },
    { commandRaw: 'bgm', detail: t('edit.completion.commands.bgm') },
    { commandRaw: 'playVideo', detail: t('edit.completion.commands.playVideo') },
    { commandRaw: 'pixiPerform', detail: t('edit.completion.commands.pixiPerform') },
    { commandRaw: 'pixiInit', detail: t('edit.completion.commands.pixiInit') },
    { commandRaw: 'intro', detail: t('edit.completion.commands.intro') },
    { commandRaw: 'miniAvatar', detail: t('edit.completion.commands.miniAvatar') },
    { commandRaw: 'changeScene', detail: t('edit.completion.commands.changeScene') },
    { commandRaw: 'choose', detail: t('edit.completion.commands.choose') },
    { commandRaw: 'end', detail: t('edit.completion.commands.end') },
    { commandRaw: 'setComplexAnimation', detail: t('edit.completion.commands.setComplexAnimation') },
    { commandRaw: 'label', detail: t('edit.completion.commands.label') },
    { commandRaw: 'jumpLabel', detail: t('edit.completion.commands.jumpLabel') },
    { commandRaw: 'setVar', detail: t('edit.completion.commands.setVar') },
    { commandRaw: 'callScene', detail: t('edit.completion.commands.callScene') },
    { commandRaw: 'showVars', detail: t('edit.completion.commands.showVars') },
    { commandRaw: 'unlockCg', detail: t('edit.completion.commands.unlockCg') },
    { commandRaw: 'unlockBgm', detail: t('edit.completion.commands.unlockBgm') },
    { commandRaw: 'filmMode', detail: t('edit.completion.commands.filmMode') },
    { commandRaw: 'setTextbox', detail: t('edit.completion.commands.setTextbox') },
    { commandRaw: 'setAnimation', detail: t('edit.completion.commands.setAnimation') },
    { commandRaw: 'playEffect', detail: t('edit.completion.commands.playEffect') },
    { commandRaw: 'setTempAnimation', detail: t('edit.completion.commands.setTempAnimation') },
    { commandRaw: 'setTransform', detail: t('edit.completion.commands.setTransform') },
    { commandRaw: 'setTransition', detail: t('edit.completion.commands.setTransition') },
    { commandRaw: 'getUserInput', detail: t('edit.completion.commands.getUserInput') },
    { commandRaw: 'applyStyle', detail: t('edit.completion.commands.applyStyle') },
    { commandRaw: 'wait', detail: t('edit.completion.commands.wait') },
  ]

  cachedLocale = currentLocale
  cachedCommandCompletions = completions
  return completions
}

export function getCommandCompletions(range: monaco.IRange): monaco.languages.CompletionItem[] {
  const commandCompletion = buildCommandCompletions()
  return commandCompletion.map(item => ({
    label: item.commandRaw,
    insertText: item.commandRaw + ':',
    detail: item.detail,
    kind: monaco.languages.CompletionItemKind.Function,
    range,
  }))
}
