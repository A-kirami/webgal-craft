import { describe, expect, it } from 'vitest'

import {
  AbsPath,
  normalizePosix,
  PathError,
  RelPath,
} from '~/domain/path'

describe('normalizePosix', () => {
  it('会统一分隔符并消解点路径片段', () => {
    expect(normalizePosix(String.raw`C:\Game\.\scene\\intro.txt`)).toBe('C:/Game/scene/intro.txt')
    expect(normalizePosix('game//scene/../bg//title.png')).toBe('game/bg/title.png')
  })
})

describe('AbsPath', () => {
  it('会创建规范化后的绝对路径', () => {
    const path = AbsPath.from(String.raw`C:\Game\scene\..\intro.txt`)

    expect(path).toBe('C:/Game/intro.txt')
    expect(typeof path).toBe('string')
  })

  it('会拒绝相对路径输入', () => {
    expect(() => AbsPath.from('game/scene.txt')).toThrow(PathError)
  })

  it('支持拼接相对路径并计算相对路径', () => {
    const root = AbsPath.from('C:/Game')
    const scene = AbsPath.join(root, RelPath.from('game/scene/intro.txt'))

    expect(scene).toBe('C:/Game/game/scene/intro.txt')
    expect(AbsPath.relativize(scene, root)).toBe('game/scene/intro.txt')
  })

  it('在文件系统根路径上正确处理 basename、parent 和 relativize', () => {
    expect(AbsPath.basename(AbsPath.from('C:/foo'))).toBe('foo')
    expect(AbsPath.parent(AbsPath.from('C:/foo'))).toBe('C:/')
    expect(AbsPath.relativize(AbsPath.from('C:/foo'), AbsPath.from('C:/'))).toBe('foo')

    expect(AbsPath.basename(AbsPath.from('/foo'))).toBe('foo')
    expect(AbsPath.parent(AbsPath.from('/foo'))).toBe('/')
    expect(AbsPath.relativize(AbsPath.from('/foo'), AbsPath.from('/'))).toBe('foo')
  })

  it('在文件系统根路径上返回空 basename 和自身 parent', () => {
    expect(AbsPath.basename(AbsPath.from('C:/'))).toBe('')
    expect(AbsPath.parent(AbsPath.from('C:/'))).toBe('C:/')

    expect(AbsPath.basename(AbsPath.from('/'))).toBe('')
    expect(AbsPath.parent(AbsPath.from('/'))).toBe('/')

    expect(AbsPath.basename(AbsPath.from('//server/share'))).toBe('')
    expect(AbsPath.parent(AbsPath.from('//server/share'))).toBe('//server/share')
  })

  it('处理 UNC 根路径时不会丢失 server/share 语义', () => {
    const root = AbsPath.from('//server/share')
    const file = AbsPath.from('//server/share/game/scene.txt')

    expect(AbsPath.parent(file)).toBe('//server/share/game')
    expect(AbsPath.basename(file)).toBe('scene.txt')
    expect(AbsPath.relativize(file, root)).toBe('game/scene.txt')
  })

  it('append 会拒绝包含分隔符的路径片段', () => {
    const root = AbsPath.from('C:/Game')

    expect(() => AbsPath.append(root, 'game/scene')).toThrow(PathError)
  })
})

describe('RelPath', () => {
  it('支持空根路径', () => {
    expect(RelPath.empty()).toBe('')
    expect(RelPath.from('.')).toBe('')
    expect(RelPath.from('game/./scene/../intro.txt')).toBe('game/intro.txt')
  })

  it('会拒绝越过根边界的向上遍历', () => {
    expect(() => RelPath.from('../scene.txt')).toThrow(PathError)
    expect(() => RelPath.from('..')).toThrow(PathError)
    expect(() => RelPath.from('a/../../x')).toThrow(PathError)
  })

  it('会拒绝绝对路径输入', () => {
    expect(() => RelPath.from('/absolute/path')).toThrow(PathError)
    expect(() => RelPath.from('//server/share')).toThrow(PathError)
    expect(() => RelPath.from('C:/windows/path')).toThrow(PathError)
    expect(() => RelPath.from(String.raw`C:\windows\path`)).toThrow(PathError)
  })

  it('会保留仅以两个点开头的普通片段', () => {
    expect(RelPath.from('..foo')).toBe('..foo')
    expect(RelPath.from('game/..hidden/intro.txt')).toBe('game/..hidden/intro.txt')
  })

  it('支持 parent、basename 和前缀判断', () => {
    const path = RelPath.from('game/scene/intro.txt')

    expect(RelPath.parent(path)).toBe('game/scene')
    expect(RelPath.basename(path)).toBe('intro.txt')
    expect(RelPath.startsWith(path, RelPath.from('game'))).toBe(true)
    expect(RelPath.startsWith(path, RelPath.from('scene'))).toBe(false)
  })
})
