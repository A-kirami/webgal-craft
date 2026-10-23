import { describe, expect, it } from 'vitest'

import { AbsPath } from '~/domain/path'

import { resolveDroppedSceneRef } from '../flowchart-scene'

const sceneRoot = AbsPath.from('/games/demo/game/scene')

function payload(path: string, options: { isDir?: boolean, items?: { isDir: boolean, path: string }[] } = {}) {
  return {
    isDir: options.isDir ?? false,
    items: options.items,
    path,
    source: 'file-tree' as const,
    type: 'file-system-item' as const,
  }
}

describe('resolveDroppedSceneRef', () => {
  it('接受场景目录下的单个 txt 文件并返回相对场景引用', () => {
    expect(resolveDroppedSceneRef(payload('/games/demo/game/scene/chapter/开场.txt'), sceneRoot))
      .toBe('chapter/开场.txt')
  })

  it('拒绝目录与非 txt 文件', () => {
    expect(resolveDroppedSceneRef(payload('/games/demo/game/scene', { isDir: true }), sceneRoot)).toBeUndefined()
    expect(resolveDroppedSceneRef(payload('/games/demo/game/scene/background/bg.png'), sceneRoot)).toBeUndefined()
  })

  it('拒绝多选与场景目录之外的路径', () => {
    expect(resolveDroppedSceneRef(payload('/games/demo/game/scene/a.txt', {
      items: [
        { isDir: false, path: '/games/demo/game/scene/a.txt' },
        { isDir: false, path: '/games/demo/game/scene/b.txt' },
      ],
    }), sceneRoot)).toBeUndefined()

    expect(resolveDroppedSceneRef(payload('/games/demo/game/background/a.txt'), sceneRoot)).toBeUndefined()
  })
})
