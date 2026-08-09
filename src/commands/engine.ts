import { Channel } from '@tauri-apps/api/core'

import { AbsPath } from '~/domain/path'
import { safeInvoke } from '~/utils/invoke'

import type { OfficialEngineRelease } from '~/domain/engine/official-release'
import type { EngineManifestResult } from '~/types/engine'

export interface OfficialEngineDownloadProgress {
  downloadedBytes: number
  entry?: string
  extractedFiles?: number
  phase: 'downloading' | 'extracting'
  totalBytes?: number
}

function readEngineManifest(enginePath: string): Promise<EngineManifestResult> {
  return safeInvoke('read_engine_manifest', { enginePath })
}

function getOfficialEngineReleases(): Promise<OfficialEngineRelease[]> {
  return safeInvoke('get_official_engine_releases')
}

function getLatestOfficialEngineRelease(): Promise<OfficialEngineRelease> {
  return safeInvoke('get_latest_official_engine_release')
}

function downloadOfficialEngine(
  version: string,
  destination: AbsPath,
  onProgress: (progress: OfficialEngineDownloadProgress) => void,
  proxyPrefix?: string,
): Promise<OfficialEngineRelease> {
  const channel = new Channel<OfficialEngineDownloadProgress>(onProgress)
  return safeInvoke('download_official_engine', {
    version,
    destination,
    onProgress: channel,
    proxyPrefix,
  })
}

export const engineCmds = {
  downloadOfficialEngine,
  getLatestOfficialEngineRelease,
  getOfficialEngineReleases,
  readEngineManifest,
}
