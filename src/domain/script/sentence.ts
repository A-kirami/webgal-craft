import { commandType } from 'webgal-parser/src/interface/sceneInterface'

import { LATEST_ENGINE_RUNTIME_CAPABILITIES } from '~/domain/engine/runtime-capabilities'

import { parseScene, parseSentence } from './parser'

import type { ISentence } from 'webgal-parser/src/interface/sceneInterface'
import type { SceneStatement } from '~/domain/document/document-model'
import type { EngineRuntimeCapabilities } from '~/domain/engine/runtime-capabilities'

export interface StatementEntry {
  id: number
  rawText: string
  syntaxCapabilities: StatementSyntaxCapabilities
  /** 仅供编辑器跨视图共享、不会写入脚本的临时解析草稿。 */
  draftParsed?: ISentence
  parsed: ISentence | undefined
  parseError: boolean
}

/**
 * 一条逻辑语句在源文本中覆盖的物理行范围。
 *
 * 行号使用 0-based、包含首尾，与 webgal-parser 的 ISentence 保持一致。
 * rawText 始终从原始文本截取，不能使用预处理后的折叠文本替代。
 */
export interface StatementSourceRange {
  endLine: number
  parsed?: ISentence
  rawText: string
  startLine: number
}

export type StatementSyntaxCapabilities = Pick<EngineRuntimeCapabilities, 'multilineStatements' | 'sceneSemantics'>

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
    startLine: 0,
    endLine: 0,
    isLineBreakHolder: false,
  }
}

/**
 * 解析全文，并保留每条逻辑语句在原始文本中的行范围。
 *
 * 解析器会为续行生成占位语句以保持物理行数量；这里排除占位语句，
 * 再以解析器给出的范围截取原始行，保留用户的缩进与换行格式。
 */
export function buildStatementSourceRanges(
  text: string,
  capabilities?: StatementSyntaxCapabilities,
): StatementSourceRange[] {
  if (text === '') {
    return []
  }

  const lines = text.split('\n')
  if (capabilities?.multilineStatements === false) {
    return lines.map((rawText, line) => ({
      endLine: line,
      parsed: parseSentence(rawText, capabilities),
      rawText,
      startLine: line,
    }))
  }

  const scene = parseScene(text, '', '', capabilities)
  if (!scene) {
    return lines.map((rawText, line) => ({
      endLine: line,
      rawText,
      startLine: line,
    }))
  }

  return scene.sentenceList
    .filter(sentence => !sentence.isLineBreakHolder)
    .map(sentence => ({
      endLine: sentence.endLine,
      parsed: sentence,
      rawText: lines.slice(sentence.startLine, sentence.endLine + 1).join('\n'),
      startLine: sentence.startLine,
    }))
}

/**
 * 找到覆盖指定物理行的逻辑语句。
 */
export function findStatementSourceRangeAtLine(
  text: string,
  line: number,
  capabilities?: StatementSyntaxCapabilities,
): StatementSourceRange | undefined {
  return buildStatementSourceRanges(text, capabilities)
    .find(range => line >= range.startLine && line <= range.endLine)
}

/**
 * 将全文本按逻辑语句边界拆分为原始文本列表。
 */
export function splitStatements(text: string, capabilities?: StatementSyntaxCapabilities): string[] {
  return buildStatementSourceRanges(text, capabilities).map(range => range.rawText)
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
    syntaxCapabilities?: StatementSyntaxCapabilities
  } = {},
): StatementEntry {
  const {
    id,
    advanceAllocator = true,
    syntaxCapabilities = LATEST_ENGINE_RUNTIME_CAPABILITIES,
  } = options
  const nextStatementId = id ?? nextId++
  if (advanceAllocator && id !== undefined) {
    nextId = Math.max(nextId, id + 1)
  }

  return markRaw({
    id: nextStatementId,
    rawText,
    syntaxCapabilities,
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
 * 从原始语句文本构建一个 StatementEntry。
 */
export function buildSingleStatement(
  rawText: string,
  id?: number,
  syntaxCapabilities?: StatementSyntaxCapabilities,
): StatementEntry {
  return createStatementEntry(rawText, { id, syntaxCapabilities })
}

/**
 * 从全文本构建 StatementEntry 列表，为每条语句分配唯一 id。
 */
export function buildStatements(text: string, capabilities?: StatementSyntaxCapabilities): StatementEntry[] {
  return splitStatements(text, capabilities).map(raw => buildSingleStatement(raw, undefined, capabilities))
}

export function buildSceneStatements(text: string, capabilities?: StatementSyntaxCapabilities): SceneStatement[] {
  return splitStatements(text, capabilities).map(raw => createSceneStatement(raw))
}

/**
 * 在按行重建语句列表时，尽量复用旧语句的 id 和缓存，
 * 让文本模式下未改动的语句保持稳定身份。
 */
export function rebuildStatementsWithStableIds(
  previousEntries: readonly SceneStatement[],
  text: string,
  capabilities?: StatementSyntaxCapabilities,
): SceneStatement[] {
  const nextRawTexts = splitStatements(text, capabilities)
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

export function createStatementEntryFromSceneStatement(
  statement: SceneStatement,
  syntaxCapabilities?: StatementSyntaxCapabilities,
): StatementEntry {
  return createStatementEntry(statement.rawText, {
    id: statement.id,
    advanceAllocator: false,
    syntaxCapabilities,
  })
}

export function createTransientStatementEntry(
  rawText: string,
  id: number,
  syntaxCapabilities?: StatementSyntaxCapabilities,
): StatementEntry {
  return createStatementEntry(rawText, {
    id,
    advanceAllocator: false,
    syntaxCapabilities,
  })
}

/**
 * 解析 StatementEntry 的 parsed 字段（按需缓存）。
 * 编辑器存在临时草稿时优先返回草稿；否则如果已有缓存且 rawText 未变，直接返回缓存值。
 *
 * 注意：此函数会在 computed 内被调用，对 entry 产生写入副作用（缓存 parsed）。
 * 这是安全的，因为 entry 始终通过 markRaw 标记为非响应式对象，
 * 对其属性的写入不会触发 Vue 的依赖追踪或无限重算。
 * 如果移除 markRaw 不变量，此处将产生无限循环。
 */
export function ensureParsed(entry: StatementEntry): ISentence | undefined {
  if (entry.draftParsed !== undefined) {
    return entry.draftParsed
  }

  if (entry.parsed !== undefined || entry.parseError) {
    return entry.parsed
  }

  entry.parsed = parseSentence(entry.rawText, entry.syntaxCapabilities)
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
