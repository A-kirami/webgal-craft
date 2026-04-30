import { beforeEach, describe, expect, it, vi } from 'vitest'

import { gameFs } from '~/services/game-fs'

const {
  copyEntryMock,
  createFileMock,
  createFolderMock,
  copyFileMock,
  deleteFileMock,
  ensureWritableMock,
  getFolderContentsMock,
  joinMock,
  mkdirMock,
  moveFileMock,
  moveEntryMock,
  renameFileMock,
  renameEntryMock,
  resolveFilePathMock,
  useFileStoreMock,
  updateCurrentGameLastModifiedMock,
  writeBinaryFileMock,
  writeTextFileMock,
} = vi.hoisted(() => ({
  copyEntryMock: vi.fn(),
  createFileMock: vi.fn(),
  createFolderMock: vi.fn(),
  copyFileMock: vi.fn(),
  deleteFileMock: vi.fn(),
  ensureWritableMock: vi.fn(),
  getFolderContentsMock: vi.fn(),
  joinMock: vi.fn(async (...parts: string[]) => parts.join('/').replaceAll('//', '/')),
  mkdirMock: vi.fn(),
  moveFileMock: vi.fn(),
  moveEntryMock: vi.fn(),
  renameFileMock: vi.fn(),
  renameEntryMock: vi.fn(),
  resolveFilePathMock: vi.fn(),
  useFileStoreMock: vi.fn(),
  updateCurrentGameLastModifiedMock: vi.fn(),
  writeBinaryFileMock: vi.fn(),
  writeTextFileMock: vi.fn(),
}))

vi.mock('@tauri-apps/plugin-fs', () => ({
  mkdir: mkdirMock,
  writeFile: writeBinaryFileMock,
  writeTextFile: writeTextFileMock,
}))

vi.mock('@tauri-apps/api/path', () => ({
  join: joinMock,
}))

vi.mock('~/services/game-manager', () => ({
  gameManager: {
    updateCurrentGameLastModified: updateCurrentGameLastModifiedMock,
  },
}))

vi.mock('~/commands/fs', () => ({
  fsCmds: {
    renameFile: renameFileMock,
    deleteFile: deleteFileMock,
    createFile: createFileMock,
    createFolder: createFolderMock,
    copyFile: copyFileMock,
    moveFile: moveFileMock,
  },
}))

vi.mock('~/stores/file', () => ({
  useFileStore: useFileStoreMock,
}))

describe('gameFs 游戏文件系统', () => {
  beforeEach(() => {
    copyEntryMock.mockReset()
    createFileMock.mockReset()
    createFolderMock.mockReset()
    copyFileMock.mockReset()
    deleteFileMock.mockReset()
    ensureWritableMock.mockReset()
    getFolderContentsMock.mockReset()
    joinMock.mockClear()
    mkdirMock.mockReset()
    moveFileMock.mockReset()
    moveEntryMock.mockReset()
    renameFileMock.mockReset()
    renameEntryMock.mockReset()
    resolveFilePathMock.mockReset()
    useFileStoreMock.mockReset()
    updateCurrentGameLastModifiedMock.mockReset()
    writeBinaryFileMock.mockReset()
    writeTextFileMock.mockReset()

    ensureWritableMock.mockImplementation(async (path: string) => path)
    getFolderContentsMock.mockResolvedValue([])
    renameEntryMock.mockResolvedValue(undefined)
    moveEntryMock.mockResolvedValue(undefined)
    resolveFilePathMock.mockImplementation(async (path: string) => path)
    useFileStoreMock.mockReturnValue({
      copyEntry: copyEntryMock,
      deleteEntry: vi.fn(async () => false),
      ensureWritable: ensureWritableMock,
      getFolderContents: getFolderContentsMock,
      isVfs: false,
      moveEntry: moveEntryMock,
      renameEntry: renameEntryMock,
      resolveFilePath: resolveFilePathMock,
    })
  })

  it('VFS 模式下写入文本和二进制文件前会通过 file store 解析可写路径', async () => {
    useFileStoreMock.mockReturnValue({
      copyEntry: copyEntryMock,
      deleteEntry: vi.fn(async () => false),
      ensureWritable: ensureWritableMock,
      getFolderContents: getFolderContentsMock,
      isVfs: true,
      moveEntry: moveEntryMock,
      renameEntry: renameEntryMock,
      resolveFilePath: resolveFilePathMock,
    })
    ensureWritableMock
      .mockResolvedValueOnce('/game/.overlay/readme.txt')
      .mockResolvedValueOnce('/game/.overlay/image.bin')

    await gameFs.writeFile('/game/readme.txt', 'hello')
    await gameFs.writeDocumentFile('/game/image.bin', new Uint8Array([1, 2, 3]))

    expect(ensureWritableMock).toHaveBeenNthCalledWith(1, '/game/readme.txt')
    expect(ensureWritableMock).toHaveBeenNthCalledWith(2, '/game/image.bin')
    expect(writeTextFileMock).toHaveBeenCalledWith('/game/.overlay/readme.txt', 'hello')
    expect(writeBinaryFileMock).toHaveBeenCalledWith('/game/.overlay/image.bin', new Uint8Array([1, 2, 3]))
    expect(updateCurrentGameLastModifiedMock).toHaveBeenCalledTimes(2)
  })

  it('非 VFS 模式下会直接透传底层文件系统操作', async () => {
    renameFileMock.mockResolvedValue('/game/new.txt')
    createFileMock.mockResolvedValue('/game/created.txt')
    createFolderMock.mockResolvedValue('/game/folder')
    copyFileMock.mockResolvedValue('/game/copied.txt')
    moveFileMock.mockResolvedValue('/game/moved.txt')

    await expect(gameFs.renameFile('/game/old.txt', 'new.txt')).resolves.toBe('/game/new.txt')
    await expect(gameFs.createFile('/game', 'created.txt')).resolves.toBe('/game/created.txt')
    await expect(gameFs.createFolder('/game', 'folder')).resolves.toBe('/game/folder')
    await expect(gameFs.copyFile('/from.txt', '/game')).resolves.toBe('/game/copied.txt')
    await expect(gameFs.moveFile('/from.txt', '/game')).resolves.toBe('/game/moved.txt')
    await gameFs.deleteFile('/game/deleted.txt', true)

    expect(deleteFileMock).toHaveBeenCalledWith('/game/deleted.txt', true)
    expect(renameEntryMock).not.toHaveBeenCalled()
    expect(mkdirMock).not.toHaveBeenCalled()
    expect(updateCurrentGameLastModifiedMock).toHaveBeenCalledTimes(6)
  })

  it('VFS 模式下会通过覆盖层完成重命名、复制、移动和删除', async () => {
    const deleteEntryMock = vi.fn()

    useFileStoreMock.mockReturnValue({
      copyEntry: copyEntryMock,
      deleteEntry: deleteEntryMock,
      ensureWritable: ensureWritableMock,
      getFolderContents: getFolderContentsMock,
      isVfs: true,
      moveEntry: moveEntryMock,
      renameEntry: renameEntryMock,
      resolveFilePath: resolveFilePathMock,
    })

    renameEntryMock.mockResolvedValue('/game/new.txt')
    copyEntryMock
      .mockResolvedValueOnce('/game/copied.txt')
    moveEntryMock.mockResolvedValue('/game/moved.txt')
    createFileMock.mockResolvedValue('/game/created.txt')
    createFolderMock.mockResolvedValue('/game/folder')
    deleteEntryMock.mockResolvedValueOnce(true)

    await expect(gameFs.renameFile('/game/old.txt', 'new.txt')).resolves.toBe('/game/new.txt')
    await expect(gameFs.createFile('/game', 'created.txt')).resolves.toBe('/game/created.txt')
    await expect(gameFs.createFolder('/game', 'folder')).resolves.toBe('/game/folder')
    await expect(gameFs.copyFile('/from.txt', '/game')).resolves.toBe('/game/copied.txt')
    await expect(gameFs.moveFile('/from.txt', '/game')).resolves.toBe('/game/moved.txt')
    await gameFs.deleteFile('/game/deleted.txt', true)

    expect(renameEntryMock).toHaveBeenCalledWith('/game/old.txt', 'new.txt')
    expect(ensureWritableMock).toHaveBeenNthCalledWith(1, '/game/created.txt')
    expect(ensureWritableMock).toHaveBeenNthCalledWith(2, '/game/folder')
    expect(writeTextFileMock).toHaveBeenCalledWith('/game/created.txt', '')
    expect(mkdirMock).toHaveBeenCalledWith('/game/folder', { recursive: true })
    expect(copyEntryMock).toHaveBeenNthCalledWith(1, '/from.txt', '/game')
    expect(moveEntryMock).toHaveBeenCalledWith('/from.txt', '/game')
    expect(resolveFilePathMock).not.toHaveBeenCalled()
    expect(copyFileMock).not.toHaveBeenCalled()
    expect(createFileMock).not.toHaveBeenCalled()
    expect(createFolderMock).not.toHaveBeenCalled()
    expect(deleteEntryMock).toHaveBeenCalledOnce()
    expect(deleteEntryMock).toHaveBeenCalledWith('/game/deleted.txt')
    expect(deleteFileMock).not.toHaveBeenCalled()
    expect(moveFileMock).not.toHaveBeenCalled()
    expect(updateCurrentGameLastModifiedMock).toHaveBeenCalledTimes(6)
  })

  it('VFS 模式下创建同名条目时会先按 overlay 视图生成唯一名称，再解析最终可写路径', async () => {
    useFileStoreMock.mockReturnValue({
      copyEntry: copyEntryMock,
      deleteEntry: vi.fn(async () => false),
      ensureWritable: ensureWritableMock,
      getFolderContents: getFolderContentsMock,
      isVfs: true,
      moveEntry: moveEntryMock,
      renameEntry: renameEntryMock,
      resolveFilePath: resolveFilePathMock,
    })

    getFolderContentsMock
      .mockResolvedValueOnce([{ name: 'scene.txt' }])
      .mockResolvedValueOnce([{ name: 'bgm' }])
    ensureWritableMock
      .mockResolvedValueOnce('/game/scene (1).txt')
      .mockResolvedValueOnce('/game/bgm (1)')

    await expect(gameFs.createFile('/game', 'scene.txt')).resolves.toBe('/game/scene (1).txt')
    await expect(gameFs.createFolder('/game', 'bgm')).resolves.toBe('/game/bgm (1)')

    expect(ensureWritableMock).toHaveBeenNthCalledWith(1, '/game/scene (1).txt')
    expect(ensureWritableMock).toHaveBeenNthCalledWith(2, '/game/bgm (1)')
    expect(writeTextFileMock).toHaveBeenCalledWith('/game/scene (1).txt', '')
    expect(mkdirMock).toHaveBeenCalledWith('/game/bgm (1)', { recursive: true })
    expect(createFileMock).not.toHaveBeenCalled()
    expect(createFolderMock).not.toHaveBeenCalled()
  })
})
