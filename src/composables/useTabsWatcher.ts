/**
 * 监听标签页关闭事件的 composable
 *
 * 用于检测标签页的关闭并执行清理操作
 */
export function useTabsWatcher(onTabClosed: (path: string) => void) {
  const tabsStore = useTabsStore()
  let previousTabPaths = new Set<string>()

  watch(() => tabsStore.tabs.map(t => t.path), (currentPaths) => {
    const currentPathsSet = new Set(currentPaths)

    // 找出被关闭的标签页（在之前存在，现在不存在）
    for (const oldPath of previousTabPaths) {
      if (!currentPathsSet.has(oldPath)) {
        onTabClosed(oldPath)
      }
    }

    previousTabPaths = currentPathsSet
  }, { immediate: true })
}
