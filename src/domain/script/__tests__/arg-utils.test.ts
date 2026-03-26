import { describe, expect, it } from 'vitest'

import { removeArg, setOrRemoveArg, upsertArg } from '~/domain/script/arg-utils'

import type { arg } from 'webgal-parser/src/interface/sceneInterface'

describe('WebGAL 参数工具', () => {
  it('upsertArg 会在缺失时插入，在已存在时更新', () => {
    const args: arg[] = [{ key: 'duration', value: '300' }]

    upsertArg(args, 'next', true)
    upsertArg(args, 'duration', '500')

    expect(args).toEqual([
      { key: 'duration', value: '500' },
      { key: 'next', value: true },
    ])
  })

  it('removeArg 会按 key 删除参数，缺失时保持不变', () => {
    const args: arg[] = [
      { key: 'next', value: true },
      { key: 'duration', value: '300' },
    ]

    removeArg(args, 'next')
    removeArg(args, 'missing')

    expect(args).toEqual([
      { key: 'duration', value: '300' },
    ])
  })

  it('setOrRemoveArg 会在空值或默认值时移除参数', () => {
    const args: arg[] = [
      { key: 'duration', value: '300' },
      { key: 'next', value: true },
    ]

    setOrRemoveArg(args, 'duration', '300', 300)
    setOrRemoveArg(args, 'next', '')
    setOrRemoveArg(args, 'enter', 'fadeIn')

    expect(args).toEqual([
      { key: 'enter', value: 'fadeIn' },
    ])
  })
})
