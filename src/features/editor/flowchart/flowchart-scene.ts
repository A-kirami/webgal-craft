import { AbsPath } from '~/domain/path'

import type { FlowchartSceneRef } from '~/domain/flowchart/model'
import type { FileSystemDragPayload } from '~/types/drag-drop'

export const SCENE_FILE_EXTENSIONS = ['.txt'] as const

function hasSceneExtension(path: AbsPath): boolean {
  return path.toLowerCase().endsWith('.txt')
}

/**
 * 把文件树拖拽载荷换算成场景引用。
 *
 * 只接受单个场景目录下的 `.txt` 文件；目录、多选与非场景文件都不参与流程图绑定。
 */
export function resolveDroppedSceneRef(
  payload: FileSystemDragPayload,
  sceneRoot: AbsPath,
): FlowchartSceneRef | undefined {
  const items = payload.items?.length
    ? payload.items
    : [{ isDir: payload.isDir, path: payload.path }]

  if (items.length !== 1 || items[0]?.isDir) {
    return undefined
  }

  const path = AbsPath.from(items[0].path)
  if (!hasSceneExtension(path)) {
    return undefined
  }

  try {
    return AbsPath.relativize(path, sceneRoot)
  } catch {
    return undefined
  }
}
