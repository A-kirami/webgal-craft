import { AbsPath } from '~/domain/path'
import { gameFs } from '~/services/game-fs'
import { fromExternalAbsPath } from '~/services/platform/path-boundary'

export interface ExternalFileImportSuccess {
  sourcePath: AbsPath
  targetPath: AbsPath
}

export interface ExternalFileImportFailure {
  sourcePath: string
  error: unknown
}

export interface ExternalFileImportResult {
  failures: ExternalFileImportFailure[]
  successes: ExternalFileImportSuccess[]
}

export interface ExternalFileImportGateway {
  importExternalEntry: (sourcePath: AbsPath, targetDirectory: AbsPath) => Promise<AbsPath>
}

interface NormalizedExternalPaths {
  failures: ExternalFileImportFailure[]
  paths: AbsPath[]
}

const externalDropItemSelector = '[data-file-tree-path], [data-file-viewer-path]'
const externalDropRootSurfaceSelector = '[data-file-tree-root-surface], [data-file-viewer-root-surface]'

function normalizeExternalPaths(rawPaths: readonly string[]): NormalizedExternalPaths {
  const failures: ExternalFileImportFailure[] = []
  const paths = new Set<AbsPath>()

  for (const rawPath of rawPaths) {
    try {
      const path = fromExternalAbsPath(rawPath)
      paths.add(path)
    } catch (error) {
      failures.push({ sourcePath: rawPath, error })
    }
  }

  return {
    failures,
    paths: [...paths],
  }
}

export async function importExternalFiles(
  rawPaths: readonly string[],
  targetDirectory: AbsPath,
  gateway: ExternalFileImportGateway = gameFs,
): Promise<ExternalFileImportResult> {
  const normalized = normalizeExternalPaths(rawPaths)
  const failures = [...normalized.failures]
  const successes: ExternalFileImportSuccess[] = []

  for (const sourcePath of normalized.paths) {
    try {
      // eslint-disable-next-line no-await-in-loop -- 批量导入按拖放顺序执行，确保同名项依次获得稳定的唯一名称。
      const targetPath = await gateway.importExternalEntry(sourcePath, targetDirectory)
      successes.push({ sourcePath, targetPath })
    } catch (error) {
      failures.push({ sourcePath, error })
    }
  }

  return { failures, successes }
}

export function resolveExternalFileDropTargetDirectory(
  element: Element | undefined,
  rootDirectory: AbsPath,
): AbsPath | undefined {
  const itemElement = element?.closest<HTMLElement>(externalDropItemSelector)
  if (!itemElement && !element?.closest<HTMLElement>(externalDropRootSurfaceSelector)) {
    return
  }

  const rawPath = itemElement?.dataset.fileTreeDropTargetPath
    ?? (itemElement?.dataset.fileViewerIsDir === 'true' ? itemElement.dataset.fileViewerPath : undefined)

  if (!rawPath) {
    return rootDirectory
  }

  try {
    const targetDirectory = AbsPath.from(rawPath)
    AbsPath.relativize(targetDirectory, rootDirectory)
    return targetDirectory
  } catch {
    return rootDirectory
  }
}
