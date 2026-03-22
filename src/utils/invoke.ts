import { invoke } from '@tauri-apps/api/core'

import { AppError } from '~/types/errors'

/** 类型安全的 invoke 包装，统一错误转换 */
export async function safeInvoke<T>(
  command: string,
  args?: Record<string, unknown>,
): Promise<T> {
  try {
    return await invoke<T>(command, args)
  } catch (error) {
    throw AppError.fromInvoke(command, error)
  }
}
