import { normalizeFsPath, toComparablePath } from '~/utils/path'

import type { AppErrorDetails, ErrorCode } from '~/types/errors'

export type ResourceAvailability = 'available' | 'missing' | 'broken'

export type ResourceWarningCode =
  | 'missing-favicon'
  | 'missing-title-image'
  | 'missing-title-image-file'
  | 'missing-game-name'

export interface ResourceWarning {
  code: ResourceWarningCode
  message: string
}

export interface BlockingIssue {
  code: ErrorCode
  message: string
  details?: AppErrorDetails
}

export interface NormalizedImportPath {
  /** 反斜杠归一化为正斜杠，去除末尾分隔符与多余分隔符 */
  normalizedPath: string
  /** 用于跨平台对比的小写无尾分隔符路径 */
  comparablePath: string
}

export interface AvailabilityClassificationInput {
  pathExists: boolean
  structureValid: boolean
  semanticsValid: boolean
}

export interface ResourceHealthResult<TPayload> {
  availability: ResourceAvailability
  warnings: ResourceWarning[]
  blockingIssue?: BlockingIssue
  payload?: TPayload
  normalizedPath: string
  comparablePath: string
}

export function normalizeImportPath(rawPath: string): NormalizedImportPath {
  const normalizedPath = normalizeFsPath(rawPath).replaceAll(/\/+/g, '/')
  return {
    normalizedPath,
    comparablePath: toComparablePath(normalizedPath),
  }
}

export function classifyAvailability(input: AvailabilityClassificationInput): ResourceAvailability {
  if (!input.pathExists) {
    return 'missing'
  }
  if (!input.structureValid || !input.semanticsValid) {
    return 'broken'
  }
  return 'available'
}

export function createWarning(code: ResourceWarningCode, message: string): ResourceWarning {
  return { code, message }
}
