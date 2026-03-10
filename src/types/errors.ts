/** 后端 Rust 侧错误码 */
type BackendErrorCode =
  | 'IO_ERROR'
  | 'IMAGE_ERROR'
  | 'SERVER_ERROR'
  | 'CONFIG_ERROR'
  | 'WINDOW_ERROR'
  | 'TAURI_ERROR'

/** 前端通用错误码 */
type FrontendErrorCode =
  | 'UNKNOWN'
  | 'DIR_NOT_FOUND'
  | 'PATH_TRAVERSAL'
  | 'FS_ERROR'
  | 'EDITOR_ERROR'
  | 'INVALID_STRUCTURE'

export type ErrorCode = BackendErrorCode | FrontendErrorCode

/** 后端返回的结构化错误 */
export interface BackendError {
  code: string
  message: string
}

export function isBackendError(value: unknown): value is BackendError {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const obj = value as Record<string, unknown>
  return typeof obj.code === 'string' && typeof obj.message === 'string'
}

/** 用于运行时校验后端返回的错误码 */
const VALID_ERROR_CODES: ReadonlySet<string> = new Set<ErrorCode>([
  'IO_ERROR', 'IMAGE_ERROR', 'SERVER_ERROR', 'CONFIG_ERROR', 'WINDOW_ERROR', 'TAURI_ERROR',
  'UNKNOWN', 'DIR_NOT_FOUND', 'PATH_TRAVERSAL', 'FS_ERROR', 'EDITOR_ERROR', 'INVALID_STRUCTURE',
])

/** 应用统一错误类 */
export class AppError extends Error {
  readonly code: ErrorCode

  constructor(code: ErrorCode, message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'AppError'
    this.code = code
  }

  /** 从 invoke catch 中的 unknown 值构造 */
  static fromInvoke(command: string, error: unknown): AppError {
    if (isBackendError(error)) {
      const code = VALID_ERROR_CODES.has(error.code) ? (error.code as ErrorCode) : 'UNKNOWN'
      return new AppError(code, error.message, { cause: error })
    }
    const message = error instanceof Error ? error.message : String(error)
    return new AppError('UNKNOWN', `${command}: ${message}`, { cause: error })
  }
}
