import { safeInvoke } from '~/utils/invoke'

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

async function createWindow(options: CreateWindowOptions): Promise<boolean> {
  return safeInvoke<boolean>('create_window', { options })
}

export const windowCmds = {
  createWindow,
}
