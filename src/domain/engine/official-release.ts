import { isWebgalEditorRuntimeCompatible } from './runtime-capabilities'
import { compareEngineVersions } from './version'

export const OFFICIAL_WEBGAL_ENGINE_ID = 'open-webgal.webgal'
export const OFFICIAL_WEBGAL_ENGINE_NAME = 'WebGAL'
export const OFFICIAL_WEBGAL_REPOSITORY = 'OpenWebGAL/WebGAL'

export interface OfficialEngineRelease {
  assetName: string
  assetUrl: string
  engineId: string
  name: string
  releaseUrl: string
  sha256: string
  version: string
}

export function isOfficialWebgalEngine(engineId: string): boolean {
  return engineId === OFFICIAL_WEBGAL_ENGINE_ID
}

export function filterSupportedOfficialEngineReleases(
  releases: readonly OfficialEngineRelease[],
): OfficialEngineRelease[] {
  return releases
    .filter(release => isWebgalEditorRuntimeCompatible(release.version))
    .toSorted((left, right) => compareEngineVersions(left.version, right.version))
}
