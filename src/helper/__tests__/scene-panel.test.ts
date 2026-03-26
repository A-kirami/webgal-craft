import { describe, expect, it, vi } from 'vitest'

import {
  findScenePanelNodeByPath,
  loadScenePanelTreeNodes,
  resolveScenePanelTargetPath,
} from '../scene-panel'

interface TestFolderItem {
  id: string
  isDir: boolean
  name: string
  path: string
}

describe('场景面板辅助函数', () => {
  it('递归读取目录内容并保留目录层级', async () => {
    const entries = new Map<string, TestFolderItem[]>([
      ['/games/demo/game/scene', [
        {
          id: 'start',
          isDir: false,
          name: 'start.txt',
          path: '/games/demo/game/scene/start.txt',
        },
        {
          id: 'chapter',
          isDir: true,
          name: 'chapter-1',
          path: '/games/demo/game/scene/chapter-1',
        },
      ]],
      ['/games/demo/game/scene/chapter-1', [
        {
          id: 'branch',
          isDir: false,
          name: 'branch.txt',
          path: '/games/demo/game/scene/chapter-1/branch.txt',
        },
      ]],
    ])
    const getFolderContents = vi.fn(async (path: string) => entries.get(path) ?? [])

    await expect(loadScenePanelTreeNodes('/games/demo/game/scene', getFolderContents)).resolves.toEqual([
      {
        id: 'start',
        name: 'start.txt',
        path: '/games/demo/game/scene/start.txt',
      },
      {
        children: [
          {
            id: 'branch',
            name: 'branch.txt',
            path: '/games/demo/game/scene/chapter-1/branch.txt',
          },
        ],
        id: 'chapter',
        name: 'chapter-1',
        path: '/games/demo/game/scene/chapter-1',
      },
    ])

    expect(getFolderContents.mock.calls.map(([path]) => path)).toEqual([
      '/games/demo/game/scene',
      '/games/demo/game/scene/chapter-1',
    ])
  })

  it('按路径查找树节点时会返回嵌套文件并忽略不存在的路径', () => {
    const nodes = [
      {
        id: 'start',
        name: 'start.txt',
        path: '/games/demo/game/scene/start.txt',
      },
      {
        children: [
          {
            id: 'branch',
            name: 'branch.txt',
            path: '/games/demo/game/scene/chapter-1/branch.txt',
          },
        ],
        id: 'chapter',
        name: 'chapter-1',
        path: '/games/demo/game/scene/chapter-1',
      },
    ]

    expect(findScenePanelNodeByPath(nodes, '/games/demo/game/scene/chapter-1/branch.txt')).toEqual({
      id: 'branch',
      name: 'branch.txt',
      path: '/games/demo/game/scene/chapter-1/branch.txt',
    })
    expect(findScenePanelNodeByPath(nodes, '/games/demo/game/scene/missing.txt')).toBeUndefined()
  })

  it('新建目标路径会在根目录、目录自身和文件父目录之间切换', async () => {
    const dirname = vi.fn(async (path: string) => path.replace(/[\\/][^\\/]+$/, ''))

    await expect(resolveScenePanelTargetPath('/games/demo/game/scene', undefined, dirname)).resolves.toBe('/games/demo/game/scene')
    await expect(resolveScenePanelTargetPath('/games/demo/game/scene', {
      children: [],
      id: 'chapter',
      name: 'chapter-1',
      path: '/games/demo/game/scene/chapter-1',
    }, dirname)).resolves.toBe('/games/demo/game/scene/chapter-1')
    await expect(resolveScenePanelTargetPath('/games/demo/game/scene', {
      id: 'start',
      name: 'start.txt',
      path: '/games/demo/game/scene/start.txt',
    }, dirname)).resolves.toBe('/games/demo/game/scene')
    await expect(resolveScenePanelTargetPath(undefined, undefined, dirname)).resolves.toBeUndefined()

    expect(dirname).toHaveBeenCalledOnce()
    expect(dirname).toHaveBeenCalledWith('/games/demo/game/scene/start.txt')
  })
})
