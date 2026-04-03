import { beforeEach, describe, expect, it, vi } from 'vitest'

import { isAnimationTableRelatedPath, syncAnimationTable } from '~/services/animation-table-sync'

import type { DirEntry } from '@tauri-apps/plugin-fs'

const {
  existsMock,
  gameAssetDirMock,
  joinMock,
  readDirMock,
  readTextFileMock,
  writeTextFileMock,
} = vi.hoisted(() => ({
  existsMock: vi.fn(),
  gameAssetDirMock: vi.fn(),
  joinMock: vi.fn(async (...parts: string[]) => normalizePath(parts.join('/'))),
  readDirMock: vi.fn(),
  readTextFileMock: vi.fn(),
  writeTextFileMock: vi.fn(),
}))

vi.mock('@tauri-apps/api/path', () => ({
  join: joinMock,
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
  const isAbsolute = path.startsWith('/')
  const segments: string[] = []

  for (const rawSegment of path.replaceAll('\\', '/').split('/')) {
    if (!rawSegment || rawSegment === '.') {
      continue
    }
    if (rawSegment === '..') {
      segments.pop()
      continue
    }
    segments.push(rawSegment)
  }

  return `${isAbsolute ? '/' : ''}${segments.join('/')}`
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

describe('animationTable 索引同步', () => {
  beforeEach(() => {
    existsMock.mockReset()
    gameAssetDirMock.mockReset()
    joinMock.mockClear()
    readDirMock.mockReset()
    readTextFileMock.mockReset()
    writeTextFileMock.mockReset()

    gameAssetDirMock.mockResolvedValue('/project/game/animation')
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

    await syncAnimationTable('/project')

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

    await syncAnimationTable('/project')

    expect(writeTextFileMock).not.toHaveBeenCalled()
  })

  it('只把 animation 目录内非索引路径视为相关路径', () => {
    expect(isAnimationTableRelatedPath('/project', '/project/game/animation/aaa/bbb.json')).toBe(true)
    expect(isAnimationTableRelatedPath('/project', '/project/game/animation/aaa')).toBe(true)
    expect(isAnimationTableRelatedPath('/project', '/project/game/animation/animationTable.json')).toBe(false)
    expect(isAnimationTableRelatedPath('/project', '/project/game/background/aaa.json')).toBe(false)
  })
})
