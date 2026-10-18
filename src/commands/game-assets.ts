import { AbsPath, RelPath } from '~/domain/path'
import { safeInvoke } from '~/utils/invoke'

export interface GameAssetFile {
  assetType: string
  relativePath: RelPath
}

interface GameAssetFilePayload {
  assetType: string
  relativePath: string
}

async function scan(gamePath: AbsPath): Promise<GameAssetFile[]> {
  const files = await safeInvoke<GameAssetFilePayload[]>('scan_game_assets', { gamePath })

  return files.map(file => ({
    assetType: file.assetType,
    relativePath: RelPath.from(file.relativePath),
  }))
}

export const gameAssetsCmds = {
  scan,
}
