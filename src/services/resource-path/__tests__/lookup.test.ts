import { describe, expect, it } from 'vitest'

import { AbsPath, RelPath } from '~/domain/path'
import { caseFoldedEquals, toLookupPathKey } from '~/services/resource-path/lookup'

describe('resource-path lookup', () => {
  it('对绝对路径进行大小写折叠且不改变路径身份 API', () => {
    expect(toLookupPathKey(AbsPath.from('c:/Game/Scene.txt'))).toBe('c:/game/scene.txt')
  })

  it('对相对路径进行大小写折叠', () => {
    expect(toLookupPathKey(RelPath.from('game/Scene.txt'))).toBe('game/scene.txt')
  })

  it('按显式大小写折叠的业务语义比较路径', () => {
    expect(caseFoldedEquals(
      AbsPath.from('C:/Game/Foo.txt'),
      AbsPath.from('c:/game/foo.txt'),
    )).toBe(true)
    expect(caseFoldedEquals(
      RelPath.from('game/Foo.txt'),
      RelPath.from('game/Bar.txt'),
    )).toBe(false)
  })
})
