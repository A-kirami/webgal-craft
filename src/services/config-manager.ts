import { gameCmds } from '~/commands/game'
import { gameManager } from '~/services/game-manager'
import { usePreviewSessionStore } from '~/stores/preview-session'

import type { GameConfigReadResult, GameConfigWritePayload } from '~/commands/game'
import type { AbsPath } from '~/domain/path'

interface GameConfigChange {
  gamePath: AbsPath
  config: GameConfigWritePayload
}

const configChanged = createEventHook<GameConfigChange>()

/**
 * 获取游戏配置
 * @param gamePath 游戏路径
 * @returns 游戏配置对象
 */
async function getConfig(gamePath: AbsPath): Promise<GameConfigReadResult> {
  return await gameCmds.getGameConfig(gamePath)
}

/**
 * 设置游戏配置
 * @param gamePath 游戏路径
 * @param config 配置对象
 */
async function setConfig(gamePath: AbsPath, config: GameConfigWritePayload) {
  await gameCmds.setGameConfig(gamePath, config)
  await configChanged.trigger({ gamePath, config })
  await gameManager.refreshRegisteredGameSnapshot(gamePath)
  usePreviewSessionStore().refreshIfCurrentGame(gamePath)
}

/**
 * 写入单个游戏配置项，保留其余配置项。
 *
 * 游戏配置属于游戏工程本身，编辑器只读写这些值，不持有独立副本。
 */
async function updateConfigEntry(gamePath: AbsPath, rawKey: string, value: string): Promise<void> {
  const { entries } = await gameCmds.getGameConfig(gamePath)
  await setConfig(gamePath, {
    entries: [...entries.filter(entry => entry.key !== rawKey), { key: rawKey, value }],
  })
}

/**
 * 配置管理器对象，提供游戏配置相关的管理功能
 */
export const configManager = {
  getConfig,
  onConfigChanged: configChanged.on,
  setConfig,
  updateConfigEntry,
}
