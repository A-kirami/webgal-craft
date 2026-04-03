import { join } from '@tauri-apps/api/path'
import { exists, readDir, readTextFile, writeTextFile } from '@tauri-apps/plugin-fs'

import { gameAssetDir } from '~/services/platform/app-paths'

const ANIMATION_TABLE_FILE_NAME = 'animationTable.json'
const JSON_FILE_SUFFIX = '.json'

function normalizePath(path: string): string {
  return path.replaceAll('\\', '/').replace(/\/+$/, '')
}

function getAnimationRootPath(gamePath: string): string {
  return normalizePath(`${gamePath}/game/animation`)
}

function toAnimationTableEntry(animationRootPath: string, path: string): string | undefined {
  const normalizedRootPath = normalizePath(animationRootPath)
  const normalizedPath = normalizePath(path)
  const normalizedRootPrefix = `${normalizedRootPath}/`

  if (!normalizedPath.startsWith(normalizedRootPrefix)) {
    return
  }

  const relativePath = normalizedPath.slice(normalizedRootPrefix.length)
  const normalizedRelativePath = relativePath.toLowerCase()
  if (!normalizedRelativePath.endsWith(JSON_FILE_SUFFIX)) {
    return
  }
  if (normalizedRelativePath === ANIMATION_TABLE_FILE_NAME.toLowerCase()) {
    return
  }

  return relativePath.slice(0, -JSON_FILE_SUFFIX.length)
}

async function collectAnimationEntries(
  animationRootPath: string,
  currentPath: string,
): Promise<string[]> {
  const entries = await readDir(currentPath)
  const nestedEntries = await Promise.all(entries.map(async (entry) => {
    if (!entry.name) {
      return []
    }

    const entryPath = await join(currentPath, entry.name)
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

export function isAnimationTableRelatedPath(gamePath: string, path: string): boolean {
  const animationRootPath = getAnimationRootPath(gamePath)
  const normalizedPath = normalizePath(path)

  if (normalizedPath === animationRootPath) {
    return true
  }

  if (!normalizedPath.startsWith(`${animationRootPath}/`)) {
    return false
  }

  return normalizedPath.toLowerCase() !== `${animationRootPath}/${ANIMATION_TABLE_FILE_NAME}`.toLowerCase()
}

export async function syncAnimationTable(gamePath: string): Promise<void> {
  const animationPath = await gameAssetDir(gamePath, 'animation')
  if (!await exists(animationPath)) {
    return
  }

  const nextEntries = [...new Set(await collectAnimationEntries(animationPath, animationPath))]
    .toSorted((left, right) => left.localeCompare(right))
  const nextContent = serializeAnimationTable(nextEntries)
  const animationTablePath = await join(animationPath, ANIMATION_TABLE_FILE_NAME)

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
