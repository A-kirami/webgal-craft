import { describe, expect, it } from 'vitest'

import { RelPath } from '~/domain/path'

import { createAssetKeyForType } from '../keys'
import { createReferencedAssetKey, shouldIndexAssetReferenceValue } from '../values'

describe('resource-index values', () => {
  it('会先去除空白再判断是否索引资源引用值', () => {
    expect(shouldIndexAssetReferenceValue('background', '   ')).toBe(false)
    expect(shouldIndexAssetReferenceValue('scene', '  intro.txt  ')).toBe(true)
    expect(shouldIndexAssetReferenceValue('scene', '  intro  ')).toBe(false)
  })

  it('会先去除空白再生成引用资源键', () => {
    expect(createReferencedAssetKey('background', '  bg.jpg  ')).toEqual(
      createAssetKeyForType('background', RelPath.from('bg.jpg')),
    )
  })
})
