import { resolveI18nLike } from '~/utils/i18n-like'

import type { I18nLike, I18nT } from '~/utils/i18n-like'

export type TranslatePathOperationMessage = I18nT

export interface PathOperationMessage {
  i18nMessage: I18nLike
}

export interface PathOperationBlockReasonMessage {
  kind:
    | 'cross-root-move'
    | 'unsupported-reference'
    | 'duplicate-target'
    | 'in-flight-conflict'
    | 'protected-entry-point'
  i18nMessage: I18nLike
}

export interface PathOperationErrorShape {
  code: 'blocked-plan' | 'stale-plan' | 'unsupported-text'
  i18nMessage: I18nLike
  blockedReasons?: readonly PathOperationBlockReasonMessage[]
}

export interface PathOperationWarning {
  i18nMessage: I18nLike
}

export function formatPathOperationMessage(
  translate: TranslatePathOperationMessage,
  message: PathOperationMessage,
): string {
  return resolveI18nLike(message.i18nMessage, translate)
}

export function formatPathOperationErrorMessage(
  translate: TranslatePathOperationMessage,
  error: PathOperationErrorShape,
): string {
  if (error.code === 'blocked-plan' && error.blockedReasons?.length) {
    return error.blockedReasons
      .map(reason => formatPathOperationMessage(translate, {
        i18nMessage: reason.i18nMessage,
      }))
      .join('\n')
  }

  return formatPathOperationMessage(translate, {
    i18nMessage: error.i18nMessage,
  })
}

export function formatPathOperationWarnings(
  translate: TranslatePathOperationMessage,
  warnings: readonly PathOperationWarning[],
): string[] {
  return warnings.map(warning => formatPathOperationMessage(translate, {
    i18nMessage: warning.i18nMessage,
  }))
}
