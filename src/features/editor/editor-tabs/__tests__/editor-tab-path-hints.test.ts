import { describe, expect, it } from 'vitest'

import { AbsPath } from '~/domain/path'

import { getEditorTabPathHints, getEditorTabResourceRootPath } from '../editor-tab-path-hints'

function createTab(name: string, path: string, resourceRootPath?: string) {
  return {
    name,
    path: AbsPath.from(path),
    resourceRootPath: resourceRootPath ? AbsPath.from(resourceRootPath) : undefined,
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

    expect(hints.get(firstPath)).toBe('.../scenes')
    expect(hints.get(secondPath)).toBe('.../assets')
  })

  it('父路径互为后缀时会继续追加上级目录直到产生差异', () => {
    const firstPath = AbsPath.from('/game/route-a/scene.txt')
    const secondPath = AbsPath.from('/game/deep/route-a/scene.txt')

    const hints = getEditorTabPathHints([
      createTab('scene.txt', firstPath),
      createTab('scene.txt', secondPath),
    ])

    expect(hints.get(firstPath)).toBe('.../game/route-a')
    expect(hints.get(secondPath)).toBe('.../deep/route-a')
  })

  it('最近父目录也相同时会保留共享目录之后的最短路径', () => {
    const firstPath = AbsPath.from('/game/route-a/shared/scene.txt')
    const secondPath = AbsPath.from('/game/route-b/shared/scene.txt')

    const hints = getEditorTabPathHints([
      createTab('scene.txt', firstPath),
      createTab('scene.txt', secondPath),
    ])

    expect(hints.get(firstPath)).toBe('.../route-a/shared')
    expect(hints.get(secondPath)).toBe('.../route-b/shared')
  })

  it('根目录文件会使用根标识参与路径区分', () => {
    const rootPath = AbsPath.from('/scene.txt')
    const nestedPath = AbsPath.from('/game/scene.txt')

    const hints = getEditorTabPathHints([
      createTab('scene.txt', rootPath),
      createTab('scene.txt', nestedPath),
    ])

    expect(hints.get(rootPath)).toBe('./')
    expect(hints.get(nestedPath)).toBe('.../game')
  })

  it('根目录路径提示只保留一个根分隔符', () => {
    const firstPath = AbsPath.from('/game/scene.txt')
    const secondPath = AbsPath.from('/other/game/scene.txt')

    const hints = getEditorTabPathHints([
      createTab('scene.txt', firstPath),
      createTab('scene.txt', secondPath),
    ])

    expect(hints.get(firstPath)).toBe('/game')
    expect(hints.get(secondPath)).toBe('.../other/game')
  })

  it('同一资源根内使用相对资源根的最短路径提示', () => {
    const resourceRootPath = '/project/game/scene'
    const rootPath = AbsPath.from(`${resourceRootPath}/scene.txt`)
    const nestedPath = AbsPath.from(`${resourceRootPath}/chapter-a/scene.txt`)

    const hints = getEditorTabPathHints([
      createTab('scene.txt', rootPath, resourceRootPath),
      createTab('scene.txt', nestedPath, resourceRootPath),
    ])

    expect(hints.get(rootPath)).toBe('./')
    expect(hints.get(nestedPath)).toBe('chapter-a')
  })

  it('跨资源根时保留资源类型目录名', () => {
    const scenePath = AbsPath.from('/project/game/scene/chapter-a/scene.txt')
    const backgroundPath = AbsPath.from('/project/game/background/chapter-a/scene.txt')

    const hints = getEditorTabPathHints([
      createTab('scene.txt', scenePath, '/project/game/scene'),
      createTab('scene.txt', backgroundPath, '/project/game/background'),
    ])

    expect(hints.get(scenePath)).toBe('scene')
    expect(hints.get(backgroundPath)).toBe('background')
  })
})

describe('getEditorTabResourceRootPath', () => {
  const gamePath = AbsPath.from('/project')

  it('将场景文件归入 game/scene 根目录', () => {
    expect(getEditorTabResourceRootPath(AbsPath.from('/project/game/scene/chapter-a/start.txt'), gamePath))
      .toBe('/project/game/scene')
  })

  it('将资产文件归入对应的 game 资源类型根目录', () => {
    expect(getEditorTabResourceRootPath(AbsPath.from('/project/game/background/chapter-a/start.png'), gamePath))
      .toBe('/project/game/background')
  })

  it('路径不属于当前项目时不设置资源根目录', () => {
    expect(getEditorTabResourceRootPath(AbsPath.from('/other-project/game/scene/start.txt'), gamePath))
      .toBeUndefined()
  })
})
