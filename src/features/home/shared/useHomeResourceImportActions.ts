import { open } from '@tauri-apps/plugin-dialog'
import { openPath } from '@tauri-apps/plugin-opener'

import { AbsPath } from '~/domain/path'
import { resolveI18nLike } from '~/utils/i18n-like'

import {
  getHomeResourceProgress,
  hasHomeResourceProgress,
  resolveHomeResourceDropPath,
  resolveHomeResourceImportNotification,
} from './home-resource-import'

import type { HomeResourceImportNotification, HomeResourceImportOutcome } from './home-resource-import'
import type { I18nLike, I18nT } from '~/utils/i18n-like'

export interface HomeResourceImportMessages {
  success: I18nLike
  invalidFolder: I18nLike
  unknownError: I18nLike
  multipleFolders: I18nLike
  selectFolderTitle: I18nLike
  alreadyRegistered?: I18nLike
  duplicateResource?: I18nLike
  targetConflict?: I18nLike
  engineNotFound?: I18nLike
  engineEditorIncompatible?: I18nLike
  engineSchemaTooNew?: I18nLike
  engineUnavailable?: I18nLike
  engineVersionInvalid?: I18nLike
  engineVersionTooOld?: I18nLike
  gameConfigCorrupted?: I18nLike
  gameSchemaTooNew?: I18nLike
  importCancelled?: I18nLike
  unsupportedLegacyEngine?: I18nLike
}

interface UseHomeResourceImportActionsOptions {
  activeProgress: ReadonlyMap<string, number>
  importResource: (path: AbsPath) => Promise<HomeResourceImportOutcome | unknown>
  messages: HomeResourceImportMessages
  t: I18nT
}

/** 通知类型到消息字段名的映射 */
const NOTIFICATION_MESSAGE_KEYS: Record<HomeResourceImportNotification['kind'], keyof HomeResourceImportMessages> = {
  'success': 'success',
  'already-registered': 'alreadyRegistered',
  'invalid-folder': 'invalidFolder',
  'duplicate-resource': 'duplicateResource',
  'target-conflict': 'targetConflict',
  'unsupported-legacy-engine': 'unsupportedLegacyEngine',
  'engine-schema-too-new': 'engineSchemaTooNew',
  'game-config-corrupted': 'gameConfigCorrupted',
  'game-schema-too-new': 'gameSchemaTooNew',
  'engine-not-found': 'engineNotFound',
  'engine-unavailable': 'engineUnavailable',
  'engine-editor-incompatible': 'engineEditorIncompatible',
  'engine-version-invalid': 'engineVersionInvalid',
  'engine-version-too-old': 'engineVersionTooOld',
  'import-cancelled': 'importCancelled',
  'unknown-error': 'unknownError',
  'multiple-folders': 'multipleFolders',
}

export function resolveImportNotificationMessage(
  notification: ReturnType<typeof resolveHomeResourceImportNotification>,
  messages: HomeResourceImportMessages,
  t: I18nT,
): string {
  const messageKey = NOTIFICATION_MESSAGE_KEYS[notification.kind]
  return resolveI18nLike(messages[messageKey] ?? messages.unknownError, t)
}

function isImportOutcome(value: unknown): value is HomeResourceImportOutcome {
  return typeof value === 'object' && value !== null && 'alreadyRegistered' in value
}

export function useHomeResourceImportActions<TResource extends { id: string, path: string }>(
  options: UseHomeResourceImportActionsOptions,
) {
  async function importWithNotify(path: AbsPath) {
    let importError: unknown
    let outcome: HomeResourceImportOutcome | undefined

    try {
      const result = await options.importResource(path)
      if (isImportOutcome(result)) {
        outcome = result
      }
    } catch (error) {
      importError = error
    }

    const notification = resolveHomeResourceImportNotification(importError, outcome)
    const message = resolveImportNotificationMessage(notification, options.messages, options.t)

    switch (notification.level) {
      case 'success': {
        notify.success(message)
        break
      }
      case 'info': {
        notify.info(message)
        break
      }
      default: {
        notify.error(message)
        break
      }
    }
  }

  function getProgress(resource: Pick<TResource, 'id'>): number {
    return getHomeResourceProgress(options.activeProgress, resource.id)
  }

  function hasProgress(resource: Pick<TResource, 'id'>): boolean {
    return hasHomeResourceProgress(options.activeProgress, resource.id)
  }

  async function selectFolder() {
    const path = await open({
      title: resolveI18nLike(options.messages.selectFolderTitle, options.t),
      directory: true,
      multiple: false,
    })

    if (typeof path !== 'string') {
      return
    }

    await importWithNotify(AbsPath.from(path))
  }

  async function handleDrop(paths: string[]) {
    const decision = resolveHomeResourceDropPath(paths)
    if (!decision.shouldImport || !decision.path) {
      if (decision.notification) {
        notify.error(resolveImportNotificationMessage(decision.notification, options.messages, options.t))
      }
      return
    }

    await importWithNotify(AbsPath.from(decision.path))
  }

  async function handleOpenFolder(resource: { path: string }) {
    await openPath(resource.path)
  }

  return {
    getProgress,
    handleDrop,
    handleOpenFolder,
    hasProgress,
    selectFolder,
  }
}
