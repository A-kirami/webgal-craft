import { open } from '@tauri-apps/plugin-dialog'

import { AbsPath } from '~/domain/path'

export interface DesktopDirectoryPicker {
  selectDirectory: (title: string, defaultPath?: string) => Promise<AbsPath | undefined>
}

export const desktopDirectoryPicker: DesktopDirectoryPicker = {
  async selectDirectory(title, defaultPath) {
    const selected = await open({
      title,
      directory: true,
      multiple: false,
      defaultPath,
    })

    return typeof selected === 'string' ? AbsPath.from(selected) : undefined
  },
}
