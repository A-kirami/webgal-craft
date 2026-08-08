import { AbsPath } from '~/domain/path'

export const SCENE_ENTRY_FILE_NAME = 'start.txt'

export type SceneEntryStatus = 'valid' | 'missing'

function sceneEntryPath(sceneRoot: AbsPath): AbsPath {
  return AbsPath.append(sceneRoot, SCENE_ENTRY_FILE_NAME)
}

/**
 * 入口文件身份不区分大小写，但只匹配当前场景根目录的直接子项，避免误伤嵌套场景。
 */
export function isSceneEntryPath(path: AbsPath, sceneRoot: AbsPath): boolean {
  return path.toLowerCase() === sceneEntryPath(sceneRoot).toLowerCase()
}

export function resolveSceneEntryStatus(
  fileNames: readonly string[],
): SceneEntryStatus {
  return fileNames.includes(SCENE_ENTRY_FILE_NAME) ? 'valid' : 'missing'
}
