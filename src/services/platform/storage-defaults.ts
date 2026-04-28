import { documentDir } from '@tauri-apps/api/path'

import { defaultEngineSavePath, defaultGameSavePath, defaultTemplateSavePath } from './app-paths'

export interface StorageSavePathState {
  gameSavePath: string
  engineSavePath: string
  templateSavePath: string
}

interface ResolveMissingStorageSavePathsOptions {
  getBaseDir?: () => Promise<string>
  resolveGameSavePath?: (baseDir: string) => Promise<string>
  resolveEngineSavePath?: (baseDir: string) => Promise<string>
  resolveTemplateSavePath?: (baseDir: string) => Promise<string>
}

const DEFAULTS: Record<
  keyof StorageSavePathState,
  { resolverKey: keyof ResolveMissingStorageSavePathsOptions, fallback: (baseDir: string) => Promise<string> }
> = {
  gameSavePath: { resolverKey: 'resolveGameSavePath', fallback: defaultGameSavePath },
  engineSavePath: { resolverKey: 'resolveEngineSavePath', fallback: defaultEngineSavePath },
  templateSavePath: { resolverKey: 'resolveTemplateSavePath', fallback: defaultTemplateSavePath },
}

export async function resolveMissingStorageSavePaths(
  storageSettings: StorageSavePathState,
  options: ResolveMissingStorageSavePathsOptions = {},
): Promise<Partial<StorageSavePathState>> {
  const missingKeys = (Object.keys(DEFAULTS) as (keyof StorageSavePathState)[])
    .filter(key => storageSettings[key] === '')

  if (missingKeys.length === 0) {
    return {}
  }

  const baseDir = await (options.getBaseDir ?? documentDir)()
  const resolvedEntries = await Promise.all(
    missingKeys.map(async (key) => {
      const { resolverKey, fallback } = DEFAULTS[key]
      const resolver = options[resolverKey] as ((baseDir: string) => Promise<string>) | undefined
      const value = await (resolver ?? fallback)(baseDir)
      return [key, value] as const
    }),
  )

  return Object.fromEntries(resolvedEntries)
}
