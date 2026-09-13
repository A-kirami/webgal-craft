import { describe, expect, it } from 'vitest'

import { AbsPath } from '~/domain/path'

import {
  isSceneEntryPath,
  resolveSceneEntryStatus,
} from '../entry-point'

const sceneRoot = AbsPath.from('/games/demo/game/scene')

describe('scene entry point', () => {
  it('只保护场景根目录下 start.txt 的大小写变体', () => {
    expect(isSceneEntryPath(AbsPath.from('/games/demo/game/scene/start.txt'), sceneRoot)).toBe(true)
    expect(isSceneEntryPath(AbsPath.from('/GAMES/DEMO/GAME/SCENE/Start.TXT'), sceneRoot)).toBe(true)
    expect(isSceneEntryPath(AbsPath.from('/games/demo/game/scene/chapter/start.txt'), sceneRoot)).toBe(false)
  })

  it('将大小写变体同样视为可用入口', () => {
    expect(resolveSceneEntryStatus(['Start.txt'])).toBe('valid')
    expect(resolveSceneEntryStatus(['start.txt'])).toBe('valid')
    expect(resolveSceneEntryStatus(['prologue.txt', 'chapter'])).toBe('missing')
  })
})
