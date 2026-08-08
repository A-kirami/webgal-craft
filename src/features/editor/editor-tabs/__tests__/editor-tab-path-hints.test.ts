import { describe, expect, it } from 'vitest'

import { AbsPath } from '~/domain/path'

import { getEditorTabPathHints } from '../editor-tab-path-hints'

function createTab(name: string, path: string) {
  return {
    name,
    path: AbsPath.from(path),
  }
}

describe('getEditorTabPathHints', () => {
  it('没有同名标签页时不添加路径提示', () => {
    const tabs = [
      createTab('scene.txt', '/game/scenes/scene.txt'),
      createTab('config.json', '/game/config.json'),
    ]

    expect(getEditorTabPathHints(tabs).size).toBe(0)
  })

  it('只显示足以区分同名标签页的最近父目录', () => {
    const firstPath = AbsPath.from('/game/scenes/scene.txt')
    const secondPath = AbsPath.from('/game/assets/scene.txt')

    const hints = getEditorTabPathHints([
      createTab('scene.txt', firstPath),
      createTab('scene.txt', secondPath),
    ])

    expect(hints.get(firstPath)).toBe('scenes')
    expect(hints.get(secondPath)).toBe('assets')
  })

  it('父路径互为后缀时会继续追加上级目录直到产生差异', () => {
    const firstPath = AbsPath.from('/game/route-a/scene.txt')
    const secondPath = AbsPath.from('/game/deep/route-a/scene.txt')

    const hints = getEditorTabPathHints([
      createTab('scene.txt', firstPath),
      createTab('scene.txt', secondPath),
    ])

    expect(hints.get(firstPath)).toBe('game/route-a')
    expect(hints.get(secondPath)).toBe('deep/route-a')
  })

  it('最近父目录也相同时会保留共享目录之后的最短路径', () => {
    const firstPath = AbsPath.from('/game/route-a/shared/scene.txt')
    const secondPath = AbsPath.from('/game/route-b/shared/scene.txt')

    const hints = getEditorTabPathHints([
      createTab('scene.txt', firstPath),
      createTab('scene.txt', secondPath),
    ])

    expect(hints.get(firstPath)).toBe('route-a/shared')
    expect(hints.get(secondPath)).toBe('route-b/shared')
  })

  it('根目录文件会使用根标识参与路径区分', () => {
    const rootPath = AbsPath.from('/scene.txt')
    const nestedPath = AbsPath.from('/game/scene.txt')

    const hints = getEditorTabPathHints([
      createTab('scene.txt', rootPath),
      createTab('scene.txt', nestedPath),
    ])

    expect(hints.get(rootPath)).toBe('/')
    expect(hints.get(nestedPath)).toBe('game')
  })
})
