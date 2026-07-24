import {
  formatPathOperationErrorMessage,
  formatPathOperationWarnings,
} from '~/services/path-operation-feedback'
import { AppError } from '~/types/errors'
import { handleError } from '~/utils/error-handler'

import type {
  PathOperationErrorShape,
  PathOperationWarning,
} from '~/services/path-operation-feedback'

export function usePathOperationFeedback() {
  const { t } = useI18n()

  function isPathOperationError(value: unknown): value is PathOperationErrorShape {
    return typeof value === 'object'
      && value !== null
      && 'code' in value
      && 'i18nMessage' in value
      && typeof (value as { code?: unknown }).code === 'string'
      && (
        typeof (value as { i18nMessage?: unknown }).i18nMessage === 'string'
        || typeof (value as { i18nMessage?: unknown }).i18nMessage === 'function'
      )
  }

  function createError(error: unknown): AppError {
    if (isPathOperationError(error)) {
      return new AppError('PATH_OPERATION', formatPathOperationErrorMessage(t, error))
    }

    if (error instanceof AppError) {
      return error
    }

    return new AppError(
      'UNKNOWN',
      error instanceof Error ? error.message : String(error),
      { cause: error },
    )
  }

  function reportError(error: unknown): void {
    handleError(createError(error))
  }

  function reportWarnings(warnings: readonly PathOperationWarning[]): void {
    for (const warning of formatPathOperationWarnings(t, warnings)) {
      toast.warning(warning)
    }
  }

  return {
    createError,
    reportError,
    reportWarnings,
  }
}
