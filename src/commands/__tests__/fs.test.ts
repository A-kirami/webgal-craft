import '~/__tests__/setup'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { AbsPath } from '~/domain/path'

const {
  existsMock,
  renameMock,
  safeInvokeMock,
  statMock,
} = vi.hoisted(() => ({
  existsMock: vi.fn(),
  renameMock: vi.fn(),
  safeInvokeMock: vi.fn(),
  statMock: vi.fn(),
}))

vi.mock('@tauri-apps/api/core', () => ({
  Channel: class {
    onmessage?: (payload: unknown) => void
  },
  invoke: vi.fn(),
}))

vi.mock('@tauri-apps/plugin-fs', () => ({
  exists: existsMock,
  rename: renameMock,
  stat: statMock,
}))

vi.mock('~/utils/invoke', () => ({
  safeInvoke: safeInvokeMock,
}))

import { fsCmds } from '../fs'

describe('fsCmds', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('renameFile 在仅修改大小写时不会把同一文件误判为目标已存在，并把返回值归一化为 AbsPath', async () => {
    safeInvokeMock.mockResolvedValue(String.raw`C:\project\game\Scene.txt`)

    await expect(fsCmds.renameFile(AbsPath.from('C:/project/game/scene.txt'), 'Scene.txt'))
      .resolves
      .toBe('C:/project/game/Scene.txt')

    expect(safeInvokeMock).toHaveBeenCalledWith('rename_file', {
      path: 'C:/project/game/scene.txt',
      newName: 'Scene.txt',
    })
  })

  it('moveFile 接收计划目标名时不再自行生成唯一名称', async () => {
    statMock.mockResolvedValue({ isDirectory: false })

    await expect(
      fsCmds.moveFile(
        AbsPath.from('/project/source.txt'),
        AbsPath.from('/project/target'),
        'source (1).txt',
      ),
    )
      .resolves
      .toBe('/project/target/source (1).txt')

    expect(existsMock).not.toHaveBeenCalled()
    expect(renameMock).toHaveBeenCalledWith(
      '/project/source.txt',
      '/project/target/source (1).txt',
    )
  })
})
