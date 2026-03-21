import { SCRIPT_CONFIG } from 'webgal-parser/src/config/scriptConfig'
import { commandType } from 'webgal-parser/src/interface/sceneInterface'

import type { arg, ISentence } from 'webgal-parser/src/interface/sceneInterface'

interface CommandCodec {
  type: commandType
  parse: (sentence: ISentence) => CommandNode
  serialize: (node: CommandNode) => ISentence
}

type CommandCodecMap = Partial<Record<commandType, CommandCodec>>

function createCommandCodec<TNode extends CommandNode>(
  type: TNode['type'],
  parse: (sentence: ISentence) => TNode,
  serialize: (node: TNode) => ISentence,
): CommandCodec {
  return {
    type: type as commandType,
    parse,
    serialize: serialize as (node: CommandNode) => ISentence,
  }
}

function buildCommandCodecMap(codecs: readonly CommandCodec[]): CommandCodecMap {
  const map: CommandCodecMap = {}
  for (const codec of codecs) {
    map[codec.type] = codec
  }
  return map
}

export function cloneArgs(args: arg[]): arg[] {
  return args.map(item => ({ ...item }))
}

function consumeFlagArg(args: arg[], key: string): boolean {
  const index = args.findIndex(item => item.key === key && item.value === true)
  if (index === -1) {
    return false
  }
  args.splice(index, 1)
  return true
}

function consumeStringArg(args: arg[], key: string): string | undefined {
  const index = args.findIndex(item => item.key === key && item.value !== true)
  if (index === -1) {
    return
  }

  const value = String(args[index].value)
  args.splice(index, 1)
  return value
}

function consumeNumberArg(args: arg[], key: string): number | undefined {
  const index = args.findIndex(item => item.key === key && item.value !== true)
  if (index === -1) {
    return
  }

  const numberValue = Number(args[index].value)
  args.splice(index, 1)
  return Number.isFinite(numberValue) ? numberValue : undefined
}

function toSentenceBase(node: CommandNode): Omit<ISentence, 'content' | 'args'> {
  return {
    command: node.type,
    commandRaw: node.commandRaw,
    sentenceAssets: [],
    subScene: [],
    inlineComment: node.inlineComment,
  }
}

class ArgBuilder {
  private readonly args: arg[] = []
  private readonly keys: string[] = []

  // 仅标记 key 为"已知"，不写入 args。
  // build() 时 extraArgs 中与已知 key 重复的条目会被过滤，
  // 用于 say 命令的 speaker 等"已编码在其他位置"的参数
  reserve(key: string): this {
    this.keys.push(key)
    return this
  }

  string(key: string, value: string | undefined): this {
    if (value?.trim()) {
      this.args.push({ key, value })
    }
    this.keys.push(key)
    return this
  }

  number(key: string, value: number | undefined): this {
    if (value !== undefined) {
      this.args.push({ key, value })
    }
    this.keys.push(key)
    return this
  }

  flag(key: string, value: boolean): this {
    if (value) {
      this.args.push({ key, value: true })
    }
    this.keys.push(key)
    return this
  }

  positionFlag(value: string | undefined, validValues: readonly string[]): this {
    if (value && validValues.includes(value)) {
      this.args.push({ key: value, value: true })
    }
    this.keys.push(...validValues)
    return this
  }

  build(extraArgs: arg[]): arg[] {
    const reservedKeys = new Set(this.keys)
    return [...this.args, ...extraArgs.filter(item => !reservedKeys.has(item.key))]
  }
}

function argBuilder(): ArgBuilder {
  return new ArgBuilder()
}

function consumeSayFigurePositionFlag(args: arg[]): typeof FIGURE_POSITION_FLAGS[number] | undefined {
  for (const flag of FIGURE_POSITION_FLAGS) {
    if (consumeFlagArg(args, flag)) {
      return flag
    }
  }
  return undefined
}

/**
 * webgal-parser 对 say 命令各种书写形式的解析结果：
 *
 * ┌─────────────────────────────────────┬──────────────────────────────┬─────────────┬──────────────────────────────┐
 * │ 原始文本                             │ commandRaw                   │ content     │ args 中的 speaker            │
 * ├─────────────────────────────────────┼──────────────────────────────┼─────────────┼──────────────────────────────┤
 * │ say:内容 -speaker=角色;              │ "say"                        │ "内容"      │ "角色"                       │
 * │ say:内容 -clear;                     │ "say"                        │ "内容"      │ 无                           │
 * │ say:内容;                            │ "say"                        │ "内容"      │ 无                           │
 * │ 角色:内容;                           │ "角色"                       │ "内容"      │ "角色"                       │
 * │ 角色:内容 -next;                     │ "角色"                       │ "内容"      │ "角色"                       │
 * │ :内容;                               │ ""                           │ "内容"      │ 无                           │
 * │ 内容;                                │ "内容"                       │ "内容"      │ 无                           │
 * │ 内容 -concat -notend;               │ "内容 -concat -notend"       │ "内容"      │ 无                           │
 * └─────────────────────────────────────┴──────────────────────────────┴─────────────┴──────────────────────────────┘
 *
 * 判断逻辑：
 * - commandRaw === "say"                          → 标准形式，speaker 从 args 取
 * - commandRaw === ""                             → 旁白简写（:内容;），隐含 clear
 * - commandRaw === SAY_CONTINUATION_RAW            → 续写（来自 serializeSayNode 序列化结果）
 * - args 中有 speaker                             → 简写有说话人（角色:内容;）
 * - args 中无 speaker 且 commandRaw.startsWith(content) → 续写（内容; 或 内容 -args;）
 */

function parseSayNode(sentence: ISentence): SayCommandNode {
  const args = cloneArgs(sentence.args)
  // 标准形式（say:内容 -speaker=角色）中，speaker 存储在 args 中；
  // 简写形式（角色:内容）中，speaker 存储在 commandRaw 中，且 args 含 speaker 条目。
  // 续写形式（内容;）中，commandRaw 包含完整文本（含参数），args 中无 speaker 条目。
  // 序列化后的 ISentence 中，续写形式 commandRaw 为 SAY_CONTINUATION_RAW 哨兵值。
  const speakerFromArgs = consumeStringArg(args, 'speaker')
  // 续写形式判断：
  // - commandRaw 为 SAY_CONTINUATION_RAW（来自 serializeSayNode 的往返）
  // - 或来自 webgal-parser 的首次解析：非标准形式、非旁白、args 中无 speaker，
  //   且 content 非空时 commandRaw 以 content 开头（区分续写与有说话人的简写），
  //   content 为空时排除保留命令字（区分续写与其他命令）。
  const isParserContinuation = sentence.commandRaw !== 'say'
    && sentence.commandRaw !== ''
    && speakerFromArgs === undefined
  const isContinuation = sentence.commandRaw === SAY_CONTINUATION_RAW
    || (isParserContinuation && sentence.content !== '' && sentence.commandRaw.startsWith(sentence.content))
    || (isParserContinuation && sentence.content === '' && !reservedCommandStrings.has(sentence.commandRaw))
  const speaker = sentence.commandRaw === 'say'
    ? (speakerFromArgs ?? '')
    : (isContinuation ? '' : sentence.commandRaw)
  const clearFromArgs = consumeFlagArg(args, 'clear')
  // 简写旁白形式（:内容;）中 commandRaw 为空字符串，隐含 clear
  const clear = clearFromArgs || (sentence.commandRaw === '' && !speaker)
  return {
    type: commandType.say,
    commandRaw: sentence.commandRaw,
    inlineComment: sentence.inlineComment,
    text: sentence.content,
    speaker,
    clear,
    fontSize: consumeStringArg(args, 'fontSize'),
    vocal: consumeStringArg(args, 'vocal'),
    volume: consumeNumberArg(args, 'volume'),
    figurePosition: consumeSayFigurePositionFlag(args),
    figureId: consumeStringArg(args, 'figureId'),
    next: consumeFlagArg(args, 'next'),
    continue: consumeFlagArg(args, 'continue'),
    concat: consumeFlagArg(args, 'concat'),
    notend: consumeFlagArg(args, 'notend'),
    extraArgs: args,
  }
}

// 简写形式说话人与命令头冲突时需回退到标准形式，避免解析歧义
const reservedCommandStrings = new Set(SCRIPT_CONFIG.map(c => c.scriptString))

// 续写形式的 commandRaw 哨兵值：ISentence.commandRaw 类型为 string（来自 webgal-parser），
// 但续写形式在解析器中没有独立的 commandRaw 表示。此哨兵值用于内部序列化往返，
// parseSayNode 和 serializeSentence 均通过此常量识别续写。
export const SAY_CONTINUATION_RAW = '\u0000__continuation__'

function serializeSayNode(node: SayCommandNode): ISentence {
  // 序列化规则：
  // 1. 说话人与命令头冲突 → 标准形式 say:内容 -speaker=角色;
  // 2. 有说话人 → 简写 角色:内容;
  // 3. 无说话人 + clear（旁白）→ 简写 :内容;（clear 隐含在冒号前缀中）
  // 4. 无说话人 + 非 clear（续写）→ 简写 内容;（无冒号）
  const isStandardForm = reservedCommandStrings.has(node.speaker)
  // 续写形式：无说话人、非 clear、非标准形式
  const isContinuation = !node.speaker && !node.clear && !isStandardForm
  // clear 仅在旁白简写形式（:内容;）中隐含，其他形式需显式写入 args
  const needsExplicitClear = node.clear && (!!node.speaker || isStandardForm)
  return {
    ...toSentenceBase(node),
    commandRaw: isStandardForm ? 'say' : (isContinuation ? SAY_CONTINUATION_RAW : node.speaker),
    content: node.text,
    args: argBuilder()
      .reserve('speaker')
      .reserve('clear')
      .string('speaker', isStandardForm ? node.speaker : undefined)
      .flag('clear', needsExplicitClear)
      .string('fontSize', node.fontSize)
      .string('vocal', node.vocal)
      .number('volume', node.volume)
      .positionFlag(node.figurePosition, FIGURE_POSITION_FLAGS)
      .string('figureId', node.figureId)
      .flag('next', node.next)
      .flag('continue', node.continue)
      .flag('concat', node.concat)
      .flag('notend', node.notend)
      .build(node.extraArgs),
  }
}

function parseCommentNode(sentence: ISentence): CommentCommandNode {
  return {
    type: commandType.comment,
    commandRaw: sentence.commandRaw,
    inlineComment: sentence.inlineComment,
    text: sentence.content,
    extraArgs: cloneArgs(sentence.args),
  }
}

function serializeCommentNode(node: CommentCommandNode): ISentence {
  return {
    ...toSentenceBase(node),
    content: node.text,
    args: cloneArgs(node.extraArgs),
  }
}

function parseSetVarNode(sentence: ISentence): SetVarCommandNode {
  const args = cloneArgs(sentence.args)
  const parsedContent = parseSetVarContent(sentence.content)
  return {
    type: commandType.setVar,
    commandRaw: sentence.commandRaw,
    inlineComment: sentence.inlineComment,
    name: parsedContent.name,
    value: parsedContent.value,
    global: consumeFlagArg(args, 'global'),
    extraArgs: args,
  }
}

function serializeSetVarNode(node: SetVarCommandNode): ISentence {
  return {
    ...toSentenceBase(node),
    content: stringifySetVarContent(node.name, node.value),
    args: argBuilder()
      .flag('global', node.global)
      .build(node.extraArgs),
  }
}

function parseChooseNode(sentence: ISentence): ChooseCommandNode {
  return {
    type: commandType.choose,
    commandRaw: sentence.commandRaw,
    inlineComment: sentence.inlineComment,
    choices: parseChooseContent(sentence.content),
    extraArgs: cloneArgs(sentence.args),
  }
}

function serializeChooseNode(node: ChooseCommandNode): ISentence {
  return {
    ...toSentenceBase(node),
    content: stringifyChooseContent(node.choices),
    args: cloneArgs(node.extraArgs),
  }
}

function parseApplyStyleNode(sentence: ISentence): ApplyStyleCommandNode {
  return {
    type: commandType.applyStyle,
    commandRaw: sentence.commandRaw,
    inlineComment: sentence.inlineComment,
    rules: parseStyleRuleContent(sentence.content),
    extraArgs: cloneArgs(sentence.args),
  }
}

function serializeApplyStyleNode(node: ApplyStyleCommandNode): ISentence {
  return {
    ...toSentenceBase(node),
    content: stringifyStyleRuleContent(node.rules),
    args: cloneArgs(node.extraArgs),
  }
}

function parseGenericNode(sentence: ISentence): GenericCommandNode {
  return {
    type: sentence.command as GenericCommandType,
    commandRaw: sentence.commandRaw,
    inlineComment: sentence.inlineComment,
    content: sentence.content,
    args: cloneArgs(sentence.args),
  }
}

function serializeGenericNode(node: GenericCommandNode): ISentence {
  return {
    ...toSentenceBase(node),
    content: node.content,
    args: cloneArgs(node.args),
  }
}

const commandCodecMap = buildCommandCodecMap([
  createCommandCodec(commandType.say, parseSayNode, serializeSayNode),
  createCommandCodec(commandType.comment, parseCommentNode, serializeCommentNode),
  createCommandCodec(commandType.setVar, parseSetVarNode, serializeSetVarNode),
  createCommandCodec(commandType.choose, parseChooseNode, serializeChooseNode),
  createCommandCodec(commandType.applyStyle, parseApplyStyleNode, serializeApplyStyleNode),
])

export function parseCommandNode(sentence: ISentence): CommandNode {
  const codec = commandCodecMap[sentence.command]
  if (codec) {
    return codec.parse(sentence)
  }
  return parseGenericNode(sentence)
}

export function serializeCommandNode(node: CommandNode): ISentence {
  const codec = commandCodecMap[node.type as commandType]
  if (codec) {
    return codec.serialize(node)
  }
  return serializeGenericNode(node as GenericCommandNode)
}

export function isTypedCommandNode(node: CommandNode): node is TypedCommandNode {
  return node.type in commandCodecMap
}
