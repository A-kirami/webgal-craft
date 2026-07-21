import * as monaco from 'monaco-editor'
import { describe, expect, it } from 'vitest'
import { commandType } from 'webgal-parser/src/interface/sceneInterface'

import { getArgKeyCompletions } from '~/plugins/editor/completion/webgal-argument-keys'
import { getCommandCompletions } from '~/plugins/editor/completion/webgal-commands'
import {
  extendWebgalValueCompletionRange,
  getWebgalValueCompletions,
} from '~/plugins/editor/completion/webgal-values'

const t = (key: string) => key

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
})
