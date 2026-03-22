import { safeInvoke } from '~/utils/invoke'

/**
 * 游戏配置接口，定义了游戏的基本配置信息
 *
 * @interface GameConfig
 * @property gameName - 游戏名称
 * @property description - 游戏描述
 * @property gameKey - 游戏唯一标识键
 * @property packageName - 游戏包名
 * @property titleImg - 游戏标题图片路径
 * @property [key: string] - 其他可能的配置项
 */
interface GameConfig {
  gameName: string
  description: string
  gameKey: string
  packageName: string
  titleImg: string
  [key: string]: string
}

async function getGameConfig(gamePath: string) {
  return safeInvoke<GameConfig>('get_game_config', { gamePath })
}

async function setGameConfig(gamePath: string, config: Record<string, string>) {
  return safeInvoke<void>('set_game_config', { gamePath, config })
}

async function runGameServer(gamePath: string) {
  return safeInvoke<string>('run_game_server', { gamePath })
}

async function stopGameServer(gamePath: string) {
  return safeInvoke<void>('stop_game_server', { gamePath })
}

export const gameCmds = {
  getGameConfig,
  setGameConfig,
  runGameServer,
  stopGameServer,
}
