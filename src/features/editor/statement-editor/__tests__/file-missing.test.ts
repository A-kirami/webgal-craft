import { describe, expect, it } from 'vitest'
import { commandType } from 'webgal-parser/src/interface/sceneInterface'

import {
  collectStatementFileChecks,
  resolveMissingFileKeysFromCatalog,
} from '~/features/editor/statement-editor/file-missing'

import type { ArgField, EditorField } from '~/features/editor/command-registry/schema'

function createFileContentField(assetType = 'background'): EditorField {
  return {
    key: 'content',
    storage: 'content',
    field: {
      key: 'content',
      type: 'file',
      label: () => 'content',
      fileConfig: {
        assetType,
        extensions: ['.png'],
        title: () => 'file',
      },
    },
  }
}

function createFileArgField(storageKey: string, fieldKey = storageKey, assetType = 'figure'): ArgField {
  return {
    storageKey,
    field: {
      key: fieldKey,
      type: 'file',
      label: () => fieldKey,
      fileConfig: {
        assetType,
        extensions: ['.png'],
        title: () => 'file',
      },
    },
  }
}

describe('语句编辑器缺失文件检查', () => {
  it('collectStatementFileChecks 仅收集 content 与 file arg', () => {
    const parsed = {
      command: commandType.changeFigure,
      commandRaw: 'changeFigure',
      content: 'bg.png',
      args: [
        { key: 'sprite', value: 'hero.png' },
        { key: 'focus', value: '{"asset":"ignore.png"}' },
        { key: 'notFile', value: 1 },
      ],
      sentenceAssets: [],
      subScene: [],
      inlineComment: '',
    }

    const checks = collectStatementFileChecks(
      parsed,
      createFileContentField('background'),
      [
        createFileArgField('sprite', 'sprite', 'figure'),
        {
          ...createFileArgField('focus', 'focus', 'figure'),
          jsonMeta: {
            argKey: 'focus',
            fieldKey: 'asset',
          },
        },
      ],
    )

    expect(checks).toEqual([
      { key: '__content__', assetType: 'background', value: 'bg.png' },
      { key: 'sprite', assetType: 'figure', value: 'hero.png' },
    ])
  })

  it('collectStatementFileChecks 会跳过花括号变量占位符', () => {
    const parsed = {
      command: commandType.changeFigure,
      commandRaw: 'changeFigure',
      content: '{bgVar}',
      args: [
        { key: 'sprite', value: '{figureVar}' },
      ],
      sentenceAssets: [],
      subScene: [],
      inlineComment: '',
    }

    const checks = collectStatementFileChecks(
      parsed,
      createFileContentField('background'),
      [createFileArgField('sprite', 'sprite', 'figure')],
    )

    expect(checks).toEqual([])
  })

  it('resolveMissingFileKeysFromCatalog 根据资源索引结果生成缺失键集合', () => {
    const missing = resolveMissingFileKeysFromCatalog(
      [
        { key: '__content__', assetType: 'background', value: 'bg.png' },
        { key: 'sprite', assetType: 'figure', value: 'hero.png' },
        { key: 'scene', assetType: 'scene', value: 's1.txt' },
      ],
      (_assetType, relativePath) => relativePath !== 'hero.png',
    )

    expect(missing).toEqual(new Set(['sprite']))
  })

  it('resolveMissingFileKeysFromCatalog 跳过不带 .txt 的场景值（可能是标签名）', () => {
    const checkedPaths: string[] = []
    const missing = resolveMissingFileKeysFromCatalog(
      [
        { key: 'a', assetType: 'scene', value: 'myLabel' },
        { key: 'b', assetType: 'scene', value: 'other.txt' },
      ],
      (_assetType, relativePath) => {
        checkedPaths.push(relativePath)
        return true
      },
    )

    expect(checkedPaths).toEqual(['other.txt'])
    expect(missing).toEqual(new Set())
  })
})
