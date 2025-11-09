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
import { readDir } from '@tauri-apps/plugin-fs'

// WebGAL 脚本句子部分枚举
enum ISentencePart {
  Command, // 命令
  Content, // 内容
  Argument, // 参数
  Comment, // 注释
}

// 文件类型, 以目录区分
type FileType = 'background' | 'figure' | 'scene' | 'bgm' | 'vocal' | 'video'

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
      case ISentencePart.Command: {
        suggestions = getCommandSuggestion(model, position)
        break
      }
      case ISentencePart.Content: {
        suggestions = await getContentSuggestion(model, position)
        break
      }
      case ISentencePart.Argument: {
        suggestions = getArgumentSuggestion(model, position)
        break
      }
      case ISentencePart.Comment: {
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
 * 尝试触发补全（在特定条件下）, 可以频繁调用
 */
export function tryTriggerWebgalScriptCompletion(editor: monaco.editor.IStandaloneCodeEditor | undefined) {
  if (!editor) {
    return
  }
  const model = editor.getModel()
  const position = editor.getPosition()
  if (!model || !position) {
    return
  }

  const currentLine = model.getLineContent(position.lineNumber)
  const currentLineBeforeCursor = currentLine.slice(0, position.column - 1)
  // 如果光标在注释内则不触发补全
  const isComment = currentLineBeforeCursor.match(/(?<!\\);/g)
  if (isComment) {
    return
  }

  // 当光标不在行首, 且光标前没有冒号时, 触发命令补全
  const shouldCompleteCommands = (currentLineBeforeCursor !== '' && !currentLineBeforeCursor.includes(':'))
  // 当光标前有空格和减号时, 触发参数补全
  const shouldCompleteArguments = (currentLineBeforeCursor.endsWith(' -'))
  if (shouldCompleteCommands || shouldCompleteArguments) {
    editor.trigger('keyboard', 'editor.action.triggerSuggest', {})
  }
}

// 根据光标位置计算所在句子部分
function getSentencePartAtPosition(line: string, column: number): ISentencePart {
  const beforeCursor = line.slice(0, column - 1)
  if (/(?<!\\);/g.test(beforeCursor)) {
    return ISentencePart.Comment
  } else if (beforeCursor.includes(' -')) {
    return ISentencePart.Argument
  } else if (beforeCursor.includes(':')) {
    return ISentencePart.Content
  }
  return ISentencePart.Command
}

// 获取命令补全
function getCommandSuggestion(model: monaco.editor.ITextModel, position: monaco.Position): monaco.languages.CompletionItem[] {
  // 匹配到单词首尾, 如果后面有冒号, 则一并包含在替换范围内
  const currentWord = model.getWordAtPosition(position)
  const charAfterWord = model.getValueInRange({
    startLineNumber: position.lineNumber,
    endLineNumber: position.lineNumber,
    startColumn: (currentWord?.endColumn || position.column),
    endColumn: (currentWord?.endColumn || position.column) + 1,
  })
  const isColonAfterWord = charAfterWord === ':'
  return getCommandCompletions({
    startLineNumber: position.lineNumber,
    endLineNumber: position.lineNumber,
    startColumn: currentWord?.startColumn || position.column,
    endColumn: (currentWord?.endColumn || position.column) + (isColonAfterWord ? 1 : 0),
  })
}

// 获取参数补全
// TODO: 目前只实现了键补全
function getArgumentSuggestion(model: monaco.editor.ITextModel, position: monaco.Position): monaco.languages.CompletionItem[] {
  const currentLine = model.getLineContent(position.lineNumber)
  const currentWord = model.getWordAtPosition(position)
  const parsedScene = WebgalParser.parse(currentLine, 'tempScene', 'tempUrl')
  const command = parsedScene.sentenceList[0]?.command || commandType.say
  // 匹配到单词首尾, 如果后面有等号, 则一并包含在替换范围内
  const charAfterWord = model.getValueInRange({
    startLineNumber: position.lineNumber,
    endLineNumber: position.lineNumber,
    startColumn: (currentWord?.endColumn || position.column),
    endColumn: (currentWord?.endColumn || position.column) + 1,
  })
  const isEqualSignAfterWord = charAfterWord === '='
  return getArgKeyCompletions(
    {
      startLineNumber: position.lineNumber,
      endLineNumber: position.lineNumber,
      startColumn: currentWord?.startColumn || position.column,
      endColumn: (currentWord?.endColumn || position.column) + (isEqualSignAfterWord ? 1 : 0),
    },
    command,
  )
}

// 获取内容补全
async function getContentSuggestion(model: monaco.editor.ITextModel, position: monaco.Position): Promise<monaco.languages.CompletionItem[]> {
  const parsedScene = getParsedSceneFromLine(model, position)
  const command = parsedScene.sentenceList[0]?.command || commandType.say
  switch (command) {
    case commandType.say: {
      return []
    }
    case commandType.changeBg: {
      return await getFileSuggestion(model, position, 'background', parsedScene.sentenceList[0].content)
    }
    case commandType.changeFigure: {
      return await getFileSuggestion(model, position, 'figure', parsedScene.sentenceList[0].content)
    }
    case commandType.bgm: {
      return await getFileSuggestion(model, position, 'bgm', parsedScene.sentenceList[0].content)
    }
    case commandType.video: {
      return await getFileSuggestion(model, position, 'video', parsedScene.sentenceList[0].content)
    }
    case commandType.changeScene: {
      return await getFileSuggestion(model, position, 'scene', parsedScene.sentenceList[0].content)
    }
    case commandType.callScene: {
      return await getFileSuggestion(model, position, 'scene', parsedScene.sentenceList[0].content)
    }
    case commandType.playEffect: {
      return await getFileSuggestion(model, position, 'vocal', parsedScene.sentenceList[0].content)
    }
    case commandType.unlockCg: {
      return await getFileSuggestion(model, position, 'background', parsedScene.sentenceList[0].content)
    }
    case commandType.unlockBgm: {
      return await getFileSuggestion(model, position, 'bgm', parsedScene.sentenceList[0].content)
    }
    case commandType.choose: {
      // 找到最后一个冒号到光标位置的内容作为路径, 然后提供场景文件补全
      // 该冒号不能为第一个冒号
      const currentLineBeforeCursor = model.getLineContent(position.lineNumber).slice(0, position.column - 1)
      const lastColonIndex = currentLineBeforeCursor.lastIndexOf(':')
      const colonCount = currentLineBeforeCursor.split(':').length - 1
      return lastColonIndex !== -1 && colonCount >= 2 ? (await getFileSuggestion(model, position, 'scene', currentLineBeforeCursor.slice(lastColonIndex + 1))) : []
    }
    default: {
      return []
    }
  }
}

// 从当前行解析出场景对象
function getParsedSceneFromLine(model: monaco.editor.ITextModel, position: monaco.Position): IScene {
  const line = model.getLineContent(position.lineNumber)
  const lineBeforeCursor = line.slice(0, position.column - 1)
  return WebgalParser.parse(lineBeforeCursor, 'tempScene', 'tempUrl')
}

// 获取文件路径补全
async function getFileSuggestion(
  model: monaco.editor.ITextModel,
  position: monaco.Position,
  type: FileType,
  currentPath: string,
): Promise<monaco.languages.CompletionItem[]> {
  const currentLine = model.getLineContent(position.lineNumber)
  const currentLineBeforeCursor = currentLine.slice(0, position.column - 1)
  const currentWord = model.getWordAtPosition(position)
  const suggestions: monaco.languages.CompletionItem[] = []
  const path = getPathFromFileType(type, currentPath)

  // 如果是文件, 尽可能覆盖到末尾, 如行尾, 注释前, 下一个参数前等
  // 如果是目录, 覆盖到最近的斜杠前, 找不到则尽可能覆盖到末尾
  const lastSlashIndex = currentLineBeforeCursor.lastIndexOf('/')
  let contentEndColumn = currentLine.length + 1
  const argIndex = currentLine.indexOf(' -')
  if (argIndex !== -1) {
    contentEndColumn = Math.min(contentEndColumn, argIndex + 1)
  }
  const commentIndex = currentLine.indexOf(';')
  if (commentIndex !== -1) {
    contentEndColumn = Math.min(contentEndColumn, commentIndex + 1)
  }
  const restLine = currentLine.slice((position.column - 1))
  let dirEndColumn = contentEndColumn
  const slashIndexInRest = restLine.indexOf('/')
  if (slashIndexInRest !== -1) {
    dirEndColumn = Math.min(dirEndColumn, position.column + slashIndexInRest)
  }

  const dirInfo = await readDir(path)
  for (const entry of dirInfo) {
    suggestions.push({
      label: entry.name,
      insertText: entry.name,
      kind: entry.isDirectory
        ? monaco.languages.CompletionItemKind.Folder
        : monaco.languages.CompletionItemKind.File,
      range: {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: lastSlashIndex === -1 ? (currentWord?.startColumn || position.column) : lastSlashIndex + 2,
        endColumn: entry.isDirectory ? dirEndColumn : contentEndColumn,
      },
    })
  }

  return suggestions
}

// 根据文件类型和文件名获取完整路径
function getPathFromFileType(
  type: FileType, fileName: string,
): string {
  const gameDir = useWorkspaceStore().currentGame?.path || ''
  // 提取最后一级目录作为子目录
  let subDir = ''
  const lastDirIndex = fileName.lastIndexOf('/')
  if (lastDirIndex !== -1) {
    subDir = fileName.slice(0, lastDirIndex + 1)
  }

  return `${gameDir}/game/${type}/${subDir}`.replaceAll('\\', '/').replace(/^\//, '')
}
