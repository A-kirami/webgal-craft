import { open } from '@tauri-apps/plugin-dialog'

import { AbsPath } from '~/domain/path'

export interface DesktopDirectoryPicker {
  selectDirectory: (title: string) => Promise<AbsPath | undefined>
}

export const desktopDirectoryPicker: DesktopDirectoryPicker = {
  async selectDirectory(title) {
    const selected = await open({
      title,
      directory: true,
      multiple: false,
    })

    return typeof selected === 'string' ? AbsPath.from(selected) : undefined
  },
}
