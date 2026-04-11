import { safeInvoke } from '~/utils/invoke'

export interface GameConfig {
  defaultLanguage?: string
  description?: string
  enableAppreciation?: string
  gameKey?: string
  gameName?: string
  gameLogo?: string
  legacyExpressionBlendMode?: string
  lineHeight?: string
  maxLine?: string
  packageName?: string
  showPanic?: string
  stageHeight?: string
  stageWidth?: string
  steamAppId?: string
  titleBgm?: string
  titleImg?: string
}

export type GameConfigPatchKey =
  | 'defaultLanguage'
  | 'description'
  | 'enableAppreciation'
  | 'gameKey'
  | 'gameName'
  | 'gameLogo'
  | 'legacyExpressionBlendMode'
  | 'lineHeight'
  | 'maxLine'
  | 'packageName'
  | 'showPanic'
  | 'steamAppId'
  | 'titleBgm'
  | 'titleImg'

export interface GameConfigPatch {
  set: Partial<Record<GameConfigPatchKey, string>>
  unset: GameConfigPatchKey[]
}

async function getGameConfig(gamePath: string) {
  return safeInvoke<GameConfig>('get_game_config', { gamePath })
}

async function setGameConfig(gamePath: string, config: GameConfigPatch) {
  return safeInvoke<void>('set_game_config', { gamePath, config })
}

export const gameCmds = {
  getGameConfig,
  setGameConfig,
}
