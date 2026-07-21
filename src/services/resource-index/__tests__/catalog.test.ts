import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AbsPath } from '~/domain/path'

import { buildAssetCatalog, listAssetsByAssetType } from '../catalog'

import type { DirEntry } from '@tauri-apps/plugin-fs'

const { readDirMock } = vi.hoisted(() => ({ readDirMock: vi.fn() }))

vi.mock('@tauri-apps/plugin-fs', () => ({ readDir: readDirMock }))

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
})
