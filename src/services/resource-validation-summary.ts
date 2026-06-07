import type { AbsPath } from '~/domain/path'

export interface ResourceValidationFailure {
  error: string
  path: AbsPath
}

export interface ResourceValidationSummary {
  failed: number
  failures: ResourceValidationFailure[]
  total: number
}

export function createResourceValidationFailure(path: AbsPath, error: unknown): ResourceValidationFailure {
  return {
    error: String(error),
    path,
  }
}

export function createResourceValidationSummary(
  total: number,
  failures: ResourceValidationFailure[],
): ResourceValidationSummary {
  return {
    failed: failures.length,
    failures,
    total,
  }
}

export function logResourceValidationSummary(label: string, summary: ResourceValidationSummary): void {
  if (summary.failed === 0) {
    return
  }

  const sample = summary.failures
    .slice(0, 3)
    .map(({ error, path }) => `${path} -> ${error}`)
    .join('; ')
  const suffix = summary.failures.length > 3
    ? `; 另有 ${summary.failures.length - 3} 个异常`
    : ''

  logger.warn(`${label}异常 ${summary.failed}/${summary.total}: ${sample}${suffix}`)
}
