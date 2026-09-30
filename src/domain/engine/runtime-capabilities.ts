import { compareVersions, validateStrict } from 'compare-versions'

export interface EngineRuntimeCapabilities {
  changeFigureDiff: boolean
  figurePositions: boolean
  multilineStatements: boolean
  opusVocalShorthand: boolean
  sceneSemantics: boolean
  transformFrom: boolean
}

export type EngineRuntimeCapability = keyof EngineRuntimeCapabilities

export const MIN_WEBGAL_EDITOR_RUNTIME_VERSION = '4.6.2'

const CAPABILITY_MINIMUM_VERSIONS: Record<EngineRuntimeCapability, string> = {
  changeFigureDiff: '4.6.5',
  figurePositions: '4.6.3',
  multilineStatements: '4.6.3',
  opusVocalShorthand: '4.6.3',
  sceneSemantics: '4.6.3',
  transformFrom: '4.6.5',
}

/** 某项能力的最低引擎版本；受能力门控的语法按它推导档位，不要另抄一份 */
export function capabilityMinimumVersion(capability: EngineRuntimeCapability): string {
  return CAPABILITY_MINIMUM_VERSIONS[capability]
}

export const LEGACY_ENGINE_RUNTIME_CAPABILITIES: EngineRuntimeCapabilities = {
  changeFigureDiff: false,
  figurePositions: false,
  multilineStatements: false,
  opusVocalShorthand: false,
  sceneSemantics: false,
  transformFrom: false,
}

export const LATEST_ENGINE_RUNTIME_CAPABILITIES: EngineRuntimeCapabilities = {
  changeFigureDiff: true,
  figurePositions: true,
  multilineStatements: true,
  opusVocalShorthand: true,
  sceneSemantics: true,
  transformFrom: true,
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
    changeFigureDiff: supportsEngineRuntimeCapability(version, 'changeFigureDiff'),
    figurePositions: supportsEngineRuntimeCapability(version, 'figurePositions'),
    multilineStatements: supportsEngineRuntimeCapability(version, 'multilineStatements'),
    opusVocalShorthand: supportsEngineRuntimeCapability(version, 'opusVocalShorthand'),
    sceneSemantics: supportsEngineRuntimeCapability(version, 'sceneSemantics'),
    transformFrom: supportsEngineRuntimeCapability(version, 'transformFrom'),
  }
}
