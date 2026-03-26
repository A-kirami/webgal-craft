import '~/__tests__/mocks/tauri-fs'

import { exists } from '@tauri-apps/plugin-fs'
import { describe, expect, it, vi } from 'vitest'
import { commandType } from 'webgal-parser/src/interface/sceneInterface'

import {
  collectStatementFileChecks,
  createStatementMissingFileLoader,
  resolveMissingFileKeys,
} from '~/features/editor/statement-editor/file-missing'

import type { ArgField, EditorField } from '~/features/editor/command-registry/schema'

const mockExists = vi.mocked(exists)

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

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
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

  it('resolveMissingFileKeys 根据 exists 结果生成缺失键集合', async () => {
    mockExists.mockImplementation(async path => !(path as string).includes('hero.png'))

    const missing = await resolveMissingFileKeys(
      '/mock',
      [
        { key: '__content__', assetType: 'background', value: 'bg.png' },
        { key: 'sprite', assetType: 'figure', value: 'hero.png' },
        { key: 'scene', assetType: 'scene', value: 's1.txt' },
      ],
      {
        gameAssetDir: async (_cwd, assetType) => `/asset/${assetType}`,
        gameSceneDir: async () => '/scene',
        joinPath: async (left, right) => `${left}/${right}`,
      },
    )

    expect(missing).toEqual(new Set(['sprite']))
  })

  it('resolveMissingFileKeys 跳过不带 .txt 的场景值（可能是标签名）', async () => {
    const paths: string[] = []
    mockExists.mockImplementation(async (path) => {
      paths.push(path as string)
      return true
    })

    const missing = await resolveMissingFileKeys(
      '/mock',
      [
        { key: 'a', assetType: 'scene', value: 'myLabel' },
        { key: 'b', assetType: 'scene', value: 'other.txt' },
      ],
      {
        gameAssetDir: async (_cwd, assetType) => `/asset/${assetType}`,
        gameSceneDir: async () => '/scene',
        joinPath: async (left, right) => `${left}/${right}`,
      },
    )

    // 不带 .txt 的值可能是标签名，不检查文件存在性
    expect(paths).not.toContain('/scene/myLabel')
    expect(paths).not.toContain('/scene/myLabel.txt')
    // 带 .txt 的正常检查
    expect(paths).toContain('/scene/other.txt')
    expect(missing).toEqual(new Set())
  })

  it('createStatementMissingFileLoader 会丢弃过期请求结果', async () => {
    const slowExists = createDeferred<boolean>()

    mockExists.mockImplementation(async (path) => {
      if ((path as string).includes('slow.png')) {
        return slowExists.promise
      }
      return true
    })

    const loader = createStatementMissingFileLoader({
      gameAssetDir: async (_cwd, assetType) => `/asset/${assetType}`,
      gameSceneDir: async () => '/scene',
      joinPath: async (left, right) => `${left}/${right}`,
    })

    const slowRequest = loader({
      cwd: '/mock',
      parsed: {
        command: commandType.changeBg,
        commandRaw: 'changeBg',
        content: 'slow.png',
        args: [],
        sentenceAssets: [],
        subScene: [],
        inlineComment: '',
      },
      contentField: createFileContentField('background'),
      argFields: [],
    })

    const fastRequest = loader({
      cwd: '/mock',
      parsed: {
        command: commandType.changeBg,
        commandRaw: 'changeBg',
        content: 'fast.png',
        args: [],
        sentenceAssets: [],
        subScene: [],
        inlineComment: '',
      },
      contentField: createFileContentField('background'),
      argFields: [],
    })

    expect(await fastRequest).toEqual(new Set())

    slowExists.resolve(false)
    expect(await slowRequest).toBeUndefined()
  })
})
