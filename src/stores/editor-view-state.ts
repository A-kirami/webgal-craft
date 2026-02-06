import { defineStore } from 'pinia'

import type * as monaco from 'monaco-editor'

/**
 * Monaco 的 ICodeEditorViewState 包含 Selection/Range 等类实例，
 * 无法直接 JSON 序列化到 localStorage，因此需要提取为纯对象
 */
interface SerializableViewState {
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

export const useEditorViewStateStore = defineStore(
  'editor-view-state',
  () => {
    const projectViewStatesMap = $ref<Record<string, ProjectViewStates>>({})

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

    function saveViewState(filePath: string, viewState: monaco.editor.ICodeEditorViewState | null) {
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

    function getViewState(filePath: string): monaco.editor.ICodeEditorViewState | undefined {
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

    function removeViewState(filePath: string) {
      if (!currentProjectId) {
        return
      }

      const projectStates = projectViewStatesMap[currentProjectId]
      if (!projectStates) {
        return
      }

      delete projectStates[filePath]
    }

    function renameViewState(oldPath: string, newPath: string) {
      if (!currentProjectId) {
        return
      }

      const projectStates = projectViewStatesMap[currentProjectId]
      if (!projectStates || !projectStates[oldPath]) {
        return
      }

      projectStates[newPath] = projectStates[oldPath]
      delete projectStates[oldPath]
    }

    function clearCurrentProjectStates() {
      if (currentProjectId) {
        delete projectViewStatesMap[currentProjectId]
      }
    }

    return $$({
      projectViewStatesMap,
      saveViewState,
      getViewState,
      removeViewState,
      renameViewState,
      clearCurrentProjectStates,
    })
  },
  {
    persist: true,
  },
)
