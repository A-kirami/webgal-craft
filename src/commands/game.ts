import { invoke } from '@tauri-apps/api/core'

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

/**
 * 获取游戏配置信息
 *
 * @param gamePath - 游戏路径
 * @returns 游戏配置对象
 */
async function getGameConfig(gamePath: string) {
  return await invoke<GameConfig>('get_game_config', { gamePath })
}

/**
 * 设置游戏配置信息
 *
 * @param gamePath - 游戏路径
 * @param config - 要设置的配置键值对
 * @returns 无返回值
 */
async function setGameConfig(gamePath: string, config: Record<string, string>) {
  return await invoke<void>('set_game_config', { gamePath, config })
}

/**
 * 启动游戏服务器
 *
 * @param gamePath - 游戏目录路径
 * @returns 服务器URL
 */
async function runGameServer(gamePath: string) {
  return await invoke<string>('run_game_server', { gamePath })
}

/**
 * 停止游戏服务器
 *
 * @param gamePath - 游戏目录路径
 * @returns 无返回值
 */
async function stopGameServer(gamePath: string) {
  return await invoke<void>('stop_game_server', { gamePath })
}

/**
 * 游戏命令对象，提供与后端通信的命令调用功能
 */
export const gameCmds = {
  getGameConfig,
  setGameConfig,
  runGameServer,
  stopGameServer,
}
