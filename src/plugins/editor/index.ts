import * as monaco from 'monaco-editor'
import { SCRIPT_CONFIG } from 'webgal-parser/src/config/scriptConfig'
import { commandType } from 'webgal-parser/src/interface/sceneInterface'

import { parseSceneOrEmpty } from '~/domain/script/parser'
import { getCommandConfig } from '~/features/editor/command-registry'
import { editorDynamicOptionSources } from '~/features/editor/command-registry/dynamic-options'
import { readContentField } from '~/features/editor/command-registry/schema'
import { buildSceneAutocompleteOptionsFromText } from '~/features/editor/statement-editor/scene-autocomplete'
import { resolveWebgalArgumentCompletionTarget } from '~/features/editor/text-editor/webgal-completion-context'
import { i18n } from '~/plugins/i18n'
import { useResourceIndex } from '~/services/resource-index/service'
import { useWorkspaceStore } from '~/stores/workspace'

import { getArgKeyCompletions } from './completion/webgal-argument-keys'
import { getCommandCompletions } from './completion/webgal-commands'
import { extendWebgalValueCompletionRange, getWebgalValueCompletions } from './completion/webgal-values'
import darkTheme from './themes/webgal-dark.json'
import lightTheme from './themes/webgal-light.json'

import type { IScene } from 'webgal-parser/src/interface/sceneInterface'
import type { DynamicOptionsContext, EditorDynamicOptionsKey } from '~/features/editor/command-registry/schema'

import './monaco'

// 常量定义
const TEMP_SCENE_NAME = 'tempScene'
const TEMP_SCENE_URL = 'tempUrl'

// WebGAL 脚本句子部分枚举
enum SentencePart {
  Command, // 命令
  Content, // 内容
  Argument, // 参数
  Comment, // 注释
}

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
  fixedOverflowWidgets: true,
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
  triggerCharacters: [':', '-', '=', '/'],
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
        suggestions = await getArgumentSuggestion(model, position)
        break
      }
      // no default
    }

    return { suggestions }
  },
})

// #region 配置 WebGAL 脚本语法高亮

// #region 准备工作

/**
 * 构建行尾匹配规则, 例如
 * [/./, token, nextState] 变为
 * [[/.$/, token, '@root'], [/./, token, nextState]]
 */
function buildEolRule(regExp: RegExp, token: string, nextState?: string): [
  [RegExp, string, string],
  [RegExp, string, string] | [RegExp, string],
] {
  const regExpWithEol = new RegExp(`${regExp.source}$`)

  const rule: [RegExp, string, string] | [RegExp, string] = nextState
    ? [regExp, token, nextState]
    : [regExp, token]

  return [[regExpWithEol, token, '@root'], rule]
}

type MonarchMatchGroup = {
  token: string
} | {
  token: string
  next: string
}

/**
 * 构建行尾匹配规则, 是 buildEolRule 的组匹配形式, 例如
 * [/./, [{ token }]] 变为
 * [[/.$/, [{ token, next: '@root' }]], [/./, [{ token }]]]
 */
function buildEolGroupRule(regExp: RegExp, matchArray: MonarchMatchGroup[]): [
  [RegExp, MonarchMatchGroup[]],
  [RegExp, MonarchMatchGroup[]],
] {
  const regExpWithEol = new RegExp(`${regExp.source}$`)

  const matchArrayWithEol: MonarchMatchGroup[] = matchArray.map((match, index) => {
    if (index === matchArray.length - 1) {
      return { token: match.token, next: '@root' }
    }
    return 'next' in match
      ? { token: match.token, next: match.next }
      : { token: match.token }
  })

  return [[regExpWithEol, matchArrayWithEol], [regExp, matchArray]]
}

// 匹配到注释符号
const commentRule: ([RegExp, string, string] | [RegExp, string])[] = [
  ...buildEolRule(/\\;/, 'string.escape'),
  ...buildEolRule(/;/, 'line.comment.webgal', '@comment'),
]

// 匹配到参数符号
const argumentKeyRule: ([RegExp, string, string] | [RegExp, string])[] = [
  ...buildEolRule(/ -/, 'split.common.webgal', '@argumentKey'),
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

// 构建匹配完 commandType 后的规则
function buildAfterCommandRule(nextState: string) {
  return [
    ...commentRule,
    ...buildEolRule(/:/, 'split.common.webgal', nextState),
  ]
}

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
      [/^(\\;|[^;])*?(?=:)/, '@rematch', '@character'],
      // 否则认为此句是无角色名的说话内容, 直接进入 sayContent 状态
      [/./, '@rematch', '@sayContent'],
    ],
    character: [
      ...commentRule,
      ...buildEolRule(/:/, 'split.common.webgal', '@sayContent'),
      ...buildEolRule(/\{/, '', '@characterVariableInterpolation'),
      ...buildEolRule(/./, 'character.say.webgal'),
    ],
    // 角色名中的变量插值比较特殊,不能直接套用 variableInterpolation
    characterVariableInterpolation: [
      ...commentRule,
      ...buildEolRule(/:/, 'split.common.webgal', '@sayContent'),
      ...buildEolRule(/\}/, '', '@pop'),
      ...buildEolRule(/./, 'name.variable.webgal'),
    ],
    afterCharacter: buildAfterCommandRule('@sayContent'),
    sayContent: [
      ...commentRule,
      ...argumentKeyRule,
      ...buildEolRule(/\{/, '', '@variableInterpolation'),
      ...buildEolRule(/\[/, '', '@sayContentEnhanceString'),
      ...buildEolRule(/\\\|/, 'string.escape'),
      ...buildEolRule(/\|/, 'split.common.webgal'),
      ...buildEolRule(/./, 'content.say.webgal'),
    ],
    sayContentEnhanceString: [
      ...commentRule,
      ...argumentKeyRule,
      ...buildEolRule(/\]\(/, '', '@sayContentEnhanceAttribute'),
      ...buildEolRule(/\]/, '', '@sayContent'),
      ...buildEolRule(/./, 'string.enhance.say.webgal'),
    ],
    sayContentEnhanceAttribute: [
      ...commentRule,
      ...argumentKeyRule,
      ...buildEolRule(/\)/, '', '@sayContent'),
      ...buildEolGroupRule(/(style|style-alltext|ruby|tips)(=)/, [
        { token: 'key.enhance.say.webgal' },
        { token: 'split.enhance.say.webgal', next: '@sayContentEnhanceValue' },
      ]),
      [/./, '@rematch', '@sayContentEnhanceValue'],
    ],
    sayContentEnhanceValue: [
      ...commentRule,
      ...argumentKeyRule,
      ...buildEolRule(/\)/, '', '@sayContent'),
      ...buildEolRule(/ /, '', '@sayContentEnhanceAttribute'),
      ...buildEolRule(/./, 'value.enhance.say.webgal'),
    ],
    // #endregion
    // #region intro
    afterIntro: buildAfterCommandRule('@introContent'),
    introContent: [
      ...commentRule,
      ...argumentKeyRule,
      ...buildEolRule(/\\\|/, 'string.escape'),
      ...buildEolRule(/\|/, 'split.common.webgal'),
      ...buildEolRule(/./, 'default'),
    ],
    // #endregion
    // #region choose
    afterChoose: buildAfterCommandRule('@chooseContent'),
    chooseContent: [
      ...commentRule,
      ...argumentKeyRule,
      [/[^|:]*?->/, '@rematch', '@chooseCondition'],
      [/./, '@rematch', '@chooseString'],
    ],
    chooseCondition: [
      ...commentRule,
      ...argumentKeyRule,
      ...buildEolRule(/->/, 'split.choose.webgal', '@chooseString'),
      ...buildEolRule(/\)/, '', '@chooseShowCondition'),
      ...buildEolRule(/\(/, '', '@chooseShowCondition'),
      ...buildEolRule(/\[/, '', '@chooseEnableCondition'),
      ...buildEolRule(/./, 'invalid'),
    ],
    chooseShowCondition: [
      ...commentRule,
      ...argumentKeyRule,
      ...buildEolRule(/->/, 'split.choose.webgal', '@chooseString'),
      ...buildEolRule(/\)/, '', '@chooseCondition'),
      ...buildEolRule(/./, 'show.choose.webgal'),
    ],
    chooseEnableCondition: [
      ...commentRule,
      ...argumentKeyRule,
      ...buildEolRule(/->/, 'split.choose.webgal', '@chooseString'),
      ...buildEolRule(/\]/, '', '@chooseCondition'),
      ...buildEolRule(/./, 'enable.choose.webgal'),
    ],
    chooseString: [
      ...commentRule,
      ...argumentKeyRule,
      ...buildEolRule(/\\:/, 'string.escape'),
      ...buildEolRule(/:/, 'split.choose.webgal', '@chooseDestination'),
      ...buildEolRule(/\\\|/, 'string.escape'),
      ...buildEolRule(/\|/, 'split.common.webgal', '@chooseContent'),
      ...buildEolRule(/./, 'string.choose.webgal'),
    ],
    chooseDestination: [
      ...commentRule,
      ...argumentKeyRule,
      ...buildEolRule(/\\\|/, 'string.escape'),
      ...buildEolRule(/\|/, 'split.common.webgal', '@chooseContent'),
      ...buildEolRule(/./, 'default'),
    ],
    // #endregion
    // #region setVar
    afterSetVar: buildAfterCommandRule('@setVarContent'),
    setVarContent: [
      ...commentRule,
      ...argumentKeyRule,
      ...buildEolRule(/=/, 'split.variable.webgal', '@setVarExpression'),
      ...buildEolRule(/./, 'name.variable.webgal'),
    ],
    setVarExpression: [
      ...commentRule,
      ...argumentKeyRule,
      ...buildEolRule(/./, 'expression.variable.webgal'),
    ],
    // #endregion
    // #region applyStyle
    afterApplyStyle: buildAfterCommandRule('@applyStyleContent'),
    applyStyleContent: [
      ...commentRule,
      ...argumentKeyRule,
      ...buildEolRule(/->/, 'split.applyStyle.webgal', '@applyStyleTarget'),
      ...buildEolRule(/./, 'source.applyStyle.webgal'),
    ],
    applyStyleTarget: [
      ...commentRule,
      ...argumentKeyRule,
      ...buildEolRule(/,/, 'split.applyStyle.webgal', '@applyStyleContent'),
      ...buildEolRule(/./, 'target.applyStyle.webgal'),
    ],
    // #endregion
    // #region setTransform and setTempAnimation
    afterSetTransform: buildAfterCommandRule('@jsonPart'),
    afterSetTempAnimation: buildAfterCommandRule('@jsonPart'),
    // #endregion
    // #region 命令内容默认规则
    afterCommand: buildAfterCommandRule('@commandContent'),
    commandContent: [
      ...commentRule,
      ...argumentKeyRule,
      ...buildEolRule(/./, 'default'),
    ],
    // #endregion
    // #region 参数
    argumentKey: [
      ...commentRule,
      ...argumentKeyRule,
      ...buildEolGroupRule(/(transform|blink|focus)(=)/, [
        { token: 'key.argument.common.webgal' },
        { token: 'split.common.webgal', next: '@jsonPart' },
      ]),
      ...buildEolRule(/=/, 'split.common.webgal', '@argumentValue'),
      ...buildEolRule(/./, 'key.argument.common.webgal'),
    ],
    argumentValue: [
      ...commentRule,
      ...argumentKeyRule,
      ...buildEolRule(/\{/, '', '@variableInterpolation'),
      ...buildEolRule(/./, 'value.argument.common.webgal'),
    ],
    // #endregion
    // #region 其他
    variableInterpolation: [
      ...commentRule,
      ...argumentKeyRule,
      ...buildEolRule(/\}/, '', '@pop'),
      ...buildEolRule(/./, 'name.variable.webgal'),
    ],
    jsonPart: [
      ...commentRule,
      ...argumentKeyRule,
      // 匹配属性键
      ...buildEolGroupRule(/(\{|,\s*)("[A-Za-z_][0-9A-Za-z_]*")(\s*:)/, [
        { token: 'split.json.webgal' },
        { token: 'key.json.webgal' },
        { token: 'split.json.webgal' },
      ]),

      // 匹配到字符串
      ...buildEolRule(/"[^"]*"\s*(?=,|\})/, 'value.json.webgal'),

      // 匹配数字
      ...buildEolRule(/[-+]?\d*\.?\d+([eE][-+]?\d+)?/, 'value.json.webgal'),
      ...buildEolRule(/[-+]?\d+/, 'value.json.webgal'),

      // 匹配布尔值和 Null
      ...buildEolRule(/\b(true|false|null)\b/, 'value.json.webgal'),

      // 分隔符
      ...buildEolRule(/}\s*(,)\s*(?=\{)/, 'split.json.webgal'),

      // 非法内容
      ...buildEolRule(/./, 'invalid'),
    ],
    // #endregion
  },
})

// #endregion

/**
 * 检查光标是否在注释内
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

async function getArgumentSuggestion(model: monaco.editor.ITextModel, position: monaco.Position): Promise<monaco.languages.CompletionItem[]> {
  const currentLine = model.getLineContent(position.lineNumber)

  const parsedScene = parseSceneOrEmpty(currentLine, TEMP_SCENE_NAME, TEMP_SCENE_URL)
  const sentence = parsedScene.sentenceList[0]
  const command = sentence?.command ?? commandType.say

  const target = resolveWebgalArgumentCompletionTarget(currentLine, position.column - 1)
  if (target.kind === 'value') {
    const range = extendWebgalValueCompletionRange(currentLine, {
      startLineNumber: position.lineNumber,
      endLineNumber: position.lineNumber,
      startColumn: target.startOffset + 1,
      endColumn: position.column,
    }, 'argument')
    return buildValueCompletions(
      model,
      command,
      target.key,
      target.prefix,
      range,
      sentence?.content ?? '',
    )
  }

  if (target.kind === 'none') {
    return []
  }

  return getArgKeyCompletions(
    {
      startLineNumber: position.lineNumber,
      endLineNumber: position.lineNumber,
      startColumn: target.startOffset + 1,
      endColumn: target.endOffset + 1,
    },
    command,
    target.hasLeadingDash,
  )
}

/**
 * 获取内容补全
 */
async function getContentSuggestion(model: monaco.editor.ITextModel, position: monaco.Position): Promise<monaco.languages.CompletionItem[]> {
  const parsedScene = getParsedSceneFromLine(model, position)
  const sentence = parsedScene.sentenceList[0]
  const command = sentence?.command ?? commandType.say
  const content = sentence?.content ?? ''
  const contentField = readContentField(getCommandConfig(command))
  const currentLineBeforeCursor = model.getLineContent(position.lineNumber).slice(0, position.column - 1)
  const colonCount = currentLineBeforeCursor.split(':').length - 1
  if (command === commandType.choose && colonCount < 2) {
    return []
  }
  const valuePrefix = command === commandType.choose
    ? currentLineBeforeCursor.slice(currentLineBeforeCursor.lastIndexOf(':') + 1)
    : content

  if (!contentField || command === commandType.say || command === commandType.comment) {
    return []
  }

  const valueStart = position.column - valuePrefix.length
  const range = extendWebgalValueCompletionRange(model.getLineContent(position.lineNumber), {
    startLineNumber: position.lineNumber,
    endLineNumber: position.lineNumber,
    startColumn: valueStart,
    endColumn: position.column,
  }, command === commandType.choose ? 'choice' : 'content')
  return buildValueCompletions(model, command, 'content', valuePrefix, range, valuePrefix)
}

function getResourceOptions(assetType: string) {
  return useResourceIndex().listByAssetType(assetType)
    .map((entry) => {
      const value = String(entry.key.relativePath)
      return { label: value, value }
    })
    .toSorted((a, b) => a.value.localeCompare(b.value))
}

async function resolveDynamicOptions(key: EditorDynamicOptionsKey, context: DynamicOptionsContext) {
  const source = editorDynamicOptionSources.find(item => item.key === key)
  if (!source) {
    return []
  }
  try {
    return await source.loadOptions(context)
  } catch (error) {
    logger.debug(`文本编辑器动态候选加载失败(${key}): ${String(error)}`)
    return []
  }
}

function buildValueCompletions(
  model: monaco.editor.ITextModel,
  command: commandType,
  key: string,
  prefix: string,
  range: monaco.IRange,
  contentContext: string,
): Promise<monaco.languages.CompletionItem[]> {
  const workspace = useWorkspaceStore()
  const gamePath = workspace.currentGame?.path
  return getWebgalValueCompletions({
    command,
    key,
    prefix,
    range,
    content: contentContext,
    gamePath,
    sceneOptions: buildSceneAutocompleteOptionsFromText(model.getValue()),
    listResources: getResourceOptions,
    resolveDynamicOptions: (dynamicKey, context) => resolveDynamicOptions(dynamicKey, context),
  }, i18n.global.t)
}

/**
 * 从当前行解析出场景对象，解析失败时返回空场景
 */
function getParsedSceneFromLine(model: monaco.editor.ITextModel, position: monaco.Position): IScene {
  const line = model.getLineContent(position.lineNumber)
  const lineBeforeCursor = line.slice(0, position.column - 1)

  return parseSceneOrEmpty(lineBeforeCursor, TEMP_SCENE_NAME, TEMP_SCENE_URL)
}

/**
 * 根据文件扩展名从 Monaco 语言注册表获取语言显示名称
 * 无法识别时回退到扩展名大写
 */
export function getLanguageDisplayName(filePath: string): string {
  const fileName = filePath.split(/[/\\]/).pop() ?? ''
  const lastDot = fileName.lastIndexOf('.')
  if (lastDot <= 0) {
    return ''
  }

  const extension = fileName.slice(lastDot + 1).toLowerCase()
  const monacoLanguage = monaco.languages.getLanguages().find(
    lang => lang.extensions?.includes(`.${extension}`),
  )

  if (!monacoLanguage) {
    return extension.toUpperCase()
  }

  const alias = monacoLanguage.aliases?.find(
    a => a.toLowerCase() === monacoLanguage.id,
  ) ?? monacoLanguage.aliases?.[0]

  return alias
    ? alias[0].toUpperCase() + alias.slice(1)
    : extension.toUpperCase()
}
