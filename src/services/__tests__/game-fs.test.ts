import { beforeEach, describe, expect, it, vi } from 'vitest'

import { gameFs } from '~/services/game-fs'

const {
  createFileMock,
  createFolderMock,
  copyFileMock,
  deleteFileMock,
  moveFileMock,
  renameFileMock,
  updateCurrentGameLastModifiedMock,
  writeBinaryFileMock,
  writeTextFileMock,
} = vi.hoisted(() => ({
  createFileMock: vi.fn(),
  createFolderMock: vi.fn(),
  copyFileMock: vi.fn(),
  deleteFileMock: vi.fn(),
  moveFileMock: vi.fn(),
  renameFileMock: vi.fn(),
  updateCurrentGameLastModifiedMock: vi.fn(),
  writeBinaryFileMock: vi.fn(),
  writeTextFileMock: vi.fn(),
}))

vi.mock('@tauri-apps/plugin-fs', () => ({
  writeFile: writeBinaryFileMock,
  writeTextFile: writeTextFileMock,
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

describe('gameFs', () => {
  beforeEach(() => {
    createFileMock.mockReset()
    createFolderMock.mockReset()
    copyFileMock.mockReset()
    deleteFileMock.mockReset()
    moveFileMock.mockReset()
    renameFileMock.mockReset()
    updateCurrentGameLastModifiedMock.mockReset()
    writeBinaryFileMock.mockReset()
    writeTextFileMock.mockReset()
  })

  it('写入文本和二进制文件后会刷新当前游戏时间戳', async () => {
    await gameFs.writeFile('/game/readme.txt', 'hello')
    await gameFs.writeDocumentFile('/game/image.bin', new Uint8Array([1, 2, 3]))

    expect(writeTextFileMock).toHaveBeenCalledWith('/game/readme.txt', 'hello')
    expect(writeBinaryFileMock).toHaveBeenCalledWith('/game/image.bin', new Uint8Array([1, 2, 3]))
    expect(updateCurrentGameLastModifiedMock).toHaveBeenCalledTimes(2)
  })

  it('文件系统代理方法会返回底层结果并刷新时间戳', async () => {
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
    expect(updateCurrentGameLastModifiedMock).toHaveBeenCalledTimes(6)
  })
})
