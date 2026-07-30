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

  it('uses the desktop single-directory dialog', async () => {
    openMock.mockResolvedValue(String.raw`C:\Games\Demo`)

    await expect(desktopDirectoryPicker.selectDirectory('Select game folder'))
      .resolves.toBe('C:/Games/Demo')
    expect(openMock).toHaveBeenCalledWith({
      title: 'Select game folder',
      directory: true,
      multiple: false,
    })
  })

  it.each([undefined, ['/games/one', '/games/two']])('treats %j as cancellation', async (selection) => {
    openMock.mockResolvedValue(selection)

    await expect(desktopDirectoryPicker.selectDirectory('Select folder')).resolves.toBeUndefined()
  })
})
