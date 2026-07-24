import type { ModelRef } from 'vue'
import type { Game } from '~/database/model'

interface DeleteCheckResult {
  associatedGames?: Game[]
  canDelete?: boolean
  uncheckedGames?: Game[]
}

interface UseDeleteConfirmationOptions {
  /** 控制对话框开关的 v-model ref */
  open: ModelRef<boolean | undefined>
  /** 返回用于监听变化的标识符（如 engine.id、groupName） */
  identifier: () => unknown
  /** 检查是否可删除，返回阻止删除的原因和游戏列表 */
  checkDelete: () => Promise<DeleteCheckResult>
  /** 执行实际删除操作 */
  performDelete: () => Promise<void>
  /** 删除失败时的兜底错误信息 */
  fallbackErrorMessage: () => string
  /** 删除检查失败时的日志前缀 */
  logPrefix: string
  /** 执行删除失败时的日志前缀 */
  deleteLogPrefix: string
}

export function useDeleteConfirmation(options: UseDeleteConfirmationOptions) {
  let associatedGames = $ref<Game[]>([])
  let uncheckedGames = $ref<Game[]>([])
  let canDelete = $ref(true)
  let isCheckingDelete = $ref(false)
  let isDeleting = $ref(false)
  let checkRequestId = 0

  const isDeleteBlocked = $computed(() => !canDelete || associatedGames.length > 0 || uncheckedGames.length > 0)
  const isConfirmDisabled = $computed(() => isCheckingDelete || isDeleteBlocked || isDeleting)

  async function loadDeleteCheck(): Promise<void> {
    const requestId = ++checkRequestId
    isCheckingDelete = true
    try {
      const result = await options.checkDelete()
      if (requestId !== checkRequestId) {
        return
      }
      associatedGames = result.associatedGames ?? []
      uncheckedGames = result.uncheckedGames ?? []
      canDelete = result.canDelete ?? (associatedGames.length === 0 && uncheckedGames.length === 0)
    } catch (error) {
      if (requestId !== checkRequestId) {
        return
      }
      associatedGames = []
      uncheckedGames = []
      canDelete = false
      logger.error(`${options.logPrefix}: ${error}`)
    } finally {
      if (requestId === checkRequestId) {
        isCheckingDelete = false
      }
    }
  }

  watch(() => [options.open.value, options.identifier()], ([isOpen]) => {
    if (!isOpen) {
      checkRequestId++
      associatedGames = []
      uncheckedGames = []
      canDelete = true
      isCheckingDelete = false
      return
    }

    void loadDeleteCheck()
  }, { immediate: true })

  function handleConfirm() {
    if (isConfirmDisabled) {
      return
    }

    isDeleting = true
    options.performDelete()
      .then(() => {
        options.open.value = false
      })
      .catch((error) => {
        logger.error(`${options.deleteLogPrefix}: ${error}`)
        toast.error(options.fallbackErrorMessage())
      })
      .finally(() => {
        isDeleting = false
      })
  }

  return $$({
    associatedGames,
    uncheckedGames,
    isCheckingDelete,
    isDeleteBlocked,
    isConfirmDisabled,
    handleConfirm,
  })
}
