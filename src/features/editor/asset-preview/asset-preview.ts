export type AssetPreviewMediaTag = 'audio' | 'video'

export interface AssetPreviewMediaSessionTransition {
  nextMimeType: string
  nextPath: string
  previousMimeType?: string
  previousPath?: string
}

export function resolveAssetPreviewMediaTag(mimeType: string): AssetPreviewMediaTag | undefined {
  if (mimeType.startsWith('video/')) {
    return 'video'
  }

  if (mimeType.startsWith('audio/')) {
    return 'audio'
  }

  return undefined
}

export function canAssetPreviewTrackMediaSession(mimeType: string): boolean {
  return resolveAssetPreviewMediaTag(mimeType) !== undefined
}

export function shouldSuspendPreviousAssetPreviewMediaSession(
  transition: AssetPreviewMediaSessionTransition,
): boolean {
  const { nextMimeType, nextPath, previousMimeType, previousPath } = transition

  return !!previousPath
    && canAssetPreviewTrackMediaSession(previousMimeType ?? '')
    && (previousPath !== nextPath || previousMimeType !== nextMimeType)
}
