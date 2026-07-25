import { AbsPath, RelPath } from '~/domain/path'

// ==================== 游戏路径 ====================

/** 项目配置: {gamePath}/project.wgcp */
export function projectConfigPath(gamePath: AbsPath): AbsPath {
  return AbsPath.append(gamePath, 'project.wgcp')
}

/** game 根目录: {gamePath}/game */
export function gameRootDir(gamePath: AbsPath): AbsPath {
  return AbsPath.append(gamePath, 'game')
}

/** 游戏配置: {gamePath}/game/config.txt */
export function gameConfigPath(gamePath: AbsPath): AbsPath {
  return AbsPath.join(gamePath, RelPath.from('game/config.txt'))
}

/** 场景目录: {gamePath}/game/scene */
export function gameSceneDir(gamePath: AbsPath): AbsPath {
  return AbsPath.join(gamePath, RelPath.from('game/scene'))
}

/** 资产目录: {gamePath}/game/{assetType} */
export function gameAssetDir(gamePath: AbsPath, assetType: string): AbsPath {
  return AbsPath.join(gamePath, RelPath.from(`game/${assetType}`))
}

/** 游戏图标: {gamePath}/icons/favicon.ico */
export function gameIconPath(gamePath: AbsPath): AbsPath {
  return AbsPath.join(gamePath, RelPath.from('icons/favicon.ico'))
}

/** 游戏封面: {gamePath}/game/background/{fileName} */
export function gameCoverPath(gamePath: AbsPath, fileName: string): AbsPath {
  return AbsPath.join(gamePath, RelPath.from(`game/background/${fileName}`))
}

// ==================== 引擎路径 ====================

/** 引擎图标: {enginePath}/icons/favicon.ico */
export function engineIconPath(enginePath: AbsPath): AbsPath {
  return AbsPath.join(enginePath, RelPath.from('icons/favicon.ico'))
}

/** 模板清单: {templatePath}/template.json */
export function templateManifestPath(templatePath: AbsPath): AbsPath {
  return AbsPath.append(templatePath, 'template.json')
}

/** 引擎内建模板目录: {enginePath}/game/template */
export function engineTemplateDir(enginePath: AbsPath): AbsPath {
  return AbsPath.join(enginePath, RelPath.from('game/template'))
}

// ==================== 应用存储路径 ====================

/** 默认游戏存储: {baseDir}/WebGALCraft/games */
export function defaultGameSavePath(baseDir: AbsPath): AbsPath {
  return AbsPath.join(baseDir, RelPath.from('WebGALCraft/games'))
}

/** 默认引擎存储: {baseDir}/WebGALCraft/engines */
export function defaultEngineSavePath(baseDir: AbsPath): AbsPath {
  return AbsPath.join(baseDir, RelPath.from('WebGALCraft/engines'))
}

/** 默认模板存储: {baseDir}/WebGALCraft/templates */
export function defaultTemplateSavePath(baseDir: AbsPath): AbsPath {
  return AbsPath.join(baseDir, RelPath.from('WebGALCraft/templates'))
}

/** 默认导出目录: {baseDir}/WebGALCraft/exports */
export function defaultExportSavePath(baseDir: AbsPath): AbsPath {
  return AbsPath.join(baseDir, RelPath.from('WebGALCraft/exports'))
}
