import { openPath } from '@tauri-apps/plugin-opener'

import { MIN_WEBGAL_EDITOR_RUNTIME_VERSION } from '~/domain/engine/runtime-capabilities'
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
  importFailed: I18nLike
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
  unsupportedLegacyEngine?: I18nLike
  providerDenied?: I18nLike
  copyFailed?: I18nLike
  unsafeEntry?: I18nLike
  storageFull?: I18nLike
  resourceLimit?: I18nLike
  rollbackFailed?: I18nLike
  importBusy?: I18nLike
}

export type HomeResourceType = 'games' | 'engines' | 'templates'

export const managedImportErrorMessages = {
  providerDenied: t => t('home.managedImport.error.providerDenied'),
  copyFailed: t => t('home.managedImport.error.copyFailed'),
  unsafeEntry: t => t('home.managedImport.error.unsafeEntry'),
  storageFull: t => t('home.managedImport.error.storageFull'),
  resourceLimit: t => t('home.managedImport.error.resourceLimit'),
  rollbackFailed: t => t('home.managedImport.error.rollbackFailed'),
  importBusy: t => t('home.managedImport.error.busy'),
} satisfies Partial<HomeResourceImportMessages>

export function createHomeResourceImportMessages(type: HomeResourceType, t: I18nT): HomeResourceImportMessages {
  switch (type) {
    case 'games': {
      return {
        ...managedImportErrorMessages,
        alreadyRegistered: t => t('home.games.importAlreadyExists'),
        engineEditorIncompatible: t => t('home.games.importEngineEditorIncompatible'),
        engineNotFound: t => t('home.games.importEngineNotFound'),
        engineUnavailable: t => t('home.games.importEngineUnavailable'),
        engineVersionInvalid: t => t('home.games.importEngineVersionInvalid'),
        engineVersionTooOld: t => t('home.games.importEngineVersionTooOld', { version: MIN_WEBGAL_EDITOR_RUNTIME_VERSION }),
        gameConfigCorrupted: t => t('home.games.importConfigCorrupted'),
        gameSchemaTooNew: t => t('home.games.importSchemaVersionTooNew'),
        invalidFolder: t => t('home.games.importInvalidFolder'),
        importFailed: t => t('home.games.importFailed'),
        multipleFolders: t => t('home.games.importMultipleFolders'),
        selectFolderTitle: t('common.dialogs.selectGameFolder'),
        unknownError: t => t('home.games.importUnknownError'),
      }
    }
    case 'engines': {
      return {
        ...managedImportErrorMessages,
        alreadyRegistered: t => t('home.engines.importAlreadyExists'),
        engineEditorIncompatible: t => t('home.engines.importEditorIncompatible'),
        engineSchemaTooNew: t => t('home.engines.importSchemaTooNew'),
        engineVersionInvalid: t => t('home.engines.importVersionInvalid'),
        engineVersionTooOld: t => t('home.engines.importVersionTooOld', { version: MIN_WEBGAL_EDITOR_RUNTIME_VERSION }),
        invalidFolder: t => t('home.engines.importInvalidFolder'),
        importFailed: t => t('home.engines.importFailed'),
        multipleFolders: t => t('home.engines.importMultipleFolders'),
        selectFolderTitle: t('common.dialogs.selectEngineFolder'),
        targetConflict: t => t('home.engines.importTargetConflict'),
        unsupportedLegacyEngine: t => t('home.engines.importUnsupportedLegacyEngine'),
        unknownError: t => t('home.engines.importUnknownError'),
      }
    }
    case 'templates': {
      return {
        ...managedImportErrorMessages,
        duplicateResource: t => t('home.templates.importDuplicate'),
        invalidFolder: t => t('home.templates.importInvalidFolder'),
        importFailed: t => t('home.templates.importFailed'),
        multipleFolders: t => t('home.templates.importMultipleFolders'),
        selectFolderTitle: t('common.dialogs.selectTemplateFolder'),
        unknownError: t => t('home.templates.importUnknownError'),
      }
    }
    default: {
      throw new Error(`未知的资源类型: ${type satisfies never}`)
    }
  }
}

interface UseHomeResourceImportActionsOptions {
  activeProgress: ReadonlyMap<string, number>
  importResource: (path: AbsPath) => Promise<HomeResourceImportOutcome | unknown>
  selectResource: () => Promise<HomeResourceImportOutcome | unknown>
  messages: HomeResourceImportMessages
  t: I18nT
}

/** 通知类型到消息字段名的映射 */
const NOTIFICATION_MESSAGE_KEYS: Partial<Record<HomeResourceImportNotification['kind'], keyof HomeResourceImportMessages>> = {
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
  'unknown-error': 'unknownError',
  'multiple-folders': 'multipleFolders',
  'provider-denied': 'providerDenied',
  'copy-failed': 'copyFailed',
  'unsafe-entry': 'unsafeEntry',
  'storage-full': 'storageFull',
  'resource-limit': 'resourceLimit',
  'rollback-failed': 'rollbackFailed',
  'import-busy': 'importBusy',
}

export function resolveImportNotificationMessage(
  notification: ReturnType<typeof resolveHomeResourceImportNotification>,
  messages: HomeResourceImportMessages,
  t: I18nT,
): string | undefined {
  const messageKey = NOTIFICATION_MESSAGE_KEYS[notification.kind]
  if (!messageKey) {
    return
  }

  return resolveI18nLike(messages[messageKey] ?? messages.unknownError, t)
}

export function reportHomeResourceImportNotification(
  notification: ReturnType<typeof resolveHomeResourceImportNotification>,
  messages: HomeResourceImportMessages,
  t: I18nT,
): void {
  if (notification.level === 'silent') {
    return
  }

  const message = resolveImportNotificationMessage(notification, messages, t)
  if (!message) {
    return
  }

  if (notification.level === 'info') {
    toast.info(message)
    return
  }

  toast.error(message)
}

function isImportOutcome(value: unknown): value is HomeResourceImportOutcome {
  return typeof value === 'object' && value !== null && 'alreadyRegistered' in value
}

export function useHomeResourceImportActions<TResource extends { id: string, path: string }>(
  options: UseHomeResourceImportActionsOptions,
) {
  async function runWithFeedback(operation: () => Promise<HomeResourceImportOutcome | unknown>) {
    let importError: unknown
    let outcome: HomeResourceImportOutcome | undefined

    try {
      const result = await operation()
      if (isImportOutcome(result)) {
        outcome = result
      }
    } catch (error) {
      importError = error
    }

    const notification = resolveHomeResourceImportNotification(importError, outcome)
    reportHomeResourceImportNotification(notification, options.messages, options.t)
  }

  async function importWithFeedback(path: AbsPath) {
    await runWithFeedback(() => options.importResource(path))
  }

  function getProgress(resource: Pick<TResource, 'id'>): number {
    return getHomeResourceProgress(options.activeProgress, resource.id)
  }

  function hasProgress(resource: Pick<TResource, 'id'>): boolean {
    return hasHomeResourceProgress(options.activeProgress, resource.id)
  }

  async function selectFolder() {
    await runWithFeedback(options.selectResource)
  }

  async function handleDrop(paths: string[]) {
    const decision = resolveHomeResourceDropPath(paths)
    if (!decision.shouldImport || !decision.path) {
      if (decision.notification) {
        reportHomeResourceImportNotification(decision.notification, options.messages, options.t)
      }
      return
    }

    await importWithFeedback(AbsPath.from(decision.path))
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
