import { exists } from '@tauri-apps/plugin-fs'

import { AbsPath, RelPath } from '~/domain/path'

export const GAME_ICON_DISPLAY_RELATIVE_PATHS = [
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
  'icons/favicon.ico',
] as const

export const GAME_ICON_DATA_STATE_RELATIVE_PATH = RelPath.from('.webgalcraft/icon-data/state.json')
export const GAME_ICON_DATA_FOREGROUND_RELATIVE_PATH = RelPath.from('.webgalcraft/icon-data/foreground.png')
export const GAME_ICON_DATA_BACKGROUND_RELATIVE_PATH = RelPath.from('.webgalcraft/icon-data/background.png')

export interface GameIconPathExistsContext {
  absolutePath: AbsPath
  gamePath: AbsPath
  relativePath: RelPath
}

export interface ResolveGameIconPreviewPathOptions {
  pathExists?: (context: GameIconPathExistsContext) => Promise<boolean>
}

async function defaultPathExists(context: GameIconPathExistsContext): Promise<boolean> {
  return exists(context.absolutePath)
}

export async function resolveGameIconPreviewPath(
  gamePath: AbsPath,
  options: ResolveGameIconPreviewPathOptions = {},
): Promise<RelPath | undefined> {
  const pathExists = options.pathExists ?? defaultPathExists
  const checks = await Promise.all(GAME_ICON_DISPLAY_RELATIVE_PATHS.map(async (relativePath) => {
    const normalizedRelativePath = RelPath.from(relativePath)
    const targetPath = AbsPath.join(gamePath, normalizedRelativePath)
    return {
      exists: await pathExists({
        absolutePath: targetPath,
        gamePath,
        relativePath: normalizedRelativePath,
      }),
      relativePath: normalizedRelativePath,
    }
  }))
  const matched = checks.find(check => check.exists)

  if (matched) {
    return matched.relativePath
  }
}
