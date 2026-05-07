import sanitize from 'sanitize-filename'

import { AbsPath } from '~/domain/path'

export interface CreateGameEngineOptionLike {
  id: string
}

export interface ResolveCreateGamePathSuggestionOptions {
  gameName: string
  gameSavePath: string
  isComposing: boolean
  isPathManuallyChanged: boolean
}

export function sanitizeCreateGameName(gameName: string): string {
  return sanitize(gameName ?? '', { replacement: '_' })
}

export async function resolveCreateGamePathSuggestion(
  options: ResolveCreateGamePathSuggestionOptions,
): Promise<string | undefined> {
  if (options.isComposing || options.isPathManuallyChanged) {
    return
  }

  const sanitizedGameName = sanitizeCreateGameName(options.gameName)
  if (!sanitizedGameName) {
    return AbsPath.from(options.gameSavePath)
  }

  return AbsPath.append(AbsPath.from(options.gameSavePath), sanitizedGameName)
}

export function resolveCreateGameDefaultEngineId(
  engineOptions: readonly CreateGameEngineOptionLike[] | undefined,
): string | undefined {
  return engineOptions?.[0]?.id
}
