import { commandType } from 'webgal-parser/src/interface/sceneInterface'

import { controlEntries } from './control'
import { dialogueEntries } from './dialogue'
import { effectEntries } from './effect'
import { galleryEntries } from './gallery'
import { mediaEntries } from './media'
import { sceneEntries } from './scene'
import { resolveI18n } from './schema'

import type {
  CommandCategory,
  CommandEntry,
  I18nT,
} from './schema'
import type { ISentence } from 'webgal-parser/src/interface/sceneInterface'

export const categoryTheme: Record<CommandCategory, {
  gradient: string
  bg: string
  text: string
}> = {
  dialogue: { gradient: 'from-blue-500 to-blue-300', bg: 'bg-blue-50 dark:bg-blue-950', text: 'text-blue-500' },
  media: { gradient: 'from-sky-500 to-sky-300', bg: 'bg-sky-50 dark:bg-sky-950', text: 'text-sky-500' },
  scene: { gradient: 'from-amber-500 to-amber-300', bg: 'bg-amber-50 dark:bg-amber-950', text: 'text-amber-500' },
  logic: { gradient: 'from-purple-500 to-purple-300', bg: 'bg-purple-50 dark:bg-purple-950', text: 'text-purple-500' },
  effect: { gradient: 'from-pink-500 to-pink-300', bg: 'bg-pink-50 dark:bg-pink-950', text: 'text-pink-500' },
  display: { gradient: 'from-teal-500 to-teal-300', bg: 'bg-teal-50 dark:bg-teal-950', text: 'text-teal-500' },
  gallery: { gradient: 'from-rose-500 to-rose-300', bg: 'bg-rose-50 dark:bg-rose-950', text: 'text-rose-500' },
  comment: { gradient: 'from-gray-500 to-gray-300', bg: 'bg-gray-50 dark:bg-gray-950', text: 'text-gray-500' },
}

const allEntries: CommandEntry[] = [
  ...dialogueEntries,
  ...mediaEntries,
  ...sceneEntries,
  ...controlEntries,
  ...effectEntries,
  ...galleryEntries,
]

const entryMap = new Map<commandType, CommandEntry>(
  allEntries.map(e => [e.type, e]),
)

const defaultEntry: CommandEntry = {
  type: commandType.say,
  label: t => t('edit.visualEditor.commands.unknown'),
  icon: 'i-lucide-help-circle',
  category: 'comment',
  fields: [],
}

export function isCommandSupported(type: commandType): boolean {
  return entryMap.has(type)
}

export function getCommandConfig(type: commandType): CommandEntry {
  return entryMap.get(type) ?? defaultEntry
}

export function readCommandConfig(type: commandType | undefined): CommandEntry {
  if (type === undefined) {
    return defaultEntry
  }
  return getCommandConfig(type)
}

export function getCommandLabel(sentence: ISentence, t: I18nT, content?: string): string {
  return resolveI18n(getCommandConfig(sentence.command).label, t, content)
}

export function getCommandTheme(sentence: ISentence) {
  const config = getCommandConfig(sentence.command)
  return categoryTheme[config.category]
}
