import { open } from '@tauri-apps/plugin-dialog'

import { fromExternalAbsPath } from '~/services/platform/path-boundary'

import type { AbsPath } from '~/domain/path'

export const desktopDirectoryPicker = {
  async selectDirectory(title: string, defaultPath?: string): Promise<AbsPath | undefined> {
    const selected = await open({
      title,
      directory: true,
      multiple: false,
      defaultPath,
    })

    return typeof selected === 'string' ? fromExternalAbsPath(selected) : undefined
  },
}
