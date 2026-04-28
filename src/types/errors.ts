/** 所有合法错误码，同时用于类型派生和运行时校验 */
const ERROR_CODES = [
  // 后端 Rust 侧错误码
  'IO_ERROR', 'IMAGE_ERROR', 'SERVER_ERROR', 'CONFIG_ERROR', 'WINDOW_ERROR', 'TAURI_ERROR',
  'PATH_DENIED', 'NOT_FOUND', 'WRITE_TO_ENGINE_RUNTIME', 'VFS_ERROR', 'SCHEMA_VERSION_TOO_NEW', 'INVALID_PROJECT_CONFIG', 'SITE_NOT_REGISTERED',
  // 前端通用错误码
  'UNKNOWN', 'DIR_NOT_FOUND', 'PATH_TRAVERSAL', 'FS_ERROR', 'EDITOR_ERROR', 'INVALID_STRUCTURE', 'DUPLICATE_RESOURCE',
] as const

export type ErrorCode = typeof ERROR_CODES[number]

/** 后端返回的结构化错误 */
export interface BackendError {
  code: string
  message: string
  [key: string]: unknown
}

export interface AppErrorDetails {
  found?: number
  maxSupported?: number
  reason?: string
  [key: string]: unknown
}

export function isBackendError(value: unknown): value is BackendError {
  return typeof value === 'object'
    && value !== null
    && 'code' in value
    && 'message' in value
    && typeof value.code === 'string'
    && typeof value.message === 'string'
}

const VALID_ERROR_CODES: ReadonlySet<string> = new Set(ERROR_CODES)

/** 应用统一错误类 */
export class AppError extends Error {
  readonly code: ErrorCode
  readonly details?: AppErrorDetails

  constructor(code: ErrorCode, message: string, options?: ErrorOptions & { details?: AppErrorDetails }) {
    super(message, options)
    this.name = 'AppError'
    this.code = code
    this.details = options?.details
  }

  /** 从 invoke catch 中的 unknown 值构造 */
  static fromInvoke(command: string, error: unknown): AppError {
    if (isBackendError(error)) {
      const code = VALID_ERROR_CODES.has(error.code) ? (error.code as ErrorCode) : 'UNKNOWN'
      const { code: _backendCode, message: _backendMessage, ...details } = error
      return new AppError(code, error.message, {
        cause: error,
        details: Object.keys(details).length > 0 ? details : undefined,
      })
    }
    const message = error instanceof Error ? error.message : String(error)
    return new AppError('UNKNOWN', `${command}: ${message}`, { cause: error })
  }
}
