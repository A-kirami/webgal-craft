import { commandEntries, getCommandConfig } from '~/helper/command-registry'
import { resolveI18n } from '~/helper/command-registry/schema'
import { parseSentence } from '~/helper/webgal-script/parser'

import type { CommandPanelCategory } from '~/helper/command-registry'
import type { CommandEntry, I18nT } from '~/helper/command-registry/schema'
import type { StatementGroup } from '~/stores/command-panel'

export interface CommandPanelGroupTagEntry {
  label: string
  count: number
}

export function resolveCommandPanelVisibleCommands(
  activeCategory: CommandPanelCategory,
  entries: readonly CommandEntry[] = commandEntries,
): readonly CommandEntry[] {
  if (activeCategory === 'all' || activeCategory === 'groups') {
    return entries
  }

  return entries.filter(entry => entry.category === activeCategory)
}

export function buildCommandPanelGroupTagEntries(
  group: StatementGroup,
  t: I18nT,
): CommandPanelGroupTagEntry[] {
  const countMap = new Map<string, CommandPanelGroupTagEntry>()

  for (const rawText of group.rawTexts) {
    const sentence = parseSentence(rawText)
    if (!sentence) {
      continue
    }

    const label = resolveI18n(getCommandConfig(sentence.command).label, t)
    const existing = countMap.get(label)
    if (existing) {
      existing.count++
      continue
    }

    countMap.set(label, {
      label,
      count: 1,
    })
  }

  return [...countMap.values()]
}
