import '~/__tests__/setup'

import { beforeEach, describe, expect, it } from 'vitest'

import { useEditorUIStateStore } from '~/stores/editor-ui-state'

describe('useEditorUIStateStore', () => {
  let store: ReturnType<typeof useEditorUIStateStore>

  beforeEach(() => {
    store = useEditorUIStateStore()
    store.fileTreeExpanded = {}
    store.fileTreeScrollPositions = {}
  })

  it('按 gameId 和 treeName 读写文件树展开状态', () => {
    expect(store.getFileTreeExpanded('game-1', 'scene')).toEqual([])

    store.setFileTreeExpanded('game-1', 'scene', ['root', 'scene'])
    store.setFileTreeExpanded('game-1', 'asset', ['background'])

    expect(store.getFileTreeExpanded('game-1', 'scene')).toEqual(['root', 'scene'])
    expect(store.getFileTreeExpanded('game-1', 'asset')).toEqual(['background'])
  })

  it('cleanupGame 只清理对应游戏的 UI 状态', () => {
    store.setFileTreeExpanded('game-1', 'scene', ['root'])
    store.setFileTreeExpanded('game-2', 'scene', ['other'])
    store.setFileTreeScrollPosition('game-1', 'scene', { left: 0, top: 120 })
    store.setFileTreeScrollPosition('game-2', 'scene', { left: 8, top: 240 })

    store.cleanupGame('game-1')

    expect(store.fileTreeExpanded).toEqual({
      'game-2': {
        scene: ['other'],
      },
    })
    expect(store.fileTreeScrollPositions).toEqual({
      'game-2': {
        scene: {
          left: 8,
          top: 240,
        },
      },
    })
  })

  it('按 gameId 和 treeName 读写文件树滚动位置', () => {
    expect(store.getFileTreeScrollPosition('game-1', 'scene')).toBeUndefined()

    store.setFileTreeScrollPosition('game-1', 'scene', { left: 0, top: 120 })
    store.setFileTreeScrollPosition('game-1', 'asset', { left: 24, top: 0 })

    expect(store.getFileTreeScrollPosition('game-1', 'scene')).toEqual({
      left: 0,
      top: 120,
    })
    expect(store.getFileTreeScrollPosition('game-1', 'asset')).toEqual({
      left: 24,
      top: 0,
    })
  })
})
