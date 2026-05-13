import { describe, expect, it } from 'vitest'

import {
  formatPathOperationErrorMessage,
  formatPathOperationWarnings,
} from '~/services/path-operation-feedback'

import type { TranslatePathOperationMessage } from '~/services/path-operation-feedback'

describe('path-operation-feedback', () => {
  const t = ((key: string, values?: Record<string, string | number> | number) =>
    values && typeof values === 'object'
      ? `${key}:${JSON.stringify(values)}`
      : key) as TranslatePathOperationMessage

  it('会把阻断原因翻译并拼接成一条消息', () => {
    const message = formatPathOperationErrorMessage(t, {
      code: 'blocked-plan',
      i18nMessage: t => t('edit.pathOperation.errors.blockedPlan'),
      blockedReasons: [
        {
          kind: 'duplicate-target',
          i18nMessage: t => t('edit.pathOperation.errors.duplicateTarget'),
        },
        {
          kind: 'in-flight-conflict',
          i18nMessage: t => t('edit.pathOperation.errors.inFlightConflict', {
            path: '/project/game/background/bg.jpg',
          }),
        },
      ],
    })

    expect(message).toBe(
      [
        'edit.pathOperation.errors.duplicateTarget',
        'edit.pathOperation.errors.inFlightConflict:{"path":"/project/game/background/bg.jpg"}',
      ].join('\n'),
    )
  })

  it('会把 warning 翻译成可直接展示的消息', () => {
    const warnings = formatPathOperationWarnings(t, [
      {
        i18nMessage: t => t('edit.pathOperation.warnings.sceneHistoryMigrationFailed', {
          error: 'history failed',
          newPath: 'game/background/renamed.jpg',
          oldPath: 'game/background/bg.jpg',
        }),
      },
    ])

    expect(warnings).toEqual([
      'edit.pathOperation.warnings.sceneHistoryMigrationFailed:{"error":"history failed","newPath":"game/background/renamed.jpg","oldPath":"game/background/bg.jpg"}',
    ])
  })
})
