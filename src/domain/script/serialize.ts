import { commandType } from 'webgal-parser/src/interface/sceneInterface'

import { SAY_CONTINUATION_RAW } from './codec'

import type { ISentence } from 'webgal-parser/src/interface/sceneInterface'

/**
 * 将 ISentence 序列化为 WebGAL 脚本文本。
 *
 * 格式规则：
 * - comment:     ";{content}"
 * - say 标准形式: "say:{content}[ -speaker={speaker}][ -args][ ;comment]"
 * - say 简写有 speaker: "{speaker}:{content}[ -args][ ;comment]"
 * - say 简写无 speaker: ":{content}[ -args][ ;comment]"
 * - 其他命令:     "{commandRaw}:{content}[ -args][ ;comment]"
 *
 * Args 序列化：
 * - boolean true  → " -key"
 * - 其他值        → " -key={value}"
 * - say.vocal     → " -{value}"
 * - 简写形式 say 命令自动过滤 speaker arg（已编码在 commandRaw 中）
 */
export function serializeSentence(sentence: ISentence): string {
  if (sentence.command === commandType.comment) {
    return `;${sentence.content}`
  }

  const argsText = serializeArgs(sentence)
  const commentText = sentence.inlineComment ? `;${sentence.inlineComment}` : ''
  const statementSuffix = sentence.inlineComment ? '' : ';'
  // WebGAL 脚本中分号是行内注释分隔符，content 中的字面分号需要转义
  const escapedContent = sentence.content.replaceAll(';', String.raw`\;`)

  // say 续写形式：commandRaw 为哨兵值时省略冒号前缀，直接输出内容文本。
  if (sentence.commandRaw === SAY_CONTINUATION_RAW) {
    return `${escapedContent}${argsText}${commentText}${statementSuffix}`
  }

  return `${sentence.commandRaw}:${escapedContent}${argsText}${commentText}${statementSuffix}`
}

function serializeArgs(sentence: ISentence): string {
  // 简写形式 say（commandRaw 为角色名）的 speaker 已编码在 commandRaw 中，需过滤
  const isShorthandSay = sentence.command === commandType.say && sentence.commandRaw !== 'say'
  const filteredArgs = sentence.args.filter(
    arg => arg.key && !(isShorthandSay && arg.key === 'speaker'),
  )

  return filteredArgs
    .map((arg) => {
      if (sentence.command === commandType.say && arg.key === 'vocal' && arg.value !== true) {
        return ` -${arg.value}`
      }
      return arg.value === true ? ` -${arg.key}` : ` -${arg.key}=${arg.value}`
    })
    .join('')
}
