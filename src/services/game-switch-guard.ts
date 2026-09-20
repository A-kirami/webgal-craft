import { AppError } from '~/types/errors'

import type { AbsPath } from '~/domain/path'

/**
 * 引擎切换与模板切换都会改写同一游戏工程的 project.wgcp、模板 upper 与站点注册，
 * 失败时还要按步骤回滚，因此必须按工程串行执行：并发进入会让前一次切换的回滚写入
 * 与后一次切换的前向写入交织，留下互相矛盾的配置。
 *
 * 弹窗上的禁用态只是交互反馈，拦不住已经发起的调用；真正的并发控制在这里。
 */
const gameSwitchesInFlight = new Set<AbsPath>()

export async function runExclusiveGameSwitch(
  gamePath: AbsPath,
  task: () => Promise<void>,
): Promise<void> {
  if (gameSwitchesInFlight.has(gamePath)) {
    throw new AppError('IO_ERROR', '该游戏正在切换引擎或模板，稍后再试', {
      details: { reason: 'GAME_SWITCH_IN_FLIGHT' },
    })
  }

  gameSwitchesInFlight.add(gamePath)
  try {
    await task()
  } finally {
    gameSwitchesInFlight.delete(gamePath)
  }
}
