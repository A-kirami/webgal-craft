import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AbsPath, normalizePosix } from '~/domain/path'
import { isAnimationTablePath, isAnimationTableRelatedPath, syncAnimationTable } from '~/services/animation-table-sync'

import type { DirEntry } from '@tauri-apps/plugin-fs'

const {
  existsMock,
  gameAssetDirMock,
  readDirMock,
  readTextFileMock,
  writeTextFileMock,
} = vi.hoisted(() => ({
  existsMock: vi.fn(),
  gameAssetDirMock: vi.fn(),
  readDirMock: vi.fn(),
  readTextFileMock: vi.fn(),
  writeTextFileMock: vi.fn(),
}))

vi.mock('@tauri-apps/plugin-fs', () => ({
  exists: existsMock,
  readDir: readDirMock,
  readTextFile: readTextFileMock,
  writeTextFile: writeTextFileMock,
}))

vi.mock('~/services/platform/app-paths', () => ({
  gameAssetDir: gameAssetDirMock,
}))

function normalizePath(path: string): string {
  return normalizePosix(path)
}

function createDirEntry(name: string, options: Partial<DirEntry> = {}): DirEntry {
  return {
    isDirectory: false,
    isFile: true,
    isSymlink: false,
    name,
    ...options,
  }
}

describe('animationTableSync', () => {
  beforeEach(() => {
    existsMock.mockReset()
    gameAssetDirMock.mockReset()
    readDirMock.mockReset()
    readTextFileMock.mockReset()
    writeTextFileMock.mockReset()

    gameAssetDirMock.mockReturnValue('/project/game/animation')
  })

  it('会递归收集动画文件并写入带子目录的相对条目', async () => {
    existsMock.mockResolvedValue(true)
    readDirMock.mockImplementation(async (path: string) => {
      switch (normalizePath(path)) {
        case '/project/game/animation': {
          return [
            createDirEntry('bbb.json'),
            createDirEntry('cover.png'),
            createDirEntry('animationTable.json'),
            createDirEntry('aaa', { isDirectory: true, isFile: false }),
          ]
        }
        case '/project/game/animation/aaa': {
          return [
            createDirEntry('ccc.json'),
            createDirEntry('bbb.json'),
            createDirEntry('nested', { isDirectory: true, isFile: false }),
          ]
        }
        case '/project/game/animation/aaa/nested': {
          return [
            createDirEntry('ddd.json'),
          ]
        }
        default: {
          throw new TypeError(`unexpected readDir path: ${path}`)
        }
      }
    })
    readTextFileMock.mockRejectedValue(new Error('missing animationTable'))

    await syncAnimationTable(AbsPath.from('/project'))

    expect(writeTextFileMock).toHaveBeenCalledWith(
      '/project/game/animation/animationTable.json',
      [
        '[',
        '  "aaa/bbb",',
        '  "aaa/ccc",',
        '  "aaa/nested/ddd",',
        '  "bbb"',
        ']',
        '',
      ].join('\n'),
    )
  })

  it('内容未变化时不会重复写入 animationTable.json', async () => {
    existsMock.mockResolvedValue(true)
    readDirMock.mockResolvedValue([
      createDirEntry('aaa', { isDirectory: true, isFile: false }),
      createDirEntry('bbb.json'),
    ])
    readDirMock.mockResolvedValueOnce([
      createDirEntry('aaa', { isDirectory: true, isFile: false }),
      createDirEntry('bbb.json'),
    ])
    readDirMock.mockResolvedValueOnce([
      createDirEntry('ccc.json'),
    ])
    readTextFileMock.mockResolvedValue([
      '[',
      '  "aaa/ccc",',
      '  "bbb"',
      ']',
      '',
    ].join('\n'))

    await syncAnimationTable(AbsPath.from('/project'))

    expect(writeTextFileMock).not.toHaveBeenCalled()
  })

  it('只把 animation 目录内非索引路径视为相关路径', () => {
    expect(isAnimationTablePath(
      AbsPath.from('/project'),
      AbsPath.from('/project/game/animation/animationTable.json'),
    )).toBe(true)
    expect(isAnimationTablePath(
      AbsPath.from('/project'),
      AbsPath.from('/project/game/animation/fade.json'),
    )).toBe(false)
    expect(isAnimationTableRelatedPath(
      AbsPath.from('/project'),
      AbsPath.from('/project/game/animation/aaa/bbb.json'),
    )).toBe(true)
    expect(isAnimationTableRelatedPath(
      AbsPath.from('/project'),
      AbsPath.from('/project/game/animation/aaa'),
    )).toBe(true)
    expect(isAnimationTableRelatedPath(
      AbsPath.from('/project'),
      AbsPath.from('/project/game/animation/animationTable.json'),
    )).toBe(false)
    expect(isAnimationTableRelatedPath(
      AbsPath.from('/project'),
      AbsPath.from('/project/game/background/aaa.json'),
    )).toBe(false)
  })
})
