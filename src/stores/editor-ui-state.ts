import { defineStore } from 'pinia'

/**
 * 编辑器 UI 状态 Store
 * 用于持久化项目级别的 UI 状态，如文件树展开状态等
 */
export const useEditorUIStateStore = defineStore(
  'editor-ui-state',
  () => {
    // 文件树展开状态：{ [gameId]: { [treeName]: expandedKeys[] } }
    const fileTreeExpanded = $ref<Record<string, Record<string, string[]>>>({})

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
     * 清理指定游戏的所有 UI 状态
     * @param gameId 游戏项目 ID
     */
    function cleanupGame(gameId: string) {
      delete fileTreeExpanded[gameId]
    }

    return $$({
      fileTreeExpanded,
      // 文件树展开状态
      getFileTreeExpanded,
      setFileTreeExpanded,
      // 清理
      cleanupGame,
    })
  },
  {
    persist: true, // 自动持久化到 localStorage
  },
)
