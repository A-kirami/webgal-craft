export interface ClipboardItem {
  path: string
  isDir: boolean
  isCut: boolean
}

// 全局存储不同 key 的剪贴板状态
const clipboardStore = new Map<string, ReturnType<typeof createClipboardState>>()

/**
 * 创建单个剪贴板状态
 */
function createClipboardState() {
  // 支持多选：使用数组存储多个文件/文件夹
  const clipboard = ref<ClipboardItem[]>([])

  /**
   * 设置剪贴板内容（支持单个或多个项目）
   * 新操作会覆盖之前的剪贴板内容，确保操作状态统一
   */
  function setClipboard(items: ClipboardItem | ClipboardItem[]) {
    clipboard.value = Array.isArray(items) ? items : [items]
  }

  /**
   * 清空剪贴板
   */
  function clearClipboard() {
    clipboard.value = []
  }

  /**
   * 检查剪贴板是否有内容
   */
  const hasClipboard = computed(() => clipboard.value.length > 0)

  /**
   * 获取剪贴板中的操作类型（cut 或 copy）
   * 由于新操作会覆盖旧内容，操作类型始终是统一的
   * 如果剪贴板为空，返回 undefined
   */
  const operationType = computed((): 'cut' | 'copy' | undefined => {
    if (clipboard.value.length === 0) {
      return
    }
    // 由于新操作会覆盖旧内容，所有项目的操作类型都是统一的
    return clipboard.value[0].isCut ? 'cut' : 'copy'
  })

  /**
   * 检查是否可以执行粘贴操作
   * 只需要剪贴板有内容即可（操作类型始终是统一的）
   */
  const canPaste = computed(() => hasClipboard.value)

  return {
    clipboard: readonly(clipboard),
    hasClipboard,
    operationType,
    canPaste,
    setClipboard,
    clearClipboard,
  }
}

/**
 * 文件剪贴板 Composable
 * 使用 createGlobalState 在多个组件实例间共享文件/文件夹的复制粘贴状态
 *
 * @param key 剪贴板的唯一标识符，用于分离不同的使用场景（如 'file-tree'、'file-manager'）
 *            默认为 'default'，相同 key 的组件实例会共享同一个剪贴板状态
 * @returns 剪贴板状态和方法
 */
export function useFileClipboard(key: string = 'default') {
  // 如果该 key 的状态不存在，创建一个新的
  if (!clipboardStore.has(key)) {
    clipboardStore.set(key, createClipboardState())
  }

  return clipboardStore.get(key)!
}
