import { beforeEach, describe, expect, it, vi } from 'vitest'

const { openMock } = vi.hoisted(() => ({
  openMock: vi.fn(),
}))

vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: openMock,
}))

import { desktopDirectoryPicker } from '../desktop-directory-picker'

describe('desktopDirectoryPicker', () => {
  beforeEach(() => {
    openMock.mockReset()
  })

  it('桌面端使用单目录选择器并转换外部绝对路径', async () => {
    openMock.mockResolvedValue(String.raw`C:\Games\Demo`)

    await expect(desktopDirectoryPicker.selectDirectory('Select game folder'))
      .resolves.toBe('C:/Games/Demo')
    expect(openMock).toHaveBeenCalledWith({
      title: 'Select game folder',
      directory: true,
      multiple: false,
    })
  })

  it.each([undefined, ['/games/one', '/games/two']])('将非单路径结果 %j 视为取消', async (selection) => {
    openMock.mockResolvedValue(selection)

    await expect(desktopDirectoryPicker.selectDirectory('Select folder')).resolves.toBeUndefined()
  })
})
