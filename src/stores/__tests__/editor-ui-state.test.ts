import '~/__tests__/setup'

import { beforeEach, describe, expect, it } from 'vitest'

import { useEditorUIStateStore } from '~/stores/editor-ui-state'

describe('编辑器界面状态仓库', () => {
  let store: ReturnType<typeof useEditorUIStateStore>

  beforeEach(() => {
    store = useEditorUIStateStore()
    store.fileTreeExpanded = {}
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

    store.cleanupGame('game-1')

    expect(store.fileTreeExpanded).toEqual({
      'game-2': {
        scene: ['other'],
      },
    })
  })
})
