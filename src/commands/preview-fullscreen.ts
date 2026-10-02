import { safeInvoke } from '~/utils/invoke'

/** 窗口形态：进入元素全屏前的样子，也是退出时要还原的目标。 */
export interface PreviewWindowShape {
  fullscreen: boolean
  maximized: boolean
}

/** 开始预览全屏会话：按进入前的形态把窗口带进全屏。 */
async function enter(resting: PreviewWindowShape): Promise<void> {
  await safeInvoke<void>('preview_fullscreen_enter', { resting })
}

/** 结束预览全屏会话：只还原本次引入的变化，返回还原后的形态。 */
async function exit(): Promise<PreviewWindowShape> {
  return safeInvoke<PreviewWindowShape>('preview_fullscreen_exit')
}

export const previewFullscreenCmds = {
  enter,
  exit,
}
