import { AbsPath } from '~/domain/path'
import { toLookupPathKey } from '~/services/resource-path/lookup'

import type { LookupPathKey } from '~/services/resource-path/lookup'
import type { AppErrorDetails, ErrorCode } from '~/types/errors'

export type ResourceAvailability = 'available' | 'missing' | 'broken'

export type ResourceWarningCode =
  | 'missing-favicon'
  | 'missing-game-icon'
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
  normalizedPath: AbsPath
  lookupKey: LookupPathKey
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
  normalizedPath: AbsPath
  lookupKey: LookupPathKey
}

export function normalizeImportPath(rawPath: string): NormalizedImportPath {
  const normalizedPath = AbsPath.from(rawPath)
  return {
    normalizedPath,
    lookupKey: toLookupPathKey(normalizedPath),
  }
}

export function classifyAvailability(input: AvailabilityClassificationInput): ResourceAvailability {
  const { pathExists, structureValid, semanticsValid } = input
  if (!pathExists) {
    return 'missing'
  }
  if (!structureValid || !semanticsValid) {
    return 'broken'
  }
  return 'available'
}

export function createWarning(code: ResourceWarningCode, message: string): ResourceWarning {
  return { code, message }
}
