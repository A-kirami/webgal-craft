import { AbsPath } from '~/domain/path'

export const SCENE_ENTRY_FILE_NAME = 'start.txt'

export type SceneEntryStatus = 'checking' | 'valid' | 'missing'

function sceneEntryPath(sceneRoot: AbsPath): AbsPath {
  return AbsPath.append(sceneRoot, SCENE_ENTRY_FILE_NAME)
}

/**
 * 入口文件身份不区分大小写。
 * 引擎侧固定请求 `./game/scene/start.txt`（`packages/webgal/src/Core/initializeScript.ts` 硬编码文件名，
 * 经 `assetSetter` 拼接路径），能否命中取决于服务端与文件系统：Craft 预览服务走 VFS `Path::exists()` 解析，
 * Windows / macOS 默认大小写不敏感，`Start.txt` 同样能启动预览；WebGAL-Server 探测工程目录也按不区分大小写比较。
 * 保护判定与可用性判定必须共用同一规则，否则大小写变体会被判为缺失、又无法在应用内改名修复。
 * 只匹配当前场景根目录的直接子项，避免误伤嵌套场景。
 */
export function isSceneEntryPath(path: AbsPath, sceneRoot: AbsPath): boolean {
  return path.toLowerCase() === sceneEntryPath(sceneRoot).toLowerCase()
}

/** 入参是场景根目录的直接子项名，与保护判定一致按不区分大小写匹配。 */
export function resolveSceneEntryStatus(
  fileNames: readonly string[],
): SceneEntryStatus {
  return fileNames.some(name => name.toLowerCase() === SCENE_ENTRY_FILE_NAME) ? 'valid' : 'missing'
}
