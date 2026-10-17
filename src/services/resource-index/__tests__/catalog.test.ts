import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AbsPath } from '~/domain/path'

import {
  addAssetPathToCatalog,
  buildAssetCatalog,
  listAssetsByAssetType,
  removeAssetPathFromCatalog,
  renameAssetPathInCatalog,
  resolveAssetByAbsolutePath,
} from '../catalog'

import type { DirEntry } from '@tauri-apps/plugin-fs'

const { readDirMock } = vi.hoisted(() => ({ readDirMock: vi.fn() }))

vi.mock('@tauri-apps/plugin-fs', () => ({ readDir: readDirMock }))

vi.mock('@tauri-apps/plugin-log', () => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
}))

vi.mock('~/commands/game-assets', async () => {
  const { scanGameAssetsFromReadDir } = await import('~/__tests__/mocks/game-assets')
  return {
    gameAssetsCmds: {
      scan: scanGameAssetsFromReadDir,
    },
  }
})

function createDirEntry(name: string, isDirectory = false): DirEntry {
  return {
    name,
    isDirectory,
    isFile: !isDirectory,
    isSymlink: false,
  }
}

describe('buildAssetCatalog', () => {
  beforeEach(() => {
    readDirMock.mockReset()
  })

  it('不会把动画表元数据登记为动画资源', async () => {
    readDirMock.mockImplementation(async (path: string) => {
      if (path === '/project/game') {
        return [createDirEntry('animation', true)]
      }
      if (path === '/project/game/animation') {
        return [createDirEntry('animationTable.json'), createDirEntry('fade.json')]
      }
      throw new TypeError(`unexpected readDir path: ${path}`)
    })

    const catalog = await buildAssetCatalog(AbsPath.from('/project'))

    expect(listAssetsByAssetType(catalog, 'animation').map(entry => entry.key.relativePath)).toEqual([
      'fade.json',
    ])
  })

  it('增删改名后 key 查询与绝对路径解析保持一致', async () => {
    readDirMock.mockImplementation(async (path: string) => {
      if (path === '/project/game') {
        return [createDirEntry('background', true)]
      }
      if (path === '/project/game/background') {
        return [createDirEntry('a.png'), createDirEntry('b.png')]
      }
      throw new TypeError(`unexpected readDir path: ${path}`)
    })

    const gamePath = AbsPath.from('/project')
    const catalog = await buildAssetCatalog(gamePath)

    expect(resolveAssetByAbsolutePath(catalog, AbsPath.from('/project/game/background/a.png'))?.key.relativePath)
      .toBe('a.png')

    const added = addAssetPathToCatalog(
      catalog,
      gamePath,
      AbsPath.from('/project/game/background/c.png'),
    )
    expect(resolveAssetByAbsolutePath(added, AbsPath.from('/project/game/background/c.png'))?.key.relativePath)
      .toBe('c.png')

    const renamed = renameAssetPathInCatalog(
      added,
      gamePath,
      AbsPath.from('/project/game/background/a.png'),
      AbsPath.from('/project/game/background/d.png'),
    )
    expect(resolveAssetByAbsolutePath(renamed, AbsPath.from('/project/game/background/a.png')))
      .toBeUndefined()
    expect(resolveAssetByAbsolutePath(renamed, AbsPath.from('/project/game/background/d.png'))?.key.relativePath)
      .toBe('d.png')

    const removed = removeAssetPathFromCatalog(
      renamed,
      gamePath,
      AbsPath.from('/project/game/background/b.png'),
    )
    expect(resolveAssetByAbsolutePath(removed, AbsPath.from('/project/game/background/b.png')))
      .toBeUndefined()
  })
})
