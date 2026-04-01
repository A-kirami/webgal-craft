import { open } from '@tauri-apps/plugin-dialog'
import { openPath } from '@tauri-apps/plugin-opener'
import { push as notify } from 'notivue'

import { resolveI18nLike } from '~/utils/i18n-like'

import {
  getHomeResourceProgress,
  hasHomeResourceProgress,
  resolveHomeResourceDropPath,
  resolveHomeResourceImportNotification,
} from './home-resource-import'

import type { I18nLike, I18nT } from '~/utils/i18n-like'

export interface HomeResourceImportMessages {
  success: I18nLike
  invalidFolder: I18nLike
  unknownError: I18nLike
  multipleFolders: I18nLike
  selectFolderTitle: I18nLike
}

interface UseHomeResourceImportActionsOptions {
  activeProgress: ReadonlyMap<string, number>
  importResource: (path: string) => Promise<unknown>
  messages: HomeResourceImportMessages
  t: I18nT
}

function resolveImportNotificationMessage(
  notification: ReturnType<typeof resolveHomeResourceImportNotification>,
  messages: HomeResourceImportMessages,
  t: I18nT,
): string {
  switch (notification.kind) {
    case 'success': {
      return resolveI18nLike(messages.success, t)
    }
    case 'invalid-folder': {
      return resolveI18nLike(messages.invalidFolder, t)
    }
    case 'unknown-error': {
      return resolveI18nLike(messages.unknownError, t)
    }
    case 'multiple-folders': {
      return resolveI18nLike(messages.multipleFolders, t)
    }
    default: {
      throw new Error(`Unsupported import notification: ${String(notification.kind satisfies never)}`)
    }
  }
}

export function useHomeResourceImportActions<TResource extends { id: string, path: string }>(
  options: UseHomeResourceImportActionsOptions,
) {
  async function importWithNotify(path: string) {
    let error: unknown

    try {
      await options.importResource(path)
    } catch (error_) {
      error = error_
    }

    const notification = resolveHomeResourceImportNotification(error)
    const message = resolveImportNotificationMessage(notification, options.messages, options.t)

    if (notification.level === 'success') {
      notify.success(message)
      return
    }

    notify.error(message)
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
