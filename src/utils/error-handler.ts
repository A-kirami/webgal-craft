import { AppError } from '~/types/errors'

interface HandleErrorOptions {
  /** 静默模式：只记录日志，不弹通知 */
  silent?: boolean
  /** 操作上下文描述，展示给用户时作为前缀（如「保存文件失败」） */
  context?: string
}

/** 沿 cause 链向下查找根因消息 */
function getRootMessage(error: AppError): string {
  let current: unknown = error
  const seen = new WeakSet()
  while (current instanceof AppError && current.cause instanceof AppError && !seen.has(current)) {
    seen.add(current)
    current = current.cause
  }
  return current instanceof AppError ? current.message : error.message
}

/** 统一的用户侧错误展示 */
export function handleError(error: unknown, options?: HandleErrorOptions) {
  const appError = error instanceof AppError
    ? error
    : new AppError(
        'UNKNOWN',
        error instanceof Error ? error.message : String(error),
        { cause: error },
      )

  // 始终记录完整错误链
  logger.error(`[${appError.code}] ${appError.message}`)

  // 非静默模式下通知用户，展示根因而非泛化描述
  if (!options?.silent) {
    const rootMsg = getRootMessage(appError)
    const display = options?.context
      ? `${options.context}: ${rootMsg}`
      : rootMsg
    toast.error(display)
  }
}
