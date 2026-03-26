export interface PreviewMediaSession {
  currentTime: number
  paused: boolean
  playbackRate: number
  volume: number
  muted: boolean
}

export interface PreviewMediaSessionSnapshotSource {
  currentTime: number
  paused: boolean
  playbackRate: number
  volume: number
  muted: boolean
}

export interface PreviewMediaSessionRestoreTarget {
  currentTime: number
  playbackRate: number
  volume: number
  muted: boolean
  duration: number
}

export function createPreviewMediaSession(
  patch: Partial<PreviewMediaSession> = {},
): PreviewMediaSession {
  return {
    currentTime: 0,
    paused: true,
    playbackRate: 1,
    volume: 1,
    muted: false,
    ...normalizePreviewMediaSessionPatch(patch),
  }
}

export function normalizePreviewMediaSessionPatch(
  patch: Partial<PreviewMediaSession>,
): Partial<PreviewMediaSession> {
  const normalizedPatch: Partial<PreviewMediaSession> = {}

  if (typeof patch.paused === 'boolean') {
    normalizedPatch.paused = patch.paused
  }

  if (typeof patch.muted === 'boolean') {
    normalizedPatch.muted = patch.muted
  }

  if (typeof patch.currentTime === 'number' && Number.isFinite(patch.currentTime)) {
    normalizedPatch.currentTime = Math.max(0, patch.currentTime)
  }

  if (typeof patch.playbackRate === 'number' && Number.isFinite(patch.playbackRate) && patch.playbackRate > 0) {
    normalizedPatch.playbackRate = patch.playbackRate
  }

  if (typeof patch.volume === 'number' && Number.isFinite(patch.volume)) {
    normalizedPatch.volume = Math.min(Math.max(patch.volume, 0), 1)
  }

  return normalizedPatch
}

export function snapshotPreviewMediaSession(
  source: PreviewMediaSessionSnapshotSource,
  patch: Partial<PreviewMediaSession> = {},
): PreviewMediaSession {
  return createPreviewMediaSession({
    currentTime: source.currentTime,
    paused: source.paused,
    playbackRate: source.playbackRate,
    volume: source.volume,
    muted: source.muted,
    ...patch,
  })
}

export function restorePreviewMediaSession(
  target: PreviewMediaSessionRestoreTarget,
  session: Partial<PreviewMediaSession>,
): { shouldResumePlayback: boolean } {
  const normalizedSession = createPreviewMediaSession(session)

  target.playbackRate = normalizedSession.playbackRate
  target.volume = normalizedSession.volume
  target.muted = normalizedSession.muted

  const maxTime = Number.isFinite(target.duration) ? target.duration : normalizedSession.currentTime
  target.currentTime = Math.min(normalizedSession.currentTime, maxTime)

  return {
    shouldResumePlayback: !normalizedSession.paused,
  }
}
