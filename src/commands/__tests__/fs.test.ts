import '~/__tests__/setup'

import { afterEach, describe, expect, it, vi } from 'vitest'

const { safeInvokeMock } = vi.hoisted(() => ({
  safeInvokeMock: vi.fn(),
}))

vi.mock('@tauri-apps/api/core', () => ({
  Channel: class {
    onmessage?: (payload: unknown) => void
  },
  invoke: vi.fn(),
}))

vi.mock('@tauri-apps/api/path', () => ({
  basename: vi.fn(),
  join: vi.fn(),
}))

vi.mock('@tauri-apps/plugin-fs', () => ({
  copyFile: vi.fn(),
  exists: vi.fn(),
  mkdir: vi.fn(),
  rename: vi.fn(),
  stat: vi.fn(),
  writeTextFile: vi.fn(),
}))

vi.mock('~/utils/invoke', () => ({
  safeInvoke: safeInvokeMock,
}))

import { fsCmds } from '../fs'

describe('fsCmds', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('renameFile 在仅修改大小写时不会把同一文件误判为目标已存在', async () => {
    safeInvokeMock.mockResolvedValue('/project/game/Scene.txt')

    await expect(fsCmds.renameFile('/project/game/scene.txt', 'Scene.txt'))
      .resolves
      .toBe('/project/game/Scene.txt')

    expect(safeInvokeMock).toHaveBeenCalledWith('rename_file', {
      path: '/project/game/scene.txt',
      newName: 'Scene.txt',
    })
  })
})
