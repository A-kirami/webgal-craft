import { parseSentence } from '~/domain/script/parser'
import { commandEntries, getCommandConfig, getCommandId } from '~/features/editor/command-registry'
import { resolveI18n } from '~/features/editor/command-registry/schema'

import type { CommandPanelCategory } from '~/features/editor/command-registry'
import type { CommandEntry, I18nT } from '~/features/editor/command-registry/schema'
import type { StatementGroup } from '~/stores/command-panel'

export interface CommandPanelGroupTagEntry {
  label: string
  count: number
}

export function resolveCommandPanelVisibleCommands(
  activeCategory: CommandPanelCategory,
  favoriteCommandIds: readonly string[] = [],
  entries: readonly CommandEntry[] = commandEntries,
): readonly CommandEntry[] {
  if (activeCategory === 'all' || activeCategory === 'groups') {
    return entries
  }

  if (activeCategory === 'favorites') {
    const entriesById = new Map<string, CommandEntry>()
    for (const entry of entries) {
      const id = getCommandId(entry.type)
      if (id !== undefined) {
        entriesById.set(id, entry)
      }
    }

    const favoriteEntries: CommandEntry[] = []
    const seenIds = new Set<string>()
    for (const id of favoriteCommandIds) {
      const entry = entriesById.get(id)
      if (entry && !seenIds.has(id)) {
        favoriteEntries.push(entry)
        seenIds.add(id)
      }
    }
    return favoriteEntries
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
