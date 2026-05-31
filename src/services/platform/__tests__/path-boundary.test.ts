import { describe, expect, it } from 'vitest'

import { PathError } from '~/domain/path'

import { fromExternalAbsPath } from '../path-boundary'

describe('fromExternalAbsPath', () => {
  it('会把外部绝对路径规范化为 AbsPath', () => {
    expect(fromExternalAbsPath(String.raw`c:\Games\Demo\icon.png`)).toBe('C:/Games/Demo/icon.png')
  })

  it('会拒绝外部相对路径', () => {
    expect(() => fromExternalAbsPath('game/icon.png')).toThrow(PathError)
  })
})
