import { describe, expect, it } from 'vitest'

import {
  parseStartupImages,
  serializeStartupImages,
} from '../game-config-images'

describe('game-config image helpers', () => {
  it('parseStartupImages 会忽略尾部空段并保留顺序', () => {
    expect(parseStartupImages('opening.webp|enter.webp|')).toEqual([
      'opening.webp',
      'enter.webp',
    ])
  })

  it('parseStartupImages 会过滤空白片段', () => {
    expect(parseStartupImages(' opening.webp |  | enter.webp || ')).toEqual([
      'opening.webp',
      'enter.webp',
    ])
  })

  it('serializeStartupImages 会输出 WebGAL 需要的尾部管道符', () => {
    expect(serializeStartupImages([
      'opening.webp',
      'enter.webp',
    ])).toBe('opening.webp|enter.webp|')
  })
})
