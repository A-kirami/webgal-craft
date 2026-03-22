import { gameCmds } from '~/commands/game'
import { gameManager } from '~/services/game-manager'

/**
 * 获取游戏配置
 * @param gamePath 游戏路径
 * @returns 游戏配置对象
 */
async function getConfig(gamePath: string) {
  return await gameCmds.getGameConfig(gamePath)
}

/**
 * 设置游戏配置
 * @param gamePath 游戏路径
 * @param config 配置对象
 */
async function setConfig(gamePath: string, config: Record<string, string>) {
  await gameCmds.setGameConfig(gamePath, config)
  gameManager.updateCurrentGameLastModified()
}

/**
 * 配置管理器对象，提供游戏配置相关的管理功能
 */
export const configManager = {
  getConfig,
  setConfig,
}
