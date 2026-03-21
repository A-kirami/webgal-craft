import { SCRIPT_CONFIG } from 'webgal-parser/src/config/scriptConfig'

/** 所有已知命令关键字集合，用于区分简写说话人和命令 */
const commandKeywords = new Set(SCRIPT_CONFIG.map(c => c.scriptString))

interface SpeakerSource {
  rawText: string
}

/**
 * 从单行 rawText 中提取说话人变更。
 *
 * 支持标准写法（say: -speaker=xxx / -clear）和简写（角色名:对话）。
 * 返回新说话人名称（空字符串 = 旁白），undefined = 该行不影响说话人。
 */
export function extractSpeakerChange(text: string): string | undefined {
  // 注释行不影响说话人
  if (text.startsWith(';')) {
    return undefined
  }

  const colonIdx = text.indexOf(':')

  // :xxx; 格式，旁白
  if (colonIdx === 0) {
    return ''
  }

  if (colonIdx > 0) {
    const prefix = text.slice(0, colonIdx)

    // 标准 say 写法：从参数中提取 speaker
    if (prefix === 'say') {
      return extractSpeakerFromSayArgs(text)
    }

    // 简写：角色名:对话内容
    if (!commandKeywords.has(prefix)) {
      return prefix
    }
  }

  // 无冒号或其他命令：继承上一个说话人
  return undefined
}

/**
 * 读取指定索引之前应继承到的说话人。
 */
export function getPreviousSpeakerAtIndex(
  entries: readonly SpeakerSource[],
  index: number,
): string {
  if (index <= 0) {
    return ''
  }

  let lastSpeaker = ''
  const endIndex = Math.min(index, entries.length)
  for (let currentIndex = 0; currentIndex < endIndex; currentIndex++) {
    lastSpeaker = applySpeakerChange(lastSpeaker, entries[currentIndex]!.rawText)
  }
  return lastSpeaker
}

export function getPreviousSpeakerAtLine(
  lineNumber: number,
  readLineContent: (lineNumber: number) => string,
): string {
  if (lineNumber <= 1) {
    return ''
  }

  let lastSpeaker = ''
  for (let currentLine = 1; currentLine < lineNumber; currentLine++) {
    lastSpeaker = applySpeakerChange(lastSpeaker, readLineContent(currentLine))
  }
  return lastSpeaker
}

/** 从 say 命令的参数中提取说话人 */
function extractSpeakerFromSayArgs(text: string): string | undefined {
  const speakerFlag = ' -speaker='
  const speakerIdx = text.indexOf(speakerFlag)
  if (speakerIdx !== -1) {
    const valueStart = speakerIdx + speakerFlag.length
    // 值到下一个参数分隔符 ' -'、语句结束符 ';' 或行尾
    let valueEnd = text.length
    const nextArgIdx = text.indexOf(' -', valueStart)
    const semicolonIdx = text.indexOf(';', valueStart)
    if (nextArgIdx !== -1) {
      valueEnd = Math.min(valueEnd, nextArgIdx)
    }
    if (semicolonIdx !== -1) {
      valueEnd = Math.min(valueEnd, semicolonIdx)
    }
    return text.slice(valueStart, valueEnd)
  }

  // -clear 清除说话人 → 旁白
  const clearFlag = ' -clear'
  const clearIdx = text.indexOf(clearFlag)
  if (clearIdx !== -1) {
    const afterClear = clearIdx + clearFlag.length
    // 确保是完整参数名（后面是 ';'、空格或行尾）
    if (afterClear >= text.length || text[afterClear] === ';' || text[afterClear] === ' ') {
      return ''
    }
  }

  // 没有 speaker 相关参数，继承
  return undefined
}

function applySpeakerChange(currentSpeaker: string, rawText: string): string {
  const nextSpeaker = extractSpeakerChange(rawText)
  return nextSpeaker === undefined ? currentSpeaker : nextSpeaker
}
