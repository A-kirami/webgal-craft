import { open } from '@tauri-apps/plugin-dialog'
import { openPath } from '@tauri-apps/plugin-opener'

import { resolveI18nLike } from '~/utils/i18n-like'

import {
  getHomeResourceProgress,
  hasHomeResourceProgress,
  resolveHomeResourceDropPath,
  resolveHomeResourceImportNotification,
} from './home-resource-import'

import type { HomeResourceImportNotification } from './home-resource-import'
import type { I18nLike, I18nT } from '~/utils/i18n-like'

export interface HomeResourceImportMessages {
  success: I18nLike
  invalidFolder: I18nLike
  unknownError: I18nLike
  multipleFolders: I18nLike
  selectFolderTitle: I18nLike
  duplicateResource?: I18nLike
  duplicateEngine?: I18nLike
  engineNotFound?: I18nLike
  engineUnavailable?: I18nLike
  gameAlreadyRegistered?: I18nLike
  gameConfigCorrupted?: I18nLike
  gameSchemaTooNew?: I18nLike
  importCancelled?: I18nLike
  unsupportedLegacyEngine?: I18nLike
}

interface UseHomeResourceImportActionsOptions {
  activeProgress: ReadonlyMap<string, number>
  importResource: (path: string) => Promise<unknown>
  messages: HomeResourceImportMessages
  t: I18nT
}

/** 通知类型到消息字段名的映射 */
const NOTIFICATION_MESSAGE_KEYS: Record<HomeResourceImportNotification['kind'], keyof HomeResourceImportMessages> = {
  'success': 'success',
  'invalid-folder': 'invalidFolder',
  'duplicate-resource': 'duplicateResource',
  'unsupported-legacy-engine': 'unsupportedLegacyEngine',
  'duplicate-engine': 'duplicateEngine',
  'game-already-registered': 'gameAlreadyRegistered',
  'game-config-corrupted': 'gameConfigCorrupted',
  'game-schema-too-new': 'gameSchemaTooNew',
  'engine-not-found': 'engineNotFound',
  'engine-unavailable': 'engineUnavailable',
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

export function useHomeResourceImportActions<TResource extends { id: string, path: string }>(
  options: UseHomeResourceImportActionsOptions,
) {
  async function importWithNotify(path: string) {
    let importError: unknown

    try {
      await options.importResource(path)
    } catch (error) {
      importError = error
    }

    const notification = resolveHomeResourceImportNotification(importError)
    if (notification.level === 'silent') {
      return
    }

    const message = resolveImportNotificationMessage(notification, options.messages, options.t)

    if (notification.level === 'success') {
      notify.success(message)
    } else {
      notify.error(message)
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

    if (!path) {
      return
    }

    await importWithNotify(path)
  }

  async function handleDrop(paths: string[]) {
    const decision = resolveHomeResourceDropPath(paths)
    if (!decision.shouldImport || !decision.path) {
      if (decision.notification) {
        notify.error(resolveImportNotificationMessage(decision.notification, options.messages, options.t))
      }
      return
    }

    await importWithNotify(decision.path)
  }

  async function handleOpenFolder(resource: Pick<TResource, 'path'>) {
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
