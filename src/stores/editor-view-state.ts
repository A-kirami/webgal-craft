import { defineStore } from 'pinia'

import { useWorkspaceStore } from '~/stores/workspace'

import type * as monaco from 'monaco-editor'
import type { StorageLike } from 'pinia-plugin-persistedstate'

/**
 * Monaco 的 ICodeEditorViewState 包含 Selection/Range 等类实例，
 * 无法直接 JSON 序列化到 localStorage，因此需要提取为纯对象
 */
export interface SerializableViewState {
  cursorState: {
    inSelectionMode: boolean
    selectionStart: {
      lineNumber: number
      column: number
    }
    position: {
      lineNumber: number
      column: number
    }
  }[]
  viewState: {
    scrollLeft: number
    scrollTop: number
    firstPosition: {
      lineNumber: number
      column: number
    }
    firstPositionDeltaTop: number
  }
  contributionsState: Record<string, unknown>
}

type ProjectViewStates = Record<string, SerializableViewState>

const noopStorage: StorageLike = {
  getItem() {
    // eslint-disable-next-line unicorn/no-null -- StorageLike 遵循 Web Storage 约定，缺失值需要返回 null。
    return null
  },
  setItem() {
    void 0
  },
}

const sessionRecoveryStorage: StorageLike = globalThis.sessionStorage === undefined
  ? noopStorage
  : globalThis.sessionStorage

export const useEditorViewStateStore = defineStore(
  'editor-view-state',
  () => {
    const projectViewStatesMap = $ref<Record<string, ProjectViewStates>>({})
    const sessionRecoveryViewStatesMap = $ref<Record<string, ProjectViewStates>>({})

    const workspaceStore = useWorkspaceStore()
    const currentProjectId = $computed(() => workspaceStore.currentGame?.id ?? '')

    function serializeViewState(
      viewState: monaco.editor.ICodeEditorViewState | null,
    ): SerializableViewState | undefined {
      if (!viewState) {
        return
      }

      try {
        return {
          cursorState: viewState.cursorState.map(cursor => ({
            inSelectionMode: cursor.inSelectionMode,
            selectionStart: {
              lineNumber: cursor.selectionStart.lineNumber,
              column: cursor.selectionStart.column,
            },
            position: {
              lineNumber: cursor.position.lineNumber,
              column: cursor.position.column,
            },
          })),
          viewState: {
            scrollLeft: viewState.viewState.scrollLeft,
            scrollTop: viewState.viewState.scrollTop ?? 0,
            firstPosition: {
              lineNumber: viewState.viewState.firstPosition.lineNumber,
              column: viewState.viewState.firstPosition.column,
            },
            firstPositionDeltaTop: viewState.viewState.firstPositionDeltaTop,
          },
          contributionsState: viewState.contributionsState,
        }
      } catch (error) {
        logger.error(`序列化编辑器视图状态失败: ${error}`)
        return
      }
    }

    function deserializeViewState(
      serialized: SerializableViewState | undefined,
    ): monaco.editor.ICodeEditorViewState | undefined {
      if (!serialized) {
        return
      }

      try {
        return {
          cursorState: serialized.cursorState.map(cursor => ({
            inSelectionMode: cursor.inSelectionMode,
            selectionStart: {
              lineNumber: cursor.selectionStart.lineNumber,
              column: cursor.selectionStart.column,
            },
            position: {
              lineNumber: cursor.position.lineNumber,
              column: cursor.position.column,
            },
          })),
          viewState: {
            scrollLeft: serialized.viewState.scrollLeft,
            scrollTop: serialized.viewState.scrollTop,
            firstPosition: {
              lineNumber: serialized.viewState.firstPosition.lineNumber,
              column: serialized.viewState.firstPosition.column,
            },
            firstPositionDeltaTop: serialized.viewState.firstPositionDeltaTop,
          },
          contributionsState: serialized.contributionsState,
        } as monaco.editor.ICodeEditorViewState
      } catch (error) {
        logger.error(`反序列化编辑器视图状态失败: ${error}`)
        return
      }
    }

    function savePersistentViewState(filePath: string, viewState: monaco.editor.ICodeEditorViewState | null) {
      if (!currentProjectId) {
        return
      }

      const serialized = serializeViewState(viewState)
      if (!serialized) {
        return
      }

      if (!projectViewStatesMap[currentProjectId]) {
        projectViewStatesMap[currentProjectId] = {}
      }

      projectViewStatesMap[currentProjectId][filePath] = serialized
    }

    function getPersistentViewState(filePath: string): monaco.editor.ICodeEditorViewState | undefined {
      if (!currentProjectId) {
        return
      }

      const projectStates = projectViewStatesMap[currentProjectId]
      if (!projectStates) {
        return
      }

      const serialized = projectStates[filePath]
      return deserializeViewState(serialized)
    }

    function saveSessionRecoveryViewState(filePath: string, viewState: monaco.editor.ICodeEditorViewState | null) {
      if (!currentProjectId) {
        return
      }

      const serialized = serializeViewState(viewState)
      if (!serialized) {
        return
      }

      if (!sessionRecoveryViewStatesMap[currentProjectId]) {
        sessionRecoveryViewStatesMap[currentProjectId] = {}
      }

      sessionRecoveryViewStatesMap[currentProjectId][filePath] = serialized
    }

    function consumeSessionRecoveryViewState(filePath: string): monaco.editor.ICodeEditorViewState | undefined {
      if (!currentProjectId) {
        return
      }

      const projectStates = sessionRecoveryViewStatesMap[currentProjectId]
      if (!projectStates) {
        return
      }

      const serialized = projectStates[filePath]
      if (!serialized) {
        return
      }

      delete projectStates[filePath]
      return deserializeViewState(serialized)
    }

    function updatePrimaryCursorLine(filePath: string, lineNumber: number) {
      if (!currentProjectId || !Number.isFinite(lineNumber) || lineNumber < 1) {
        return
      }

      if (!projectViewStatesMap[currentProjectId]) {
        projectViewStatesMap[currentProjectId] = {}
      }

      const projectStates = projectViewStatesMap[currentProjectId]
      const currentState = projectStates[filePath]
      const nextLineNumber = Math.trunc(lineNumber)

      if (currentState) {
        const firstCursor = currentState.cursorState[0]
        if (firstCursor) {
          firstCursor.selectionStart.lineNumber = nextLineNumber
          firstCursor.position.lineNumber = nextLineNumber
        } else {
          currentState.cursorState = [{
            inSelectionMode: false,
            selectionStart: { lineNumber: nextLineNumber, column: 1 },
            position: { lineNumber: nextLineNumber, column: 1 },
          }]
        }

        currentState.viewState.firstPosition.lineNumber = nextLineNumber
        return
      }

      projectStates[filePath] = {
        cursorState: [{
          inSelectionMode: false,
          selectionStart: { lineNumber: nextLineNumber, column: 1 },
          position: { lineNumber: nextLineNumber, column: 1 },
        }],
        viewState: {
          scrollLeft: 0,
          scrollTop: 0,
          firstPosition: { lineNumber: nextLineNumber, column: 1 },
          firstPositionDeltaTop: 0,
        },
        contributionsState: {},
      }
    }

    function removeViewState(filePath: string) {
      if (!currentProjectId) {
        return
      }

      const projectStates = projectViewStatesMap[currentProjectId]
      if (!projectStates) {
        delete sessionRecoveryViewStatesMap[currentProjectId]?.[filePath]
        return
      }

      delete projectStates[filePath]
      delete sessionRecoveryViewStatesMap[currentProjectId]?.[filePath]
    }

    function renameViewState(oldPath: string, newPath: string) {
      if (!currentProjectId) {
        return
      }

      const projectStates = projectViewStatesMap[currentProjectId]
      if (projectStates?.[oldPath]) {
        projectStates[newPath] = projectStates[oldPath]
        delete projectStates[oldPath]
      }

      const recoveryStates = sessionRecoveryViewStatesMap[currentProjectId]
      if (recoveryStates?.[oldPath]) {
        recoveryStates[newPath] = recoveryStates[oldPath]
        delete recoveryStates[oldPath]
      }
    }

    function clearCurrentProjectStates() {
      if (currentProjectId) {
        delete projectViewStatesMap[currentProjectId]
        delete sessionRecoveryViewStatesMap[currentProjectId]
      }
    }

    return $$({
      projectViewStatesMap,
      sessionRecoveryViewStatesMap,
      savePersistentViewState,
      getPersistentViewState,
      saveSessionRecoveryViewState,
      consumeSessionRecoveryViewState,
      updatePrimaryCursorLine,
      removeViewState,
      renameViewState,
      clearCurrentProjectStates,
    })
  },
  {
    persist: [
      {
        pick: ['projectViewStatesMap'],
      },
      {
        key: 'editor-view-state-session-recovery',
        pick: ['sessionRecoveryViewStatesMap'],
        storage: sessionRecoveryStorage,
      },
    ],
  },
)
