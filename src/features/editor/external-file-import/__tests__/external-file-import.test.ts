import { describe, expect, it, vi } from 'vitest'

import { AbsPath } from '~/domain/path'
import { importExternalFiles } from '~/features/editor/external-file-import/external-file-import'

describe('importExternalFiles', () => {
  it('会规范化并按路径去重外部路径', async () => {
    const importExternalEntry = vi.fn(async (sourcePath: AbsPath, targetDirectory: AbsPath) =>
      AbsPath.append(targetDirectory, AbsPath.basename(sourcePath)),
    )

    const result = await importExternalFiles([
      String.raw`c:\Assets\Hero.png`,
      'C:/Assets/Hero.png',
    ], AbsPath.from('D:/Game/game/figure'), { importExternalEntry })

    expect(importExternalEntry).toHaveBeenCalledOnce()
    expect(importExternalEntry).toHaveBeenCalledWith('C:/Assets/Hero.png', 'D:/Game/game/figure')
    expect(result).toEqual({
      failures: [],
      successes: [{
        sourcePath: 'C:/Assets/Hero.png',
        targetPath: 'D:/Game/game/figure/Hero.png',
      }],
    })
  })

  it('不会合并大小写不同的外部路径', async () => {
    const importExternalEntry = vi.fn(async (sourcePath: AbsPath, targetDirectory: AbsPath) =>
      AbsPath.append(targetDirectory, AbsPath.basename(sourcePath)),
    )

    const result = await importExternalFiles([
      'C:/Assets/Hero.png',
      'C:/assets/hero.png',
    ], AbsPath.from('D:/Game/game/figure'), { importExternalEntry })

    expect(importExternalEntry).toHaveBeenCalledTimes(2)
    expect(result).toEqual({
      failures: [],
      successes: [
        {
          sourcePath: 'C:/Assets/Hero.png',
          targetPath: 'D:/Game/game/figure/Hero.png',
        },
        {
          sourcePath: 'C:/assets/hero.png',
          targetPath: 'D:/Game/game/figure/hero.png',
        },
      ],
    })
  })

  it('单项失败时会继续导入剩余文件并返回完整汇总', async () => {
    const importExternalEntry = vi.fn(async (sourcePath: AbsPath, targetDirectory: AbsPath) => {
      if (sourcePath.endsWith('/broken.png')) {
        throw new Error('copy failed')
      }
      return AbsPath.append(targetDirectory, AbsPath.basename(sourcePath))
    })

    const result = await importExternalFiles([
      'relative.png',
      '/assets/broken.png',
      '/assets/valid.png',
    ], AbsPath.from('/game/background'), { importExternalEntry })

    expect(importExternalEntry).toHaveBeenCalledTimes(2)
    expect(importExternalEntry).toHaveBeenNthCalledWith(1, '/assets/broken.png', '/game/background')
    expect(importExternalEntry).toHaveBeenNthCalledWith(2, '/assets/valid.png', '/game/background')
    expect(result.successes).toEqual([{
      sourcePath: '/assets/valid.png',
      targetPath: '/game/background/valid.png',
    }])
    expect(result.failures).toHaveLength(2)
    expect(result.failures.map(failure => failure.sourcePath)).toEqual([
      'relative.png',
      '/assets/broken.png',
    ])
  })
})
