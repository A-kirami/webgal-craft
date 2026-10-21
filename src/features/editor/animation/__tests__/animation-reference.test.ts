import '~/__tests__/setup'

import { describe, expect, it } from 'vitest'

import { AbsPath } from '~/domain/path'

import { resolveAnimationNameFromPath, resolveAnimationReference } from '../animation-reference'

const GAME_PATH = AbsPath.from('/games/demo')

describe('resolveAnimationReference', () => {
  it('把动画名解析为 game/animation 下的 json 文件', () => {
    expect(resolveAnimationReference(GAME_PATH, 'walk/fade')).toEqual({
      ok: true,
      reference: {
        animationName: 'walk/fade',
        filePath: '/games/demo/game/animation/walk/fade.json',
      },
    })
  })

  it('允许带 .json 后缀的名字并归一化掉后缀', () => {
    expect(resolveAnimationReference(GAME_PATH, ' bounce.json ')).toEqual({
      ok: true,
      reference: {
        animationName: 'bounce',
        filePath: '/games/demo/game/animation/bounce.json',
      },
    })
  })

  it('允许文件名包含空格与大小写', () => {
    const resolution = resolveAnimationReference(GAME_PATH, 'Walk/Fade In')

    expect(resolution.ok).toBe(true)
    expect(resolution.ok && resolution.reference.animationName).toBe('Walk/Fade In')
  })

  it.each([
    ['', 'empty'],
    [' '.repeat(3), 'empty'],
    ['.json', 'empty'],
    ['{{animationName}}', 'dynamic-name'],
    ['walk/{{index}}', 'dynamic-name'],
    ['/absolute/path', 'invalid-path'],
    [String.raw`C:\games\fade`, 'invalid-path'],
    [String.raw`walk\fade`, 'invalid-path'],
    ['../fade', 'invalid-path'],
    ['walk/../fade', 'invalid-path'],
    ['walk//fade', 'invalid-path'],
    ['walk/', 'invalid-path'],
    ['/walk', 'invalid-path'],
    ['animationTable', 'reserved-name'],
    ['ANIMATIONTABLE.json', 'reserved-name'],
  ])('拒绝无法直接对应到文件的动画名 %s', (name, error) => {
    expect(resolveAnimationReference(GAME_PATH, name)).toEqual({ ok: false, error })
  })
})

describe('resolveAnimationNameFromPath', () => {
  it('从动画文件路径反推动画名', () => {
    expect(
      resolveAnimationNameFromPath(GAME_PATH, AbsPath.from('/games/demo/game/animation/walk/fade.json')),
    ).toBe('walk/fade')
  })

  it('不属于 game/animation 或不是 json 的路径无法反推', () => {
    expect(resolveAnimationNameFromPath(GAME_PATH, AbsPath.from('/games/demo/game/animation/fade.txt'))).toBeUndefined()
    expect(resolveAnimationNameFromPath(GAME_PATH, AbsPath.from('/games/demo/game/scene/start.txt'))).toBeUndefined()
    expect(resolveAnimationNameFromPath(GAME_PATH, AbsPath.from('/games/demo/game/animation/animationTable.json'))).toBeUndefined()
  })
})
