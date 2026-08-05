import { describe, expect, it, vi } from 'vitest'

import { AbsPath } from '~/domain/path'
import { resolveMissingStorageSavePaths } from '~/services/platform/storage-defaults'

describe('resolveMissingStorageSavePaths', () => {
  it('所有路径都已存在时不会再请求基础目录', async () => {
    const getBaseDir = vi.fn()

    await expect(resolveMissingStorageSavePaths({
      gameSavePath: '/games',
      engineSavePath: '/engines',
      exportSavePath: '/exports',
      templateSavePath: '/templates',
    }, {
      getBaseDir,
      isAndroid: false,
    })).resolves.toEqual({})

    expect(getBaseDir).not.toHaveBeenCalled()
  })

  it('只会为缺失的路径计算默认值', async () => {
    const getBaseDir = vi.fn(async () => AbsPath.from('/documents'))
    const resolveGameSavePath = vi.fn(async (baseDir: string) => `${baseDir}/WebGALCraft/games`)
    const resolveEngineSavePath = vi.fn(async (baseDir: string) => `${baseDir}/WebGALCraft/engines`)
    const resolveTemplateSavePath = vi.fn(async (baseDir: string) => `${baseDir}/WebGALCraft/templates`)

    await expect(resolveMissingStorageSavePaths({
      gameSavePath: '',
      engineSavePath: '/engines',
      exportSavePath: '',
      templateSavePath: '',
    }, {
      getBaseDir,
      isAndroid: false,
      resolveGameSavePath,
      resolveEngineSavePath,
      resolveTemplateSavePath,
    })).resolves.toEqual({
      gameSavePath: '/documents/WebGALCraft/games',
      exportSavePath: '/documents/WebGALCraft/exports',
      templateSavePath: '/documents/WebGALCraft/templates',
    })

    expect(getBaseDir).toHaveBeenCalledTimes(1)
    expect(resolveGameSavePath).toHaveBeenCalledWith('/documents')
    expect(resolveEngineSavePath).not.toHaveBeenCalled()
    expect(resolveTemplateSavePath).toHaveBeenCalledWith('/documents')
  })

  it('Android 始终使用 native effective roots 覆盖历史设置', async () => {
    const resolveAndroidRoots = vi.fn(async () => ({
      game: AbsPath.from('/private/games'),
      engine: AbsPath.from('/private/engines'),
      template: AbsPath.from('/private/templates'),
      export: AbsPath.from('/private/exports'),
    }))

    await expect(resolveMissingStorageSavePaths({
      gameSavePath: '/legacy/games',
      engineSavePath: '/legacy/engines',
      exportSavePath: '/legacy/exports',
      templateSavePath: '/legacy/templates',
    }, {
      isAndroid: true,
      resolveAndroidRoots,
    })).resolves.toEqual({
      gameSavePath: '/private/games',
      engineSavePath: '/private/engines',
      exportSavePath: '/private/exports',
      templateSavePath: '/private/templates',
    })

    expect(resolveAndroidRoots).toHaveBeenCalledOnce()
  })
})
