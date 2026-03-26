import { commandType } from 'webgal-parser/src/interface/sceneInterface'

import { parseSentence } from './parser'

import type { ISentence } from 'webgal-parser/src/interface/sceneInterface'
import type { SceneStatement } from '~/domain/document/document-model'

export interface StatementEntry {
  id: number
  rawText: string
  parsed: ISentence | undefined
  parseError: boolean
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
export function joinStatements(entries: readonly Pick<SceneStatement, 'rawText'>[]): string {
  return entries.map(entry => entry.rawText).join('\n')
}

function createStatementEntry(
  rawText: string,
  options: {
    advanceAllocator?: boolean
    id?: number
  } = {},
): StatementEntry {
  const { id, advanceAllocator = true } = options
  const nextStatementId = id ?? nextId++
  if (advanceAllocator && id !== undefined) {
    nextId = Math.max(nextId, id + 1)
  }

  return markRaw({
    id: nextStatementId,
    rawText,
    parsed: undefined,
    parseError: false,
  })
}

function createSceneStatement(
  rawText: string,
  options: {
    advanceAllocator?: boolean
    id?: number
  } = {},
): SceneStatement {
  const { id, advanceAllocator = true } = options
  const nextStatementId = id ?? nextId++
  if (advanceAllocator && id !== undefined) {
    nextId = Math.max(nextId, id + 1)
  }

  return {
    id: nextStatementId,
    rawText,
  }
}

/**
 * 从单行原始文本构建一个 StatementEntry。
 */
export function buildSingleStatement(rawText: string, id?: number): StatementEntry {
  return createStatementEntry(rawText, { id })
}

/**
 * 从全文本构建 StatementEntry 列表，为每条语句分配唯一 id。
 */
export function buildStatements(text: string): StatementEntry[] {
  return splitStatements(text).map(raw => buildSingleStatement(raw))
}

export function buildSceneStatements(text: string): SceneStatement[] {
  return splitStatements(text).map(raw => createSceneStatement(raw))
}

/**
 * 在按行重建语句列表时，尽量复用旧语句的 id 和缓存，
 * 让文本模式下未改动的语句保持稳定身份。
 */
export function rebuildStatementsWithStableIds(
  previousEntries: readonly SceneStatement[],
  text: string,
): SceneStatement[] {
  const nextRawTexts = splitStatements(text)
  const previousIndexMap = new Map<string, number[]>()

  for (const [index, entry] of previousEntries.entries()) {
    const indices = previousIndexMap.get(entry.rawText)
    if (indices) {
      indices.push(index)
      continue
    }

    previousIndexMap.set(entry.rawText, [index])
  }

  const nextQueueIndexMap = new Map<string, number>()
  let lastMatchedPreviousIndex = -1

  return nextRawTexts.map((rawText) => {
    const candidateIndices = previousIndexMap.get(rawText)
    if (!candidateIndices) {
      return createSceneStatement(rawText)
    }

    let queueIndex = nextQueueIndexMap.get(rawText) ?? 0
    while (queueIndex < candidateIndices.length && candidateIndices[queueIndex]! <= lastMatchedPreviousIndex) {
      queueIndex++
    }

    nextQueueIndexMap.set(rawText, queueIndex)

    const matchedPreviousIndex = candidateIndices[queueIndex]
    if (matchedPreviousIndex === undefined) {
      return createSceneStatement(rawText)
    }

    nextQueueIndexMap.set(rawText, queueIndex + 1)
    lastMatchedPreviousIndex = matchedPreviousIndex
    return previousEntries[matchedPreviousIndex]!
  })
}

export function createStatementEntryFromSceneStatement(statement: SceneStatement): StatementEntry {
  return createStatementEntry(statement.rawText, {
    id: statement.id,
    advanceAllocator: false,
  })
}

export function createTransientStatementEntry(rawText: string, id: number): StatementEntry {
  return createStatementEntry(rawText, {
    id,
    advanceAllocator: false,
  })
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
