import '~/__tests__/setup'
import '~/__tests__/mocks/tauri-fs'

import { exists } from '@tauri-apps/plugin-fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AbsPath } from '~/domain/path'

import { resolveGameIconPreviewPath } from '../project-icon-assets'

const existsMock = vi.mocked(exists)

describe('project-icon-assets', () => {
  beforeEach(() => {
    existsMock.mockReset()
    existsMock.mockResolvedValue(false)
  })

  it('按根级展示优先级解析游戏图标预览路径', async () => {
    existsMock.mockImplementation(async path => String(path) === '/games/demo/icons/icon-512.png')

    await expect(resolveGameIconPreviewPath(AbsPath.from('/games/demo'))).resolves.toBe('icons/icon-512.png')
  })

  it('支持注入逻辑路径存在性解析器以复用 VFS overlay 语义', async () => {
    const pathExists = vi.fn(async ({ relativePath }) => relativePath === 'icons/icon-512.png')

    await expect(resolveGameIconPreviewPath(AbsPath.from('/games/demo'), { pathExists })).resolves.toBe('icons/icon-512.png')

    expect(existsMock).not.toHaveBeenCalled()
    expect(pathExists).toHaveBeenCalledWith(expect.objectContaining({
      absolutePath: '/games/demo/icons/icon-512.png',
      gamePath: '/games/demo',
      relativePath: 'icons/icon-512.png',
    }))
  })
})
