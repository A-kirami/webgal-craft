import { invoke } from '@tauri-apps/api/core'

interface CreateWindowOptions extends Record<string, unknown> {
  label: string
  target: string
  title?: string
  width?: number
  height?: number
  minWidth?: number
  minHeight?: number
  resizable?: boolean
  center?: boolean
  reuse?: boolean
  useCustomTitleBar?: boolean
}

/**
 * 创建应用窗口
 *
 * @param options - 创建窗口参数
 * @returns 是否创建了新窗口
 * @throws 当创建失败时抛出异常
 */
async function createWindow(options: CreateWindowOptions): Promise<boolean> {
  try {
    return await invoke<boolean>('create_window', { options })
  } catch (error) {
    throw new Error(`创建窗口失败: ${error}`, { cause: error })
  }
}

/**
 * 窗口命令对象，提供窗口相关命令调用功能
 */
export const windowCmds = {
  createWindow,
}
