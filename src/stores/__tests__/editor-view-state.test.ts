import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useEditorViewStateStore } from '../editor-view-state'

import type { SerializableViewState } from '../editor-view-state'

const workspaceStoreState = {
  currentGame: {
    id: 'game-1',
  },
}

vi.mock('~/stores/workspace', () => ({
  useWorkspaceStore: () => workspaceStoreState,
}))

function createViewState(lineNumber: number, scrollTop: number): SerializableViewState {
  return {
    contributionsState: {},
    cursorState: [{
      inSelectionMode: false,
      position: {
        column: 1,
        lineNumber,
      },
      selectionStart: {
        column: 1,
        lineNumber,
      },
    }],
    viewState: {
      firstPosition: {
        column: 1,
        lineNumber,
      },
      firstPositionDeltaTop: 0,
      scrollLeft: 0,
      scrollTop,
    },
  }
}

describe('useEditorViewStateStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    globalThis.localStorage?.clear()
    globalThis.sessionStorage?.clear()
  })

  it('目录重命名时会把持久化与会话恢复视图状态一起迁移到新路径', () => {
    const store = useEditorViewStateStore()
    const oldRoot = '/game/scene'
    const newRoot = '/game/story'
    const oldPath = '/game/scene/chapter/start.txt'
    const newPath = '/game/story/chapter/start.txt'

    const persistentViewState = createViewState(3, 240)
    const sessionRecoveryViewState = createViewState(5, 480)

    store.projectViewStatesMap[workspaceStoreState.currentGame.id] = {
      [oldPath]: persistentViewState,
    }
    store.sessionRecoveryViewStatesMap[workspaceStoreState.currentGame.id] = {
      [oldPath]: sessionRecoveryViewState,
    }

    store.rebaseViewStatesForDirectoryRename(oldRoot, newRoot)

    expect(store.projectViewStatesMap[workspaceStoreState.currentGame.id]?.[oldPath]).toBeUndefined()
    expect(store.sessionRecoveryViewStatesMap[workspaceStoreState.currentGame.id]?.[oldPath]).toBeUndefined()
    expect(store.projectViewStatesMap[workspaceStoreState.currentGame.id]?.[newPath]).toEqual(persistentViewState)
    expect(store.sessionRecoveryViewStatesMap[workspaceStoreState.currentGame.id]?.[newPath]).toEqual(sessionRecoveryViewState)
  })
})
