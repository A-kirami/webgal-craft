import { commandType } from 'webgal-parser/src/interface/sceneInterface'

import { parseSentence } from './parser'
import { serializeSentence } from './serialize'

import type { ISentence } from 'webgal-parser/src/interface/sceneInterface'

export interface StatementEntry {
  id: number
  rawText: string
  parsed: ISentence | undefined
  parseError: boolean
  collapsed: boolean
}

let nextId = 0

/**
 * 为空行创建默认的 ISentence 结构（say 命令，空内容）。
 */
export function createEmptySentence(): ISentence {
  return {
    command: commandType.say,
    commandRaw: '',
    content: '',
    args: [],
    sentenceAssets: [],
    subScene: [],
    inlineComment: '',
  }
}

/**
 * 将全文本按语句边界拆分为原始文本列表。
 * 当前实现：按行拆分（每行一条语句）。
 * 未来支持跨行语句时，只需修改此函数。
 */
export function splitStatements(text: string): string[] {
  return text.split('\n')
}

/**
 * 将语句原始文本列表拼接为全文本。
 */
export function joinStatements(entries: StatementEntry[]): string {
  return entries.map(entry => entry.rawText).join('\n')
}

/**
 * 从单行原始文本构建一个 StatementEntry。
 */
export function buildSingleStatement(rawText: string): StatementEntry {
  return markRaw({
    id: nextId++,
    rawText,
    parsed: undefined,
    parseError: false,
    collapsed: false,
  })
}

/**
 * 从全文本构建 StatementEntry 列表，为每条语句分配唯一 id。
 */
export function buildStatements(text: string): StatementEntry[] {
  return splitStatements(text).map(raw => buildSingleStatement(raw))
}

/**
 * 解析 StatementEntry 的 parsed 字段（按需缓存）。
 * 如果已有缓存且 rawText 未变，直接返回缓存值。
 *
 * 注意：此函数会在 computed 内被调用，对 entry 产生写入副作用（缓存 parsed）。
 * 这是安全的，因为 entry 始终通过 markRaw 标记为非响应式对象，
 * 对其属性的写入不会触发 Vue 的依赖追踪或无限重算。
 * 如果移除 markRaw 不变量，此处将产生无限循环。
 */
export function ensureParsed(entry: StatementEntry): ISentence | undefined {
  if (entry.parsed !== undefined || entry.parseError) {
    return entry.parsed
  }

  entry.parsed = parseSentence(entry.rawText)
  entry.parseError = !entry.parsed
  return entry.parsed
}

/**
 * 更新 StatementEntry：将新的 ISentence 序列化为 rawText 并更新 parsed 缓存。
 * 返回更新后的 entry（原地修改）。
 */
export function updateStatement(entry: StatementEntry, newSentence: ISentence): StatementEntry {
  entry.rawText = serializeSentence(newSentence)
  entry.parsed = newSentence
  entry.parseError = false
  return entry
}

export function readSentenceArgString(sentence: ISentence, key: string): string {
  const arg = sentence.args.find(item => item.key === key)
  if (!arg || arg.value === true || arg.value === false) {
    return ''
  }
  return String(arg.value ?? '')
}

export function hasSentenceTruthyFlag(sentence: ISentence, key: string): boolean {
  return sentence.args.some(arg => arg.key === key && arg.value === true)
}
