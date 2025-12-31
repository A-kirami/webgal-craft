import { join } from '@tauri-apps/api/path'
import { readDir } from '@tauri-apps/plugin-fs'
import { LRUCache } from 'lru-cache'
import * as monaco from 'monaco-editor'
import { wireTmGrammars } from 'monaco-editor-textmate'
import { Registry } from 'monaco-textmate'
import { commandType, IScene } from 'webgal-parser/src/interface/sceneInterface'

import { getArgKeyCompletions } from './completion/webgal-argument-keys'
import { getCommandCompletions } from './completion/webgal-commands'
import webgalTextmate from './grammars/webgal.tmLanguage.json'
import darkTheme from './themes/webgal-dark.json'
import lightTheme from './themes/webgal-light.json'

import './monaco'
import './onigasm'

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

// 配置 WebGAL 脚本语法高亮
export async function configureWebgalSyntaxHighlighting(
  editor: monaco.editor.IStandaloneCodeEditor,
) {
  try {
    const registry = new Registry({
      getGrammarDefinition: async (scopeName) => {
        if (scopeName === 'source.webgal') {
          return {
            format: 'json',
            content: JSON.stringify(webgalTextmate),
          }
        }
        return { format: 'json', content: '' }
      },
    })

    const grammars = new Map([['webgalscript', 'source.webgal']])
    await registry.loadGrammar('source.webgal')
    await wireTmGrammars(monaco, registry, grammars, editor)
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    logger.error(`配置 WebGAL 脚本语法高亮失败: ${errorMessage}`)
    throw error
  }
}

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

  const basePath = await join(gameDir, 'game', type)
  if (subDir) {
    // 移除 subDir 开头的斜杠（如果有）
    const normalizedSubDir = subDir.startsWith('/') ? subDir.slice(1) : subDir
    return await join(basePath, normalizedSubDir)
  }
  return basePath
}
