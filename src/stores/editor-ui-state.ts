import { defineStore } from 'pinia'

export interface FileTreeScrollPosition {
  left: number
  top: number
}

/**
 * 编辑器 UI 状态 Store
 * 用于持久化项目级别的 UI 状态，如文件树展开状态等
 */
export const useEditorUIStateStore = defineStore(
  'editor-ui-state',
  () => {
    // 文件树展开状态：{ [gameId]: { [treeName]: expandedKeys[] } }
    const fileTreeExpanded = $ref<Record<string, Record<string, string[]>>>({})
    // 文件树滚动位置：{ [gameId]: { [treeName]: { left, top } } }
    const fileTreeScrollPositions = $ref<Record<string, Record<string, FileTreeScrollPosition>>>({})

    /**
     * 获取文件树展开状态
     * @param gameId 游戏项目 ID
     * @param treeName 文件树名称（如 'scene', 'asset' 等）
     * @returns 展开的节点 key 数组
     */
    function getFileTreeExpanded(gameId: string, treeName: string): string[] {
      return fileTreeExpanded[gameId]?.[treeName] || []
    }

    /**
     * 设置文件树展开状态
     * @param gameId 游戏项目 ID
     * @param treeName 文件树名称
     * @param keys 展开的节点 key 数组
     */
    function setFileTreeExpanded(gameId: string, treeName: string, keys: string[]) {
      if (!fileTreeExpanded[gameId]) {
        fileTreeExpanded[gameId] = {}
      }
      fileTreeExpanded[gameId][treeName] = keys
    }

    /**
     * 获取文件树滚动位置
     * @param gameId 游戏项目 ID
     * @param treeName 文件树名称
     * @returns 文件树滚动位置
     */
    function getFileTreeScrollPosition(gameId: string, treeName: string): FileTreeScrollPosition | undefined {
      return fileTreeScrollPositions[gameId]?.[treeName]
    }

    /**
     * 设置文件树滚动位置
     * @param gameId 游戏项目 ID
     * @param treeName 文件树名称
     * @param position 文件树滚动位置
     */
    function setFileTreeScrollPosition(gameId: string, treeName: string, position: FileTreeScrollPosition) {
      if (!fileTreeScrollPositions[gameId]) {
        fileTreeScrollPositions[gameId] = {}
      }
      fileTreeScrollPositions[gameId][treeName] = position
    }

    /**
     * 清理指定游戏的所有 UI 状态
     * @param gameId 游戏项目 ID
     */
    function cleanupGame(gameId: string) {
      delete fileTreeExpanded[gameId]
      delete fileTreeScrollPositions[gameId]
    }

    return $$({
      fileTreeExpanded,
      fileTreeScrollPositions,
      // 文件树展开状态
      getFileTreeExpanded,
      setFileTreeExpanded,
      // 文件树滚动位置
      getFileTreeScrollPosition,
      setFileTreeScrollPosition,
      // 清理
      cleanupGame,
    })
  },
  {
    persist: true, // 自动持久化到 localStorage
  },
)
