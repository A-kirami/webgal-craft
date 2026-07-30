import { open } from '@tauri-apps/plugin-dialog'

import { AbsPath } from '~/domain/path'

export const desktopDirectoryPicker = {
  async selectDirectory(title: string, defaultPath?: string): Promise<AbsPath | undefined> {
    const selected = await open({
      title,
      directory: true,
      multiple: false,
      defaultPath,
    })

    return typeof selected === 'string' ? AbsPath.from(selected) : undefined
  },
}
