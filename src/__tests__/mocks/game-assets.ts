import { readDir } from '@tauri-apps/plugin-fs'

import { AbsPath, RelPath } from '~/domain/path'

import type { GameAssetFile } from '~/commands/game-assets'

interface RelativeFile {
  relativePath: string
}

function compareText(left: string, right: string): number {
  if (left === right) {
    return 0
  }
  return left < right ? -1 : 1
}

async function scanDirectory(directoryPath: string, relativePrefix: string): Promise<RelativeFile[]> {
  const entries = await readDir(directoryPath)
  const nested = await Promise.all(entries.map(async (entry): Promise<RelativeFile[]> => {
    if (!entry.name) {
      return []
    }

    const relativePath = relativePrefix ? `${relativePrefix}/${entry.name}` : entry.name
    if (entry.isDirectory) {
      return await scanDirectory(`${directoryPath}/${entry.name}`, relativePath)
    }
    return [{ relativePath }]
  }))

  return nested.flat()
}

/** 测试用适配器：把既有 readDir mock 转成 scan_game_assets 的扁平结果。 */
export async function scanGameAssetsFromReadDir(gamePath: AbsPath): Promise<GameAssetFile[]> {
  const gameRootPath = `${gamePath}/game`
  const rootEntries = await readDir(gameRootPath)
  const assetDirectories = rootEntries.filter(entry => entry.isDirectory && !!entry.name)
  const files = await Promise.all(assetDirectories.map(async (entry) => {
    const assetType = entry.name
    const nested = await scanDirectory(`${gameRootPath}/${assetType}`, '')

    return nested.map(file => ({
      assetType,
      relativePath: RelPath.from(file.relativePath),
    }))
  }))

  return files.flat().toSorted((left, right) =>
    compareText(left.assetType, right.assetType)
    || compareText(left.relativePath, right.relativePath),
  )
}
