import { compareVersions, validateStrict } from 'compare-versions'

export interface EngineRuntimeCapabilities {
  multilineStatements: boolean
}

type EngineRuntimeCapability = keyof EngineRuntimeCapabilities

export const MIN_WEBGAL_EDITOR_RUNTIME_VERSION = '4.6.2'

const CAPABILITY_MINIMUM_VERSIONS: Record<EngineRuntimeCapability, string> = {
  multilineStatements: '4.6.3',
}

export const LEGACY_ENGINE_RUNTIME_CAPABILITIES: EngineRuntimeCapabilities = {
  multilineStatements: false,
}

export const LATEST_ENGINE_RUNTIME_CAPABILITIES: EngineRuntimeCapabilities = {
  multilineStatements: true,
}

export function normalizeWebgalRuntimeVersion(version: string | undefined): string | undefined {
  const trimmed = version?.trim()
  if (!trimmed || !validateStrict(trimmed)) {
    return undefined
  }

  return trimmed
}

export function isWebgalEditorRuntimeCompatible(version: string | undefined): boolean {
  const normalizedVersion = normalizeWebgalRuntimeVersion(version)
  return normalizedVersion !== undefined
    && compareVersions(normalizedVersion, MIN_WEBGAL_EDITOR_RUNTIME_VERSION) >= 0
}

export function supportsEngineRuntimeCapability(
  version: string | undefined,
  capability: EngineRuntimeCapability,
): boolean {
  const normalizedVersion = normalizeWebgalRuntimeVersion(version)
  if (!normalizedVersion) {
    return false
  }

  return compareVersions(normalizedVersion, CAPABILITY_MINIMUM_VERSIONS[capability]) >= 0
}

export function resolveEngineRuntimeCapabilities(
  version: string | undefined,
): EngineRuntimeCapabilities {
  return {
    multilineStatements: supportsEngineRuntimeCapability(version, 'multilineStatements'),
  }
}
