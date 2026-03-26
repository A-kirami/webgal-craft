import { join } from '@tauri-apps/api/path'

// ==================== 游戏路径 ====================

/** game 根目录: {gamePath}/game */
export function gameRootDir(gamePath: string) {
  return join(gamePath, 'game')
}

/** 场景目录: {gamePath}/game/scene */
export function gameSceneDir(gamePath: string) {
  return join(gamePath, 'game', 'scene')
}

/** 资产目录: {gamePath}/game/{assetType} */
export function gameAssetDir(gamePath: string, assetType: string) {
  return join(gamePath, 'game', assetType)
}

/** 游戏图标: {gamePath}/icons/favicon.ico */
export function gameIconPath(gamePath: string) {
  return join(gamePath, 'icons', 'favicon.ico')
}

/** 游戏封面: {gamePath}/game/background/{fileName} */
export function gameCoverPath(gamePath: string, fileName: string) {
  return join(gamePath, 'game', 'background', fileName)
}

// ==================== 引擎路径 ====================

/** 引擎图标: {enginePath}/icons/favicon.ico */
export function engineIconPath(enginePath: string) {
  return join(enginePath, 'icons', 'favicon.ico')
}

/** 引擎清单: {enginePath}/manifest.json */
export function engineManifestPath(enginePath: string) {
  return join(enginePath, 'manifest.json')
}

// ==================== 应用存储路径 ====================

/** 默认游戏存储: {baseDir}/WebGALCraft/games */
export function defaultGameSavePath(baseDir: string) {
  return join(baseDir, 'WebGALCraft', 'games')
}

/** 默认引擎存储: {baseDir}/WebGALCraft/engines */
export function defaultEngineSavePath(baseDir: string) {
  return join(baseDir, 'WebGALCraft', 'engines')
}
