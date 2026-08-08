import * as monaco from 'monaco-editor'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { commandType } from 'webgal-parser/src/interface/sceneInterface'

const { useResourceIndexMock, useResourceStoreMock, useWorkspaceStoreMock } = vi.hoisted(() => ({
  useResourceIndexMock: vi.fn(),
  useResourceStoreMock: Object.assign(vi.fn(), { $id: 'resource' as const }),
  useWorkspaceStoreMock: Object.assign(vi.fn(), { $id: 'workspace' as const }),
}))

vi.mock(import('~/services/resource-index/service'), () => ({
  useResourceIndex: useResourceIndexMock,
}))
vi.mock(import('~/stores/resource'), () => ({
  useResourceStore: useResourceStoreMock,
}))
vi.mock(import('~/stores/workspace'), () => ({
  useWorkspaceStore: useWorkspaceStoreMock,
}))

import { LEGACY_WEBGAL_SCRIPT_LANGUAGE_ID } from '~/features/editor/text-editor/text-editor-language'
import { getArgKeyCompletions } from '~/plugins/editor/completion/webgal-argument-keys'
import { getCommandCompletions } from '~/plugins/editor/completion/webgal-commands'
import {
  extendWebgalValueCompletionRange,
  getWebgalValueCompletions,
} from '~/plugins/editor/completion/webgal-values'

const t = (key: string) => key

async function loadWebgalCompletionProvider(): Promise<monaco.languages.CompletionItemProvider> {
  const registerCompletionItemProvider = vi.spyOn(monaco.languages, 'registerCompletionItemProvider')
  try {
    await import('~/plugins/editor')

    const registration = registerCompletionItemProvider.mock.calls
      .find(([languageId]) => languageId === 'webgalscript')
    const provider = registration?.[1]
    if (!provider) {
      throw new TypeError('webgalscript completion provider was not registered')
    }

    return provider
  } finally {
    registerCompletionItemProvider.mockRestore()
  }
}

async function provideWebgalCompletions(
  provider: monaco.languages.CompletionItemProvider,
  text: string,
): Promise<monaco.languages.CompletionItem[]> {
  const model = monaco.editor.createModel(text, 'webgalscript')
  const lineNumber = model.getLineCount()
  try {
    const result = await provider.provideCompletionItems(
      model,
      new monaco.Position(lineNumber, model.getLineMaxColumn(lineNumber)),
      { triggerKind: monaco.languages.CompletionTriggerKind.Invoke },
      undefined as never,
    )
    return result?.suggestions ?? []
  } finally {
    model.dispose()
  }
}

describe('getCommandCompletions', () => {
  it('插入完整命令骨架并将光标留在分号前继续补全内容', () => {
    const range = {
      startLineNumber: 1,
      endLineNumber: 1,
      startColumn: 1,
      endColumn: 9,
    }
    const changeBg = getCommandCompletions(range)
      .find(item => item.label === 'changeBg')

    expect(changeBg).toMatchObject({
      insertText: 'changeBg:${1};',
      insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
      command: {
        id: 'editor.action.triggerSuggest',
      },
      range,
    })
  })
})

describe('getWebgalValueCompletions', () => {
  it('把完整资源值和扩展后的替换范围转换为 Monaco CompletionItem', async () => {
    const range = extendWebgalValueCompletionRange('changeBg:a/old.png;', {
      startLineNumber: 1,
      endLineNumber: 1,
      startColumn: 10,
      endColumn: 12,
    }, 'content')
    const items = await getWebgalValueCompletions({
      command: commandType.changeBg,
      key: 'content',
      prefix: 'a/',
      range,
      content: 'a/',
      listResources: () => [
        { label: 'a/b.png', value: 'a/b.png' },
        { label: 'other.png', value: 'other.png' },
      ],
    }, t)

    expect(items).toEqual([{
      label: 'a/b.png',
      insertText: 'a/b.png',
      kind: monaco.languages.CompletionItemKind.Value,
      range: {
        startLineNumber: 1,
        endLineNumber: 1,
        startColumn: 10,
        endColumn: 19,
      },
    }])
  })

  it('按参数和 choose 分隔符扩展当前值的替换范围', () => {
    const argumentLine = 'changeFigure:hero.json -motion=a/old -next;'
    const argumentStartColumn = argumentLine.indexOf('a/') + 1
    expect(extendWebgalValueCompletionRange(argumentLine, {
      startLineNumber: 1,
      endLineNumber: 1,
      startColumn: argumentStartColumn,
      endColumn: argumentStartColumn + 2,
    }, 'argument').endColumn).toBe(argumentLine.indexOf(' -next') + 1)

    const chooseLine = 'choose:First:a/old.txt|Second:b.txt;'
    const choiceStartColumn = chooseLine.indexOf('a/') + 1
    expect(extendWebgalValueCompletionRange(chooseLine, {
      startLineNumber: 1,
      endLineNumber: 1,
      startColumn: choiceStartColumn,
      endColumn: choiceStartColumn + 2,
    }, 'choice').endColumn).toBe(chooseLine.indexOf('|') + 1)
  })
})

describe('getArgKeyCompletions', () => {
  const range = {
    startLineNumber: 1,
    endLineNumber: 1,
    startColumn: 14,
    endColumn: 16,
  }

  it('裸参数键补全时补上连字符并继续触发值补全', () => {
    const figureId = getArgKeyCompletions(range, commandType.say, false)
      .find(item => item.label === 'figureId')

    expect(figureId).toMatchObject({
      insertText: '-figureId=',
      command: {
        id: 'editor.action.triggerSuggest',
      },
    })
  })

  it('已有连字符时不重复插入且无值候选的参数不继续补全', () => {
    const completions = getArgKeyCompletions(range, commandType.say, true)

    expect(completions.find(item => item.label === 'figureId')).toMatchObject({
      insertText: 'figureId=',
      command: {
        id: 'editor.action.triggerSuggest',
      },
    })
    expect(completions.find(item => item.label === 'left')).toMatchObject({
      insertText: 'left',
    })
    expect(completions.find(item => item.label === 'left')).not.toHaveProperty('command')

    const plainText = getArgKeyCompletions(range, commandType.getUserInput, true)
      .find(item => item.label === 'ruleButtonText')
    expect(plainText).toMatchObject({
      insertText: 'ruleButtonText=',
    })
    expect(plainText).not.toHaveProperty('command')
  })

  it('旧引擎不提供扩展立绘位置参数', () => {
    const completions = getArgKeyCompletions(range, commandType.say, true, {
      figurePositions: false,
      multilineStatements: false,
      opusVocalShorthand: false,
      sceneSemantics: false,
    })

    expect(completions.map(item => item.label)).not.toContain('left13')
    expect(completions.map(item => item.label)).not.toContain('left14')
    expect(completions.map(item => item.label)).not.toContain('right13')
    expect(completions.map(item => item.label)).not.toContain('right14')
  })
})

describe('WebGAL Monaco 补全', () => {
  let provider: monaco.languages.CompletionItemProvider

  beforeAll(async () => {
    provider = await loadWebgalCompletionProvider()
  })

  beforeEach(() => {
    useResourceIndexMock.mockReset()
    useResourceStoreMock.mockReset()
    useWorkspaceStoreMock.mockReset()

    useResourceIndexMock.mockReturnValue({
      listByAssetType: () => [{ key: { relativePath: 'chapter/next.txt' } }],
    })
    useResourceStoreMock.mockReturnValue({
      currentEngineRuntimeCapabilities: { figurePositions: true, multilineStatements: true, opusVocalShorthand: true },
    })
    useWorkspaceStoreMock.mockReturnValue({ currentGame: { path: '/game' } })
  })

  it('在 choose 续行的场景文件位置提供补全', async () => {
    const suggestions = await provideWebgalCompletions(
      provider,
      'choose:First:chapter/first.txt\n  |Second:',
    )

    expect(suggestions).toContainEqual(expect.objectContaining({
      label: 'chapter/next.txt',
      insertText: 'chapter/next.txt',
    }))
  })

  it('在 choose 续行的转义冒号后不提供场景文件补全', async () => {
    const suggestions = await provideWebgalCompletions(
      provider,
      'choose:First:chapter/first.txt\n  |Second\\:',
    )

    expect(suggestions).toEqual([])
  })

  it('在含转义冒号的 choose 续行目标分隔符后提供补全', async () => {
    const suggestions = await provideWebgalCompletions(
      provider,
      'choose:First:chapter/first.txt\n  |Second\\:Part:',
    )

    expect(suggestions).toContainEqual(expect.objectContaining({
      label: 'chapter/next.txt',
      insertText: 'chapter/next.txt',
    }))
  })
})

describe('WebGAL Monaco 语法高亮', () => {
  it('旧运行时将 return 按旁白内容着色，而不是命令', () => {
    const [tokens] = monaco.editor.tokenize('return;', LEGACY_WEBGAL_SCRIPT_LANGUAGE_ID)

    expect(tokens?.[0]).toMatchObject({
      offset: 0,
      type: expect.stringContaining('content.say.webgal'),
    })
  })
})
