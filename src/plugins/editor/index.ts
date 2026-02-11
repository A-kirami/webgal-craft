import { join } from '@tauri-apps/api/path'
import { readDir } from '@tauri-apps/plugin-fs'
import { LRUCache } from 'lru-cache'
import * as monaco from 'monaco-editor'
import { SCRIPT_CONFIG } from 'webgal-parser/src/config/scriptConfig'
import { commandType, IScene } from 'webgal-parser/src/interface/sceneInterface'

import { getArgKeyCompletions } from './completion/webgal-argument-keys'
import { getCommandCompletions } from './completion/webgal-commands'
import darkTheme from './themes/webgal-dark.json'
import lightTheme from './themes/webgal-light.json'

import './monaco'

// 常量定义
const TEMP_SCENE_NAME = 'tempScene'
const TEMP_SCENE_URL = 'tempUrl'
const FILE_CACHE_TTL = 5000 // 文件缓存过期时间（毫秒）
const FILE_CACHE_MAX_SIZE = 100 // 文件缓存最大条目数

// WebGAL 脚本句子部分枚举
enum SentencePart {
  Command, // 命令
  Content, // 内容
  Argument, // 参数
  Comment, // 注释
}

// 文件类型, 以目录区分
type FileType = 'background' | 'figure' | 'scene' | 'bgm' | 'vocal' | 'video'

// 命令到文件类型的映射
const COMMAND_TO_FILE_TYPE_MAP: Partial<Record<commandType, FileType>> = {
  [commandType.changeBg]: 'background',
  [commandType.changeFigure]: 'figure',
  [commandType.bgm]: 'bgm',
  [commandType.video]: 'video',
  [commandType.changeScene]: 'scene',
  [commandType.callScene]: 'scene',
  [commandType.playEffect]: 'vocal',
  [commandType.unlockCg]: 'background',
  [commandType.unlockBgm]: 'bgm',
}

// 文件系统缓存
interface CacheEntry {
  entries: { name: string, isDirectory: boolean }[]
  timestamp: number
}

const fileSystemCache = new LRUCache<string, CacheEntry>({
  max: FILE_CACHE_MAX_SIZE,
  updateAgeOnGet: true,
})

// 主题名称常量
export const THEME_LIGHT = 'webgal-light'
export const THEME_DARK = 'webgal-dark'

// Monaco 编辑器基础配置
export const BASE_EDITOR_OPTIONS = {
  bracketPairColorization: {
    enabled: true,
    independentColorPoolPerBracketType: true,
  },
  cursorSmoothCaretAnimation: 'on',
  formatOnPaste: true,
  formatOnType: true,
  minimap: { enabled: true },
  unicodeHighlight: {
    ambiguousCharacters: false,
    invisibleCharacters: false,
    nonBasicASCII: false,
  },
  smoothScrolling: true,
  quickSuggestions: { other: true, comments: false, strings: true },
} as const satisfies monaco.editor.IEditorConstructionOptions

// 定义主题
monaco.editor.defineTheme(THEME_LIGHT, lightTheme as monaco.editor.IStandaloneThemeData)
monaco.editor.defineTheme(THEME_DARK, darkTheme as monaco.editor.IStandaloneThemeData)

// 注册 WebGAL 脚本语言
monaco.languages.register({ id: 'webgalscript' })
monaco.languages.setLanguageConfiguration('webgalscript', {
  comments: { lineComment: ';' },
  brackets: [['{', '}'], ['[', ']'], ['(', ')']],
  autoClosingPairs: [
    { open: '{', close: '}' },
    { open: '[', close: ']' },
    { open: '(', close: ')' },
    { open: '"', close: '"' },
  ],
})

monaco.languages.registerCompletionItemProvider('webgalscript', {
  triggerCharacters: [':', ' -', '/'],
  provideCompletionItems: async (model, position) => {
    let suggestions: monaco.languages.CompletionItem[] = []
    const currentLine = model.getLineContent(position.lineNumber)

    const sentencePart = getSentencePartAtPosition(currentLine, position.column)
    switch (sentencePart) {
      case SentencePart.Command: {
        suggestions = getCommandSuggestion(model, position)
        break
      }
      case SentencePart.Content: {
        suggestions = await getContentSuggestion(model, position)
        break
      }
      case SentencePart.Argument: {
        suggestions = getArgumentSuggestion(model, position)
        break
      }
      case SentencePart.Comment: {
        break
      }
      default: {
        break
      }
    }

    return { suggestions }
  },
})

// #region 配置 WebGAL 脚本语法高亮

// #region 准备工作

// 匹配到注释符号
const commentRule: ([RegExp, string, string] | [RegExp, string])[] = [
  [/\\;$/, 'string.escape', '@root'],
  [/\\;/, 'string.escape'],
  [/;$/, 'line.comment.webgal', '@root'],
  [/;/, 'line.comment.webgal', '@comment'],
]

// 匹配到参数符号
const argumentKeyRule: ([RegExp, string, string] | [RegExp, string])[] = [
  [/ -$/, 'split.common.webgal', '@root'],
  [/ -/, 'split.common.webgal', '@argumentKey'],
]

// 提取命令字符串列表
const commandStringList = SCRIPT_CONFIG.map(item => item.scriptString)

// 部分命令内容的特殊高亮规则
const commandNextRuleMap = new Map<commandType, string>([
  [commandType.say, '@afterCharacter'],
  [commandType.intro, '@afterIntro'],
  [commandType.choose, '@afterChoose'],
  [commandType.setVar, '@afterSetVar'],
  [commandType.setTransform, '@afterSetTransform'],
  [commandType.setTempAnimation, '@afterSetTempAnimation'],
  [commandType.applyStyle, '@afterApplyStyle'],
])

// 形如 commandType: 或 commandType; 的命令匹配规则
const commandRuleList: [RegExp | string, string, string][] = SCRIPT_CONFIG.map((config) => {
  const pattern = new RegExp(`^${config.scriptString}(?=:|;)`)
  // 寻找特定命令的内容高亮规则, 否则回退到默认规则
  const nextRule = commandNextRuleMap.get(config.scriptType) || '@afterCommand'
  return [pattern, 'command.common.webgal', nextRule]
})

// #endregion

monaco.languages.setMonarchTokensProvider('webgalscript', {
  commands: commandStringList,
  tokenizer: {
    root: [
      ...commandRuleList,

      // 匹配整行, 其中如果匹配到命令字符串则标记为命令, 否则进入 say 状态重新解析
      [/^.+$/, {
        cases: {
          '@commands': { token: 'command.common.webgal' },
          '@default': { token: '@rematch', next: '@say' },
        },
      }],
    ],
    comment: [
      [/.*$/, 'line.comment.webgal', '@root'],
    ],
    // #region say
    say: [
      // 匹配行首到冒号前的内容(其中不能包括未转义的英文分号), 认为是角色名
      [/^(\\;|[^;])*?(?=:)/, 'character.say.webgal', '@afterCharacter'],
      // 否则认为此句是无角色名的说话内容, 直接进入 sayContent 状态
      [/./, '@rematch', '@sayContent'],
    ],
    afterCharacter: [
      [/:$/, 'split.common.webgal', '@root'],
      [/:/, 'split.common.webgal', '@sayContent'],
    ],
    sayContent: [
      ...commentRule,
      ...argumentKeyRule,
      [/\{$/, '', '@root'],
      [/\{/, '', '@sayContentVariable'],
      [/\[$/, '', '@root'],
      [/\[/, '', '@sayContentEnhanceString'],
      [/\\\|$/, 'string.escape', '@root'],
      [/\\\|/, 'string.escape'],
      [/\|$/, 'split.common.webgal', '@root'],
      [/\|/, 'split.common.webgal'],
      [/.$/, 'content.say.webgal', '@root'],
      [/./, 'content.say.webgal'],
    ],
    sayContentVariable: [
      ...commentRule,
      ...argumentKeyRule,
      [/\}$/, '', '@root'],
      [/\}/, '', '@pop'],
      [/.$/, 'name.variable.webgal', '@root'],
      [/./, 'name.variable.webgal'],
    ],
    sayContentEnhanceString: [
      ...commentRule,
      ...argumentKeyRule,
      [/\]\($/, '', '@root'],
      [/\]\(/, '', '@sayContentEnhanceAttribute'],
      [/\]/, '', '@sayContent'],
      [/.$/, 'string.enhance.say.webgal', '@root'],
      [/./, 'string.enhance.say.webgal'],
    ],
    sayContentEnhanceAttribute: [
      ...commentRule,
      ...argumentKeyRule,
      [/\)$/, '', '@root'],
      [/\)/, '', '@sayContent'],
      [/(style|style-alltext|ruby|tips)(=)$/, [
        { token: 'key.enhance.say.webgal' },
        { token: 'split.enhance.say.webgal', next: '@root' },
      ]],
      [/(style|style-alltext|ruby|tips)(=)/, [
        { token: 'key.enhance.say.webgal' },
        { token: 'split.enhance.say.webgal', next: '@sayContentEnhanceValue' },
      ]],
      [/./, '@rematch', '@sayContentEnhanceValue'],
    ],
    sayContentEnhanceValue: [
      ...commentRule,
      ...argumentKeyRule,
      [/\)$/, '', '@root'],
      [/\)/, '', '@sayContent'],
      [/ $/, '', '@root'],
      [/ /, '', '@sayContentEnhanceAttribute'],
      [/.$/, 'value.enhance.say.webgal', '@root'],
      [/./, 'value.enhance.say.webgal'],
    ],
    // #endregion
    // #region intro
    afterIntro: [
      ...commentRule,
      [/:$/, 'split.common.webgal', '@root'],
      [/:/, 'split.common.webgal', '@introContent'],
    ],
    introContent: [
      ...commentRule,
      ...argumentKeyRule,
      [/\\\|$/, 'string.escape', '@root'],
      [/\\\|/, 'string.escape'],
      [/\|$/, 'split.common.webgal', '@root'],
      [/\|/, 'split.common.webgal'],
    ],
    // #endregion
    // #region choose
    afterChoose: [
      ...commentRule,
      [/:$/, 'split.common.webgal', '@root'],
      [/:/, 'split.common.webgal', '@chooseContent'],
    ],
    chooseContent: [
      ...commentRule,
      ...argumentKeyRule,
      [/[^|:]*?->/, '@rematch', '@chooseCondition'],
      [/./, '@rematch', '@chooseString'],
    ],
    chooseCondition: [
      ...commentRule,
      ...argumentKeyRule,
      [/->$/, 'split.choose.webgal', '@root'],
      [/->/, 'split.choose.webgal', '@chooseString'],
      [/\($/, '', '@root'],
      [/\(/, '', '@chooseShowCondition'],
      [/\[$/, '', '@root'],
      [/\[/, '', '@chooseEnableCondition'],
      [/.$/, 'invalid', '@root'],
      [/./, 'invalid'],
    ],
    chooseShowCondition: [
      ...commentRule,
      ...argumentKeyRule,
      [/->$/, 'split.choose.webgal', '@root'],
      [/->/, 'split.choose.webgal', '@chooseString'],
      [/\)$/, '', '@root'],
      [/\)/, '', '@chooseCondition'],
      [/.$/, 'show.choose.webgal', '@root'],
      [/./, 'show.choose.webgal'],
    ],
    chooseEnableCondition: [
      ...commentRule,
      ...argumentKeyRule,
      [/->$/, 'split.choose.webgal', '@root'],
      [/->/, 'split.choose.webgal', '@chooseString'],
      [/\]$/, '', '@root'],
      [/\]/, '', '@chooseCondition'],
      [/.$/, 'enable.choose.webgal', '@root'],
      [/./, 'enable.choose.webgal'],
    ],
    chooseString: [
      ...commentRule,
      ...argumentKeyRule,
      [/\\:$/, 'string.escape', '@root'],
      [/\\:/, 'string.escape'],
      [/:$/, 'split.choose.webgal', '@root'],
      [/:/, 'split.choose.webgal', '@chooseDestination'],
      [/\\\|$/, 'string.escape', '@root'],
      [/\\\|/, 'string.escape'],
      [/\|$/, 'split.common.webgal', '@root'],
      [/\|/, 'split.common.webgal', '@chooseContent'],
      [/.$/, 'string.choose.webgal', '@root'],
      [/./, 'string.choose.webgal'],
    ],
    chooseDestination: [
      ...commentRule,
      ...argumentKeyRule,
      [/\\\|$/, 'string.escape', '@root'],
      [/\\\|/, 'string.escape'],
      [/\|$/, 'split.common.webgal', '@root'],
      [/\|/, 'split.common.webgal', '@chooseContent'],
      [/.$/, 'default', '@root'],
      [/./, 'default'],
    ],
    // #endregion
    // #region setVar
    afterSetVar: [
      ...commentRule,
      [/:$/, 'split.common.webgal', '@root'],
      [/:/, 'split.common.webgal', '@setVarContent'],
    ],
    setVarContent: [
      ...commentRule,
      ...argumentKeyRule,
      [/=$/, 'split.variable.webgal', '@root'],
      [/=/, 'split.variable.webgal', '@setVarExpression'],
      [/.$/, 'name.variable.webgal', '@root'],
      [/./, 'name.variable.webgal'],
    ],
    setVarExpression: [
      ...commentRule,
      ...argumentKeyRule,
      [/.$/, 'expression.variable.webgal', '@root'],
      [/./, 'expression.variable.webgal'],
    ],
    // #endregion
    // #region applyStyle
    afterApplyStyle: [
      ...commentRule,
      [/:$/, 'split.common.webgal', '@root'],
      [/:/, 'split.common.webgal', '@applyStyleContent'],
    ],
    applyStyleContent: [
      ...commentRule,
      ...argumentKeyRule,
      [/->$/, 'split.applyStyle.webgal', '@root'],
      [/->/, 'split.applyStyle.webgal', '@applyStyleTarget'],
      [/.$/, 'source.applyStyle.webgal', '@root'],
      [/./, 'source.applyStyle.webgal'],
    ],
    applyStyleTarget: [
      ...commentRule,
      ...argumentKeyRule,
      [/,$/, 'split.applyStyle.webgal', '@root'],
      [/,/, 'split.applyStyle.webgal', '@applyStyleContent'],
      [/.$/, 'target.applyStyle.webgal', '@root'],
      [/./, 'target.applyStyle.webgal'],
    ],
    // #endregion
    // #region setTransform and setTempAnimation
    afterSetTransform: [
      ...commentRule,
      [/:$/, 'split.common.webgal', '@root'],
      [/:/, 'split.common.webgal', '@jsonPart'],
    ],
    afterSetTempAnimation: [
      ...commentRule,
      [/:$/, 'split.common.webgal', '@root'],
      [/:/, 'split.common.webgal', '@jsonPart'],
    ],
    // #endregion
    // #region 命令内容默认规则
    afterCommand: [
      ...commentRule,
      [/:$/, 'split.common.webgal', '@root'],
      [/:/, 'split.common.webgal', '@commandContent'],
    ],
    commandContent: [
      ...commentRule,
      ...argumentKeyRule,
      [/.$/, 'default', '@root'],
      [/./, 'default'],
    ],
    // #endregion
    // #region 参数
    argumentKey: [
      ...commentRule,
      ...argumentKeyRule,
      [/(transform|blink|focus)(=)$/, [
        { token: 'key.argument.common.webgal' },
        { token: 'split.common.webgal', next: '@root' },
      ]],
      [/(transform|blink|focus)(=)/, [
        { token: 'key.argument.common.webgal' },
        { token: 'split.common.webgal', next: '@jsonPart' },
      ]],
      [/=$/, 'split.common.webgal', '@root'],
      [/=/, 'split.common.webgal', '@argumentValue'],
      [/.$/, 'key.argument.common.webgal', '@root'],
      [/./, 'key.argument.common.webgal'],
    ],
    argumentValue: [
      ...commentRule,
      ...argumentKeyRule,
      [/\{$/, '', '@root'],
      [/\{/, '', '@argumentValueVariable'],
      [/.$/, 'value.argument.common.webgal', '@root'],
      [/./, 'value.argument.common.webgal'],
    ],
    argumentValueVariable: [
      ...commentRule,
      ...argumentKeyRule,
      [/\}$/, '', '@root'],
      [/\}/, '', '@argumentValue'],
      [/.$/, 'name.variable.webgal', '@root'],
      [/./, 'name.variable.webgal'],
    ],
    // #endregion
    // #region 其他
    jsonPart: [
      ...commentRule,
      ...argumentKeyRule,
      // 匹配属性键
      [/(\{|,\s*)("[A-Za-z_][0-9A-Za-z_]*")(\s*:)/, ['split.json.webgal', 'key.json.webgal', 'split.json.webgal']],

      // 匹配到字符串
      [/"[^"]*"\s*(?=,$)/, 'value.json.webgal', '@root'],
      [/"[^"]*"\s*(?=,|\})/, 'value.json.webgal'],

      // 匹配数字
      [/[-+]?\d*\.?\d+([eE][-+]?\d+)?$/, 'value.json.webgal', '@root'],
      [/[-+]?\d*\.?\d+([eE][-+]?\d+)?/, 'value.json.webgal'],
      [/[-+]?\d+$/, 'value.json.webgal', '@root'],
      [/[-+]?\d+/, 'value.json.webgal'],

      // 匹配布尔值和 Null
      [/\b(true|false|null)\b$/, 'value.json.webgal', '@root'],
      [/\b(true|false|null)\b/, 'value.json.webgal'],

      [/\}\s*(,)\s*(?=\{)/, 'split.json.webgal'],

      [/.$/, 'invalid', '@root'],
      [/./, 'invalid'],
    ],
    // #endregion
  },
})

// #endregion

/**
 * 检查光标是否在注释内
 * @param line 当前行内容
 * @param column 光标列位置
 * @returns 是否在注释内
 */
function isInComment(line: string, column: number): boolean {
  const beforeCursor = line.slice(0, column - 1)
  // 查找最后一个未转义的分号
  let lastCommentIndex = -1
  for (let i = beforeCursor.length - 1; i >= 0; i--) {
    if (beforeCursor[i] === ';') {
      // 检查是否转义
      let escapeCount = 0
      for (let j = i - 1; j >= 0 && beforeCursor[j] === '\\'; j--) {
        escapeCount++
      }
      // 如果转义符数量是偶数，则分号未转义
      if (escapeCount % 2 === 0) {
        lastCommentIndex = i
        break
      }
    }
  }
  return lastCommentIndex !== -1
}

/**
 * 根据光标位置计算所在句子部分
 * @param line 当前行内容
 * @param column 光标列位置
 * @returns 句子部分类型
 */
function getSentencePartAtPosition(line: string, column: number): SentencePart {
  const beforeCursor = line.slice(0, column - 1)

  // 优先检查注释（注释优先级最高）
  if (isInComment(line, column)) {
    return SentencePart.Comment
  }

  // 查找最靠近光标的 ' -' 和 ':' 位置
  const argIndex = beforeCursor.lastIndexOf(' -')
  const colonIndex = beforeCursor.lastIndexOf(':')

  if (argIndex !== -1) {
    return SentencePart.Argument
  }
  if (colonIndex !== -1) {
    return SentencePart.Content
  }
  return SentencePart.Command
}

/**
 * 获取命令补全
 * @param model Monaco 编辑器模型
 * @param position 光标位置
 * @returns 补全建议列表
 */
function getCommandSuggestion(model: monaco.editor.ITextModel, position: monaco.Position): monaco.languages.CompletionItem[] {
  const currentWord = model.getWordAtPosition(position)
  if (!currentWord) {
    return getCommandCompletions({
      startLineNumber: position.lineNumber,
      endLineNumber: position.lineNumber,
      startColumn: position.column,
      endColumn: position.column,
    })
  }

  const charAfterWord = model.getValueInRange({
    startLineNumber: position.lineNumber,
    endLineNumber: position.lineNumber,
    startColumn: currentWord.endColumn,
    endColumn: currentWord.endColumn + 1,
  })
  const isColonAfterWord = charAfterWord === ':'
  return getCommandCompletions({
    startLineNumber: position.lineNumber,
    endLineNumber: position.lineNumber,
    startColumn: currentWord.startColumn,
    endColumn: currentWord.endColumn + (isColonAfterWord ? 1 : 0),
  })
}

/**
 * 获取参数补全
 * 目前只实现了键补全，值补全功能待实现
 * @param model Monaco 编辑器模型
 * @param position 光标位置
 * @returns 补全建议列表
 */
function getArgumentSuggestion(model: monaco.editor.ITextModel, position: monaco.Position): monaco.languages.CompletionItem[] {
  const currentLine = model.getLineContent(position.lineNumber)
  const currentWord = model.getWordAtPosition(position)

  // 从行内容中提取命令类型
  let command: commandType = commandType.say
  try {
    const parsedScene = WebgalParser.parse(currentLine, TEMP_SCENE_NAME, TEMP_SCENE_URL)
    command = parsedScene.sentenceList[0]?.command || commandType.say
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error(`解析命令失败: ${errorMessage}`)
  }

  if (!currentWord) {
    return getArgKeyCompletions(
      {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: position.column,
        endColumn: position.column,
      },
      command,
    )
  }

  const charAfterWord = model.getValueInRange({
    startLineNumber: position.lineNumber,
    endLineNumber: position.lineNumber,
    startColumn: currentWord.endColumn,
    endColumn: currentWord.endColumn + 1,
  })
  const isEqualSignAfterWord = charAfterWord === '='
  return getArgKeyCompletions(
    {
      startLineNumber: position.lineNumber,
      endLineNumber: position.lineNumber,
      startColumn: currentWord.startColumn,
      endColumn: currentWord.endColumn + (isEqualSignAfterWord ? 1 : 0),
    },
    command,
  )
}

/**
 * 获取内容补全
 * @param model Monaco 编辑器模型
 * @param position 光标位置
 * @returns 补全建议列表
 */
async function getContentSuggestion(model: monaco.editor.ITextModel, position: monaco.Position): Promise<monaco.languages.CompletionItem[]> {
  const parsedScene = getParsedSceneFromLine(model, position)
  const command = parsedScene.sentenceList[0]?.command || commandType.say
  const content = parsedScene.sentenceList[0]?.content || ''

  switch (command) {
    case commandType.say: {
      // say 命令不需要文件补全
      return []
    }
    case commandType.changeBg:
    case commandType.changeFigure:
    case commandType.bgm:
    case commandType.video:
    case commandType.changeScene:
    case commandType.callScene:
    case commandType.playEffect:
    case commandType.unlockCg:
    case commandType.unlockBgm: {
      // 使用映射表获取文件类型
      const fileType = COMMAND_TO_FILE_TYPE_MAP[command]
      if (!fileType) {
        logger.debug(`[editor][completion] 未实现的文件补全命令类型: "${String(command)}"`)
        return []
      }
      return await getFileSuggestion(model, position, fileType, content)
    }
    case commandType.choose: {
      // 找到最后一个冒号到光标位置的内容作为路径, 然后提供场景文件补全
      // 该冒号不能为第一个冒号
      const currentLineBeforeCursor = model.getLineContent(position.lineNumber).slice(0, position.column - 1)
      const lastColonIndex = currentLineBeforeCursor.lastIndexOf(':')
      const colonCount = currentLineBeforeCursor.split(':').length - 1
      if (lastColonIndex !== -1 && colonCount >= 2) {
        return await getFileSuggestion(model, position, 'scene', currentLineBeforeCursor.slice(lastColonIndex + 1))
      }
      return []
    }
    default: {
      return []
    }
  }
}

/**
 * 从当前行解析出场景对象
 * @param model Monaco 编辑器模型
 * @param position 光标位置
 * @returns 解析后的场景对象，如果解析失败则返回空场景
 */
function getParsedSceneFromLine(model: monaco.editor.ITextModel, position: monaco.Position): IScene {
  const line = model.getLineContent(position.lineNumber)
  const lineBeforeCursor = line.slice(0, position.column - 1)

  try {
    return WebgalParser.parse(lineBeforeCursor, TEMP_SCENE_NAME, TEMP_SCENE_URL)
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error(`解析场景失败: ${errorMessage}`)
    // 解析失败时返回空场景
    return WebgalParser.parse('', TEMP_SCENE_NAME, TEMP_SCENE_URL)
  }
}

/**
 * 计算补全项的替换范围
 * @param currentLine 当前行内容
 * @param position 光标位置
 * @param currentWord 当前单词
 * @param isDirectory 是否为目录
 * @returns 替换范围
 */
function calculateCompletionRange(
  currentLine: string,
  position: monaco.Position,
  currentWord: monaco.editor.IWordAtPosition | null,
  isDirectory: boolean,
): monaco.IRange {
  const currentLineBeforeCursor = currentLine.slice(0, position.column - 1)
  const lastSlashIndex = currentLineBeforeCursor.lastIndexOf('/')

  // 计算内容结束列（行尾、注释前、参数前的最小值）
  let contentEndColumn = currentLine.length + 1
  const argIndex = currentLine.indexOf(' -')
  if (argIndex !== -1) {
    contentEndColumn = Math.min(contentEndColumn, argIndex + 1)
  }
  const commentIndex = currentLine.indexOf(';')
  if (commentIndex !== -1) {
    contentEndColumn = Math.min(contentEndColumn, commentIndex + 1)
  }

  // 目录的结束列需要特殊处理
  let dirEndColumn = contentEndColumn
  const restLine = currentLine.slice(position.column - 1)
  const slashIndexInRest = restLine.indexOf('/')
  if (slashIndexInRest !== -1) {
    dirEndColumn = Math.min(dirEndColumn, position.column + slashIndexInRest)
  }

  const startColumn = lastSlashIndex === -1
    ? (currentWord?.startColumn || position.column)
    : lastSlashIndex + 2

  return {
    startLineNumber: position.lineNumber,
    endLineNumber: position.lineNumber,
    startColumn,
    endColumn: isDirectory ? dirEndColumn : contentEndColumn,
  }
}

/**
 * 从缓存获取或读取目录内容
 * @param path 目录路径
 * @returns 目录条目列表
 */
async function getDirectoryEntries(path: string): Promise<{ name: string, isDirectory: boolean }[]> {
  const now = Date.now()
  const cached = fileSystemCache.get(path)

  // 检查缓存是否有效
  if (cached && (now - cached.timestamp) < FILE_CACHE_TTL) {
    return cached.entries
  }

  try {
    const dirInfo = await readDir(path)
    const entries = dirInfo.map(entry => ({
      name: entry.name,
      isDirectory: entry.isDirectory,
    }))

    fileSystemCache.set(path, {
      entries,
      timestamp: now,
    })

    return entries
  } catch (error) {
    fileSystemCache.delete(path)
    throw error
  }
}

/**
 * 获取文件路径补全
 * @param model Monaco 编辑器模型
 * @param position 光标位置
 * @param type 文件类型
 * @param currentPath 当前路径
 * @returns 补全建议列表
 */
async function getFileSuggestion(
  model: monaco.editor.ITextModel,
  position: monaco.Position,
  type: FileType,
  currentPath: string,
): Promise<monaco.languages.CompletionItem[]> {
  const currentLine = model.getLineContent(position.lineNumber)
  const currentWord = model.getWordAtPosition(position)
  const path = await getPathFromFileType(type, currentPath)

  if (!path) {
    return []
  }

  try {
    const entries = await getDirectoryEntries(path)
    return entries.map(entry => ({
      label: entry.name,
      insertText: entry.name,
      kind: entry.isDirectory
        ? monaco.languages.CompletionItemKind.Folder
        : monaco.languages.CompletionItemKind.File,
      range: calculateCompletionRange(currentLine, position, currentWord, entry.isDirectory),
    }))
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error(`读取目录失败: ${path} - ${errorMessage}`)
    return []
  }
}

/**
 * 根据文件类型和文件名获取完整路径
 * @param type 文件类型
 * @param fileName 文件名（可能包含子目录）
 * @returns 完整路径，如果游戏目录不存在则返回空字符串
 */
async function getPathFromFileType(
  type: FileType,
  fileName: string,
): Promise<string> {
  const gameDir = useWorkspaceStore().currentGame?.path
  if (!gameDir) {
    return ''
  }

  // 提取最后一级目录作为子目录
  let subDir = ''
  const lastDirIndex = fileName.lastIndexOf('/')
  if (lastDirIndex !== -1) {
    subDir = fileName.slice(0, lastDirIndex + 1)
  }

  const basePath = await gameAssetDir(gameDir, type)
  if (subDir) {
    // 移除 subDir 开头的斜杠（如果有）
    const normalizedSubDir = subDir.startsWith('/') ? subDir.slice(1) : subDir
    return await join(basePath, normalizedSubDir)
  }
  return basePath
}
