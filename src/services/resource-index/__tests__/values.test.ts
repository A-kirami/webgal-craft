import { describe, expect, it } from 'vitest'

import { RelPath } from '~/domain/path'

import { createAssetKeyForType } from '../keys'
import { createReferencedAssetKey, shouldIndexAssetReferenceValue } from '../values'

describe('resource-index values', () => {
  it('会先去除空白再判断是否索引资源引用值', () => {
    expect(shouldIndexAssetReferenceValue('background', ' '.repeat(3))).toBe(false)
    expect(shouldIndexAssetReferenceValue('scene', '  intro.txt  ')).toBe(true)
    expect(shouldIndexAssetReferenceValue('scene', '  intro  ')).toBe(false)
  })

  it('会先去除空白再生成引用资源键', () => {
    expect(createReferencedAssetKey('background', '  bg.jpg  ')).toEqual(
      createAssetKeyForType('background', RelPath.from('bg.jpg')),
    )
  })

  it('资源查询参数不参与路径身份', () => {
    expect(createReferencedAssetKey('figure', ' hero.json?type=spine ')).toEqual(
      createAssetKeyForType('figure', RelPath.from('hero.json')),
    )
  })

  it('绝对路径和越界相对路径不会形成资源键', () => {
    expect(createReferencedAssetKey('background', '/outside/bg.png')).toBeUndefined()
    expect(createReferencedAssetKey('figure', '../hero.png')).toBeUndefined()
  })

  it('动画脚本引用映射到带 json 后缀的资源文件', () => {
    expect(createReferencedAssetKey('animation', ' effects/fade ')).toEqual(
      createAssetKeyForType('animation', RelPath.from('effects/fade.json')),
    )
  })

  it('动画脚本引用已有 json 后缀时不会重复追加', () => {
    expect(createReferencedAssetKey('animation', ' effects/fade.json ')).toEqual(
      createAssetKeyForType('animation', RelPath.from('effects/fade.json')),
    )
  })
})
