import { exists, readDir, readTextFile, writeTextFile } from '@tauri-apps/plugin-fs'

import { AbsPath, RelPath } from '~/domain/path'
import { gameAssetDir } from '~/services/platform/app-paths'

const ANIMATION_TABLE_FILE_NAME = 'animationTable.json'
const JSON_FILE_SUFFIX = '.json'

function getAnimationRootPath(gamePath: AbsPath): AbsPath {
  return AbsPath.join(gamePath, RelPath.from('game/animation'))
}

function toAnimationTableEntry(animationRootPath: AbsPath, path: AbsPath): RelPath | undefined {
  if (!path.startsWith(`${animationRootPath}/`)) {
    return
  }

  const relativePath = AbsPath.relativize(path, animationRootPath)
  const normalizedRelativePath = relativePath.toLowerCase()
  if (!normalizedRelativePath.endsWith(JSON_FILE_SUFFIX)) {
    return
  }
  if (normalizedRelativePath === ANIMATION_TABLE_FILE_NAME.toLowerCase()) {
    return
  }

  return RelPath.from(relativePath.slice(0, -JSON_FILE_SUFFIX.length))
}

async function collectAnimationEntries(
  animationRootPath: AbsPath,
  currentPath: AbsPath,
): Promise<RelPath[]> {
  const entries = await readDir(currentPath)
  const nestedEntries = await Promise.all(entries.map(async (entry) => {
    if (!entry.name) {
      return []
    }

    const entryPath = AbsPath.append(currentPath, entry.name)
    if (entry.isDirectory) {
      return collectAnimationEntries(animationRootPath, entryPath)
    }

    const animationEntry = toAnimationTableEntry(animationRootPath, entryPath)
    if (animationEntry) {
      return [animationEntry]
    }

    return []
  }))

  return nestedEntries.flat()
}

function serializeAnimationTable(entries: string[]): string {
  return `${JSON.stringify(entries, undefined, 2)}\n`
}

export function isAnimationTableRelatedPath(gamePath: AbsPath, path: AbsPath): boolean {
  const animationRootPath = getAnimationRootPath(gamePath)

  if (path === animationRootPath) {
    return true
  }

  if (!path.startsWith(`${animationRootPath}/`)) {
    return false
  }

  return path.toLowerCase() !== `${animationRootPath}/${ANIMATION_TABLE_FILE_NAME}`.toLowerCase()
}

export async function syncAnimationTable(gamePath: AbsPath): Promise<void> {
  const animationPath = gameAssetDir(gamePath, 'animation')
  if (!await exists(animationPath)) {
    return
  }

  const nextEntries = [...new Set(await collectAnimationEntries(animationPath, animationPath))]
    .toSorted((left, right) => left.localeCompare(right))
  const nextContent = serializeAnimationTable(nextEntries)
  const animationTablePath = AbsPath.append(animationPath, ANIMATION_TABLE_FILE_NAME)

  let currentContent = ''
  try {
    currentContent = await readTextFile(animationTablePath)
  } catch {
    currentContent = ''
  }

  if (currentContent === nextContent) {
    return
  }

  await writeTextFile(animationTablePath, nextContent)
}
