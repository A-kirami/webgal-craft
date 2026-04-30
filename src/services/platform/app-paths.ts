import { join } from '@tauri-apps/api/path'

// ==================== 游戏路径 ====================

/** 项目配置: {gamePath}/project.wgcp */
export function projectConfigPath(gamePath: string): Promise<string> {
  return join(gamePath, 'project.wgcp')
}

/** game 根目录: {gamePath}/game */
export function gameRootDir(gamePath: string): Promise<string> {
  return join(gamePath, 'game')
}

/** 游戏配置: {gamePath}/game/config.txt */
export function gameConfigPath(gamePath: string): Promise<string> {
  return join(gamePath, 'game', 'config.txt')
}

/** 场景目录: {gamePath}/game/scene */
export function gameSceneDir(gamePath: string): Promise<string> {
  return join(gamePath, 'game', 'scene')
}

/** 资产目录: {gamePath}/game/{assetType} */
export function gameAssetDir(gamePath: string, assetType: string): Promise<string> {
  return join(gamePath, 'game', assetType)
}

/** 游戏图标: {gamePath}/icons/favicon.ico */
export function gameIconPath(gamePath: string): Promise<string> {
  return join(gamePath, 'icons', 'favicon.ico')
}

/** 游戏封面: {gamePath}/game/background/{fileName} */
export function gameCoverPath(gamePath: string, fileName: string): Promise<string> {
  return join(gamePath, 'game', 'background', fileName)
}

// ==================== 引擎路径 ====================

/** 引擎图标: {enginePath}/icons/favicon.ico */
export function engineIconPath(enginePath: string): Promise<string> {
  return join(enginePath, 'icons', 'favicon.ico')
}

/** 模板清单: {templatePath}/template.json */
export function templateManifestPath(templatePath: string): Promise<string> {
  return join(templatePath, 'template.json')
}

/** 引擎内建模板目录: {enginePath}/game/template */
export function engineTemplateDir(enginePath: string): Promise<string> {
  return join(enginePath, 'game', 'template')
}

// ==================== 应用存储路径 ====================

/** 默认游戏存储: {baseDir}/WebGALCraft/games */
export function defaultGameSavePath(baseDir: string): Promise<string> {
  return join(baseDir, 'WebGALCraft', 'games')
}

/** 默认引擎存储: {baseDir}/WebGALCraft/engines */
export function defaultEngineSavePath(baseDir: string): Promise<string> {
  return join(baseDir, 'WebGALCraft', 'engines')
}

/** 默认模板存储: {baseDir}/WebGALCraft/templates */
export function defaultTemplateSavePath(baseDir: string): Promise<string> {
  return join(baseDir, 'WebGALCraft', 'templates')
}
