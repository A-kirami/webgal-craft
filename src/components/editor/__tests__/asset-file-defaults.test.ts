import { describe, expect, it } from 'vitest'

import { resolveAssetFileNameParts } from '~/components/editor/asset-file-defaults'

describe('asset-file-defaults', () => {
  it('会基于资源目录类型返回默认文件名 parts', () => {
    expect(resolveAssetFileNameParts('animation', '新文件')).toEqual({
      extension: '.json',
      stem: '新文件',
    })
    expect(resolveAssetFileNameParts('template', '新文件')).toEqual({
      extension: '.scss',
      stem: '新文件',
    })
  })

  it('不支持创建文件的资源目录不会返回文件名 parts', () => {
    expect(resolveAssetFileNameParts('background', '新文件')).toBeUndefined()
  })
})
