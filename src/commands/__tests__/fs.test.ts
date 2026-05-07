import '~/__tests__/setup'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { AbsPath } from '~/domain/path'

const {
  copyFileFsMock,
  existsMock,
  mkdirMock,
  renameMock,
  safeInvokeMock,
  statMock,
  writeTextFileMock,
} = vi.hoisted(() => ({
  copyFileFsMock: vi.fn(),
  existsMock: vi.fn(),
  mkdirMock: vi.fn(),
  renameMock: vi.fn(),
  safeInvokeMock: vi.fn(),
  statMock: vi.fn(),
  writeTextFileMock: vi.fn(),
}))

vi.mock('@tauri-apps/api/core', () => ({
  Channel: class {
    onmessage?: (payload: unknown) => void
  },
  invoke: vi.fn(),
}))

vi.mock('@tauri-apps/plugin-fs', () => ({
  copyFile: copyFileFsMock,
  exists: existsMock,
  mkdir: mkdirMock,
  rename: renameMock,
  stat: statMock,
  writeTextFile: writeTextFileMock,
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

  it('createFile 使用 AbsPath 生成规范化结果，并把最终路径写入底层 fs API', async () => {
    existsMock.mockResolvedValue(false)

    await expect(fsCmds.createFile(AbsPath.from(String.raw`C:\project\game`), 'Scene.txt'))
      .resolves
      .toBe('C:/project/game/Scene.txt')

    expect(writeTextFileMock).toHaveBeenCalledWith('C:/project/game/Scene.txt', '')
  })

  it('copyFile 在文件复制路径上返回 AbsPath，并把归一化后的源目标路径传给底层 fs API', async () => {
    statMock.mockResolvedValue({ isDirectory: false })
    existsMock.mockResolvedValue(false)

    await expect(
      fsCmds.copyFile(
        AbsPath.from(String.raw`C:\project\source.txt`),
        AbsPath.from(String.raw`C:\project\target`),
      ),
    )
      .resolves
      .toBe('C:/project/target/source.txt')

    expect(copyFileFsMock).toHaveBeenCalledWith(
      'C:/project/source.txt',
      'C:/project/target/source.txt',
    )
  })
})
