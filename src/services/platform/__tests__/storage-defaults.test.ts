import { describe, expect, it, vi } from 'vitest'

import { AbsPath } from '~/domain/path'
import { resolveMissingStorageSavePaths } from '~/services/platform/storage-defaults'

describe('resolveMissingStorageSavePaths', () => {
  it('所有路径都已存在时不会再请求基础目录', async () => {
    const getBaseDir = vi.fn()

    await expect(resolveMissingStorageSavePaths({
      gameSavePath: '/games',
      engineSavePath: '/engines',
      templateSavePath: '/templates',
    }, {
      getBaseDir,
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
      templateSavePath: '',
    }, {
      getBaseDir,
      resolveGameSavePath,
      resolveEngineSavePath,
      resolveTemplateSavePath,
    })).resolves.toEqual({
      gameSavePath: '/documents/WebGALCraft/games',
      templateSavePath: '/documents/WebGALCraft/templates',
    })

    expect(getBaseDir).toHaveBeenCalledTimes(1)
    expect(resolveGameSavePath).toHaveBeenCalledWith('/documents')
    expect(resolveEngineSavePath).not.toHaveBeenCalled()
    expect(resolveTemplateSavePath).toHaveBeenCalledWith('/documents')
  })
})
