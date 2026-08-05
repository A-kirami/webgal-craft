import { documentDir } from '@tauri-apps/api/path'

import { AbsPath } from '~/domain/path'

import { defaultEngineSavePath, defaultExportSavePath, defaultGameSavePath, defaultTemplateSavePath } from './app-paths'
import { resolveManagedResourceRoots } from './managed-resource-roots'
import { isAndroidRuntime } from './runtime'

import type { ManagedResourceRoots } from './managed-resource-roots'

export interface StorageSavePathState {
  gameSavePath: string
  engineSavePath: string
  exportSavePath: string
  templateSavePath: string
}

interface ResolveMissingStorageSavePathsOptions {
  getBaseDir?: () => Promise<AbsPath>
  isAndroid?: boolean
  resolveAndroidRoots?: () => Promise<ManagedResourceRoots>
  resolveGameSavePath?: (baseDir: AbsPath) => string | Promise<string>
  resolveEngineSavePath?: (baseDir: AbsPath) => string | Promise<string>
  resolveExportSavePath?: (baseDir: AbsPath) => string | Promise<string>
  resolveTemplateSavePath?: (baseDir: AbsPath) => string | Promise<string>
}

const DEFAULTS: Record<
  keyof StorageSavePathState,
  { resolverKey: keyof ResolveMissingStorageSavePathsOptions, fallback: (baseDir: AbsPath) => string | Promise<string> }
> = {
  gameSavePath: { resolverKey: 'resolveGameSavePath', fallback: defaultGameSavePath },
  engineSavePath: { resolverKey: 'resolveEngineSavePath', fallback: defaultEngineSavePath },
  exportSavePath: { resolverKey: 'resolveExportSavePath', fallback: defaultExportSavePath },
  templateSavePath: { resolverKey: 'resolveTemplateSavePath', fallback: defaultTemplateSavePath },
}

export async function resolveMissingStorageSavePaths(
  storageSettings: StorageSavePathState,
  options: ResolveMissingStorageSavePathsOptions = {},
): Promise<Partial<StorageSavePathState>> {
  const android = options.isAndroid ?? isAndroidRuntime()
  if (android) {
    const roots = await (options.resolveAndroidRoots ?? resolveManagedResourceRoots)()
    return {
      gameSavePath: roots.game,
      engineSavePath: roots.engine,
      templateSavePath: roots.template,
      exportSavePath: roots.export,
    }
  }

  const missingKeys = (Object.keys(DEFAULTS) as (keyof StorageSavePathState)[])
    .filter(key => storageSettings[key] === '')

  if (missingKeys.length === 0) {
    return {}
  }

  const baseDir = options.getBaseDir
    ? await options.getBaseDir()
    : AbsPath.from(await documentDir())
  const resolvedEntries = await Promise.all(
    missingKeys.map(async (key) => {
      const { resolverKey, fallback } = DEFAULTS[key]
      const resolver = options[resolverKey] as ((baseDir: AbsPath) => string | Promise<string>) | undefined
      const value = await (resolver ?? fallback)(baseDir)
      return [key, value] as const
    }),
  )

  return Object.fromEntries(resolvedEntries)
}
