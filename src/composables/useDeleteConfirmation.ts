import type { ModelRef } from 'vue'
import type { Game } from '~/database/model'

interface UseDeleteConfirmationOptions {
  /** 控制对话框开关的 v-model ref */
  open: ModelRef<boolean | undefined>
  /** 返回用于监听变化的标识符（如 engine.id、groupName） */
  identifier: () => unknown
  /** 检查是否可删除，返回关联的游戏列表 */
  checkDelete: () => Promise<{ associatedGames?: Game[] }>
  /** 执行实际删除操作 */
  performDelete: () => Promise<void>
  /** 删除成功后的提示信息 */
  successMessage: () => string
  /** 删除失败时的兜底错误信息 */
  fallbackErrorMessage: () => string
  /** 日志前缀，用于 logger.error */
  logPrefix: string
}

export function useDeleteConfirmation(options: UseDeleteConfirmationOptions) {
  let associatedGames = $ref<Game[]>([])
  let isCheckingDelete = $ref(false)
  let isDeleting = $ref(false)
  let checkRequestId = 0

  const isDeleteBlocked = $computed(() => associatedGames.length > 0)
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
    } catch (error) {
      if (requestId !== checkRequestId) {
        return
      }
      associatedGames = []
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
        notify.success(options.successMessage())
      })
      .catch((error) => {
        notify.error(error instanceof Error
          ? error.message
          : options.fallbackErrorMessage())
      })
      .finally(() => {
        isDeleting = false
      })
  }

  return $$({
    associatedGames,
    isCheckingDelete,
    isDeleteBlocked,
    isConfirmDisabled,
    handleConfirm,
  })
}
