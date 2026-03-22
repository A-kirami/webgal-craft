import { SCRIPT_CONFIG } from 'webgal-parser/src/config/scriptConfig'
import { commandType } from 'webgal-parser/src/interface/sceneInterface'

import { displayEntries } from './display'
import { effectEntries } from './effect'
import { performEntries } from './perform'
import { sceneEntries } from './scene'
import { resolveI18n } from './schema'
import { systemEntries } from './system'
import { serializeSentence } from '../webgal-script/serialize'

import type { CommandCategory, CommandEntry, FieldDef, I18nT } from './schema'
import type { arg, ISentence } from 'webgal-parser/src/interface/sceneInterface'

export const categoryTheme: Record<CommandCategory, {
  gradient: string
  bg: string
  text: string
  hoverBg: string
  hoverText: string
}> = {
  perform: { gradient: 'from-blue-500 to-blue-300', bg: 'bg-blue-50 dark:bg-blue-950', text: 'text-blue-500', hoverBg: 'hover:bg-blue-100 dark:hover:bg-blue-900', hoverText: 'hover:text-blue-600 dark:hover:text-blue-400' },
  effect: { gradient: 'from-pink-500 to-pink-300', bg: 'bg-pink-50 dark:bg-pink-950', text: 'text-pink-500', hoverBg: 'hover:bg-pink-100 dark:hover:bg-pink-900', hoverText: 'hover:text-pink-600 dark:hover:text-pink-400' },
  display: { gradient: 'from-teal-500 to-teal-300', bg: 'bg-teal-50 dark:bg-teal-950', text: 'text-teal-500', hoverBg: 'hover:bg-teal-100 dark:hover:bg-teal-900', hoverText: 'hover:text-teal-600 dark:hover:text-teal-400' },
  scene: { gradient: 'from-amber-500 to-amber-300', bg: 'bg-amber-50 dark:bg-amber-950', text: 'text-amber-500', hoverBg: 'hover:bg-amber-100 dark:hover:bg-amber-900', hoverText: 'hover:text-amber-600 dark:hover:text-amber-400' },
  system: { gradient: 'from-purple-500 to-purple-300', bg: 'bg-purple-50 dark:bg-purple-950', text: 'text-purple-500', hoverBg: 'hover:bg-purple-100 dark:hover:bg-purple-900', hoverText: 'hover:text-purple-600 dark:hover:text-purple-400' },
  comment: { gradient: 'from-gray-500 to-gray-300', bg: 'bg-gray-50 dark:bg-gray-950', text: 'text-gray-500', hoverBg: 'hover:bg-gray-100 dark:hover:bg-gray-900', hoverText: 'hover:text-gray-600 dark:hover:text-gray-400' },
}

export const commandPanelCategories = [
  'perform',
  'effect',
  'display',
  'scene',
  'system',
] as const satisfies readonly CommandCategory[]

export type CommandPanelCategory = (typeof commandPanelCategories)[number] | 'all' | 'groups'

/**
 * 获取命令面板分类的本地化标签
 */
export function getCategoryLabel(category: CommandPanelCategory, t: I18nT): string {
  const labelMap: Record<CommandPanelCategory, string> = {
    all: t('edit.visualEditor.commandPanel.categories.all'),
    perform: t('edit.visualEditor.commandPanel.categories.perform'),
    effect: t('edit.visualEditor.commandPanel.categories.effect'),
    display: t('edit.visualEditor.commandPanel.categories.display'),
    scene: t('edit.visualEditor.commandPanel.categories.scene'),
    system: t('edit.visualEditor.commandPanel.categories.system'),
    groups: t('edit.visualEditor.commandPanel.categories.groups'),
  }
  return labelMap[category] ?? labelMap.all
}

export const commandEntries: readonly CommandEntry[] = [
  ...performEntries,
  ...effectEntries,
  ...displayEntries,
  ...sceneEntries,
  ...systemEntries,
]

const entryMap = new Map<commandType, CommandEntry>(
  commandEntries.map(e => [e.type, e]),
)

// commandType → SCRIPT_CONFIG 中定义的脚本字符串映射
const scriptStringMap = new Map<commandType, string>(
  SCRIPT_CONFIG.map(c => [c.scriptType, c.scriptString]),
)

const defaultEntry: CommandEntry = {
  type: commandType.say,
  label: t => t('edit.visualEditor.commands.unknown'),
  description: t => t('edit.visualEditor.commandDescriptions.unknown'),
  icon: 'i-lucide-help-circle',
  category: 'comment',
  fields: [],
}

function buildFactoryContent(entry: CommandEntry): string {
  const contentField = entry.fields.find(item => item.storage === 'content')?.field
  if (!contentField) {
    return ''
  }

  // switch 类型需要将 boolean defaultValue 映射为 onValue/offValue 字符串
  if (contentField.type === 'switch' && typeof contentField.defaultValue === 'boolean') {
    if (contentField.defaultValue && contentField.onValue) {
      return contentField.onValue
    }
    if (!contentField.defaultValue && contentField.offValue) {
      return contentField.offValue
    }
  }

  if ('defaultValue' in contentField && contentField.defaultValue !== undefined) {
    return String(contentField.defaultValue)
  }

  return ''
}

// 工厂默认语句使用最简形式，不输出任何参数。
// defaultValue 仅用于 UI 控件的初始显示值，不写入脚本。
function buildFactoryArgs(_entry: CommandEntry): arg[] {
  return []
}

function buildFactorySentence(type: commandType): ISentence {
  const entry = getCommandConfig(type)
  const commandRawField = entry.fields.find(item => item.storage === 'commandRaw')?.field as FieldDef | undefined
  // 有 commandRaw 字段且有 defaultValue 时使用 defaultValue；
  // 有 commandRaw 字段但无 defaultValue 时，使用 SCRIPT_CONFIG 中的脚本字符串作为标准形式
  // （如 say 命令：空状态下使用 say:; 标准形式，用户设置说话人后由 serializeSayNode 切换为简写）；
  // 无 commandRaw 字段时从 SCRIPT_CONFIG 获取正确的脚本字符串（如 pixi → pixiPerform）
  const commandRaw = commandRawField
    ? ('defaultValue' in commandRawField && typeof commandRawField.defaultValue === 'string'
        ? commandRawField.defaultValue
        : (scriptStringMap.get(type) ?? commandType[type]))
    : (scriptStringMap.get(type) ?? commandType[type])

  return {
    command: type,
    commandRaw,
    content: buildFactoryContent(entry),
    args: buildFactoryArgs(entry),
    sentenceAssets: [],
    subScene: [],
    inlineComment: '',
  }
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

export function getCommandDescription(type: commandType, t: I18nT, content?: string): string {
  return resolveI18n(getCommandConfig(type).description, t, content)
}

const factoryTextCache = new Map<commandType, string>()

export function getFactoryDefaultCommandText(type: commandType): string {
  let cached = factoryTextCache.get(type)
  if (cached === undefined) {
    cached = serializeSentence(buildFactorySentence(type))
    factoryTextCache.set(type, cached)
  }
  return cached
}

export function getCommandTheme(sentence: ISentence) {
  const config = getCommandConfig(sentence.command)
  return categoryTheme[config.category]
}
