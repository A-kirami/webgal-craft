import { GameError } from './types'

/**
 * 获取游戏配置
 * @param gamePath 游戏路径
 * @returns 游戏配置对象
 * @throws {GameError} 当获取失败时抛出
 */
async function getConfig(gamePath: string) {
  try {
    return await gameCmds.getGameConfig(gamePath)
  } catch (error) {
    throw new GameError(
      '获取游戏配置失败',
      'CONFIG_GET_ERROR',
      { gamePath, originalError: error },
    )
  }
}

/**
 * 设置游戏配置
 * @param gamePath 游戏路径
 * @param config 配置对象
 * @throws {GameError} 当设置失败时抛出
 */
async function setConfig(gamePath: string, config: Record<string, string>) {
  try {
    await gameCmds.setGameConfig(gamePath, config)
    await gameManager.updateCurrentGameLastModified()
  } catch (error) {
    throw new GameError(
      '设置游戏配置失败',
      'CONFIG_SET_ERROR',
      { gamePath, config, originalError: error },
    )
  }
}

/**
 * 配置管理器对象，提供游戏配置相关的管理功能
 */
export const configManager = {
  getConfig,
  setConfig,
}
