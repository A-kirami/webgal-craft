import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AbsPath, RelPath } from '~/domain/path'
import { gameFs } from '~/services/game-fs'

const {
  getGameEnginePathMock,
  commitPendingFileWriteMock,
  copyEntryMock,
  createFileMock,
  createFolderMock,
  copyFileMock,
  deleteFileMock,
  ensureWritableMock,
  getFolderContentsMock,
  mkdirMock,
  fsMoveFileMock,
  vfsMovePathMock,
  resolvePreviewSiteMock,
  registerPendingFileWriteMock,
  rollbackPendingFileWriteMock,
  fsRenameFileMock,
  vfsRenamePathMock,
  readFileMock,
  refreshCurrentGamePreviewAssetsMock,
  resolveFilePathMock,
  touchCurrentGameLastModifiedMock,
  useFileStoreMock,
  useWorkspaceStoreMock,
  writeBinaryFileMock,
  writeTextFileMock,
} = vi.hoisted(() => ({
  getGameEnginePathMock: vi.fn(),
  commitPendingFileWriteMock: vi.fn(),
  copyEntryMock: vi.fn(),
  createFileMock: vi.fn(),
  createFolderMock: vi.fn(),
  copyFileMock: vi.fn(),
  deleteFileMock: vi.fn(),
  ensureWritableMock: vi.fn(),
  getFolderContentsMock: vi.fn(),
  mkdirMock: vi.fn(),
  fsMoveFileMock: vi.fn(),
  vfsMovePathMock: vi.fn(),
  resolvePreviewSiteMock: vi.fn(),
  registerPendingFileWriteMock: vi.fn(),
  rollbackPendingFileWriteMock: vi.fn(),
  fsRenameFileMock: vi.fn(),
  vfsRenamePathMock: vi.fn(),
  readFileMock: vi.fn(),
  refreshCurrentGamePreviewAssetsMock: vi.fn(),
  resolveFilePathMock: vi.fn(),
  touchCurrentGameLastModifiedMock: vi.fn(),
  useFileStoreMock: vi.fn(),
  writeBinaryFileMock: vi.fn(),
  useWorkspaceStoreMock: vi.fn(),
  writeTextFileMock: vi.fn(),
}))

vi.mock('@tauri-apps/plugin-fs', () => ({
  mkdir: mkdirMock,
  readFile: readFileMock,
  writeFile: writeBinaryFileMock,
  writeTextFile: writeTextFileMock,
}))

vi.mock('~/services/game-manager', () => ({
  gameManager: {
    refreshCurrentGamePreviewAssets: refreshCurrentGamePreviewAssetsMock,
    touchCurrentGameLastModified: touchCurrentGameLastModifiedMock,
    getGameEnginePath: getGameEnginePathMock,
    resolvePreviewSite: resolvePreviewSiteMock,
  },
}))

vi.mock('~/services/file-write-echo-registry', () => ({
  commitPendingFileWrite: commitPendingFileWriteMock,
  registerPendingFileWrite: registerPendingFileWriteMock,
  rollbackPendingFileWrite: rollbackPendingFileWriteMock,
}))

vi.mock('~/commands/fs', () => ({
  fsCmds: {
    deleteFile: deleteFileMock,
    createFile: createFileMock,
    createFolder: createFolderMock,
    copyFile: copyFileMock,
    moveFile: fsMoveFileMock,
    renameFile: fsRenameFileMock,
  },
}))

vi.mock('~/commands/vfs', () => ({
  vfsCmds: {
    movePath: vfsMovePathMock,
    renamePath: vfsRenamePathMock,
  },
}))

vi.mock('~/stores/file', () => ({
  useFileStore: useFileStoreMock,
}))

vi.mock('~/stores/workspace', () => ({
  useWorkspaceStore: useWorkspaceStoreMock,
}))

describe('gameFs', () => {
  beforeEach(() => {
    commitPendingFileWriteMock.mockReset()
    copyEntryMock.mockReset()
    createFileMock.mockReset()
    createFolderMock.mockReset()
    copyFileMock.mockReset()
    deleteFileMock.mockReset()
    ensureWritableMock.mockReset()
    getFolderContentsMock.mockReset()
    mkdirMock.mockReset()
    fsMoveFileMock.mockReset()
    vfsMovePathMock.mockReset()
    getGameEnginePathMock.mockReset()
    resolvePreviewSiteMock.mockReset()
    registerPendingFileWriteMock.mockReset()
    rollbackPendingFileWriteMock.mockReset()
    readFileMock.mockReset()
    fsRenameFileMock.mockReset()
    vfsRenamePathMock.mockReset()
    resolveFilePathMock.mockReset()
    refreshCurrentGamePreviewAssetsMock.mockReset()
    touchCurrentGameLastModifiedMock.mockReset()
    useFileStoreMock.mockReset()
    useWorkspaceStoreMock.mockReset()
    writeBinaryFileMock.mockReset()
    writeTextFileMock.mockReset()

    registerPendingFileWriteMock.mockReturnValue({
      physicalPath: '/game/image.bin',
      id: 1,
    })
    ensureWritableMock.mockImplementation(async (path: string) => path)
    getFolderContentsMock.mockResolvedValue([])
    readFileMock.mockResolvedValue(new Uint8Array([1, 2, 3]))
    resolveFilePathMock.mockImplementation(async (path: string) => path)
    useWorkspaceStoreMock.mockReturnValue({
      CWD: '/project',
      currentGame: {
        path: '/project',
        previewAssets: {
          icon: { path: 'icons/favicon.ico' },
          cover: { path: 'game/background/cover.png' },
        },
      },
    })
    resolvePreviewSiteMock.mockResolvedValue({
      projectPath: '/project',
      enginePath: '/engines/webgal',
      templatePath: '/templates/current',
    })
    getGameEnginePathMock.mockResolvedValue('/engines/webgal')
    useFileStoreMock.mockReturnValue({
      copyEntry: copyEntryMock,
      deleteEntry: vi.fn(async () => false),
      ensureWritable: ensureWritableMock,
      getFolderContents: getFolderContentsMock,
      isVfs: false,
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
      resolveFilePath: resolveFilePathMock,
    })
    ensureWritableMock
      .mockResolvedValueOnce('/game/.overlay/readme.txt')
      .mockResolvedValueOnce('/game/.overlay/image.bin')

    await gameFs.writeFile(AbsPath.from('/game/readme.txt'), 'hello')
    expect(touchCurrentGameLastModifiedMock).toHaveBeenCalledTimes(1)
    await gameFs.writeDocumentFile(AbsPath.from('/game/image.bin'), new Uint8Array([1, 2, 3]))

    expect(ensureWritableMock).toHaveBeenNthCalledWith(1, '/game/readme.txt')
    expect(ensureWritableMock).toHaveBeenNthCalledWith(2, '/game/image.bin')
    expect(writeTextFileMock).toHaveBeenCalledWith('/game/.overlay/readme.txt', 'hello')
    expect(registerPendingFileWriteMock).toHaveBeenCalledWith('/game/.overlay/image.bin', new Uint8Array([1, 2, 3]))
    expect(writeBinaryFileMock).toHaveBeenCalledWith('/game/.overlay/image.bin', new Uint8Array([1, 2, 3]))
    expect(commitPendingFileWriteMock).toHaveBeenCalledWith({
      physicalPath: '/game/image.bin',
      id: 1,
    })
    expect(touchCurrentGameLastModifiedMock).toHaveBeenCalledTimes(1)
    expect(refreshCurrentGamePreviewAssetsMock).not.toHaveBeenCalled()
  })

  it('文档写入失败时会回滚已登记的回响写入', async () => {
    const handle = {
      physicalPath: '/game/.overlay/image.bin',
      id: 7,
    }
    const error = new Error('write failed')

    useFileStoreMock.mockReturnValue({
      copyEntry: copyEntryMock,
      deleteEntry: vi.fn(async () => false),
      ensureWritable: ensureWritableMock,
      getFolderContents: getFolderContentsMock,
      isVfs: true,
      resolveFilePath: resolveFilePathMock,
    })
    ensureWritableMock.mockResolvedValueOnce('/game/.overlay/image.bin')
    registerPendingFileWriteMock.mockReturnValueOnce(handle)
    writeBinaryFileMock.mockRejectedValueOnce(error)

    await expect(gameFs.writeDocumentFile(AbsPath.from('/game/image.bin'), new Uint8Array([1, 2, 3]))).rejects.toThrow(error)

    expect(registerPendingFileWriteMock).toHaveBeenCalledWith('/game/.overlay/image.bin', new Uint8Array([1, 2, 3]))
    expect(commitPendingFileWriteMock).not.toHaveBeenCalled()
    expect(rollbackPendingFileWriteMock).toHaveBeenCalledWith(handle)
    expect(touchCurrentGameLastModifiedMock).not.toHaveBeenCalled()
    expect(refreshCurrentGamePreviewAssetsMock).not.toHaveBeenCalled()
  })

  it('VFS 模式下读取文档文件会先解析实际文件路径', async () => {
    useFileStoreMock.mockReturnValue({
      copyEntry: copyEntryMock,
      deleteEntry: vi.fn(async () => false),
      ensureWritable: ensureWritableMock,
      getFolderContents: getFolderContentsMock,
      isVfs: true,
      resolveFilePath: resolveFilePathMock,
    })
    resolveFilePathMock.mockResolvedValueOnce('/game/.overlay/scene.txt')

    await expect(gameFs.readDocumentFile(AbsPath.from('/game/scene.txt'))).resolves.toEqual(new Uint8Array([1, 2, 3]))

    expect(resolveFilePathMock).toHaveBeenCalledWith('/game/scene.txt')
    expect(readFileMock).toHaveBeenCalledWith('/game/.overlay/scene.txt')
  })

  it('非 VFS 模式下会直接透传底层文件系统操作', async () => {
    fsRenameFileMock.mockResolvedValue('/game/new.txt')
    createFileMock.mockResolvedValue('/game/created.txt')
    createFolderMock.mockResolvedValue('/game/folder')
    copyFileMock.mockResolvedValue('/game/copied.txt')
    fsMoveFileMock.mockResolvedValue('/game/moved.txt')

    await expect(gameFs.renameFile(AbsPath.from('/game/old.txt'), 'new.txt')).resolves.toEqual({
      echoMode: 'watcher',
      newPath: '/game/new.txt',
    })
    await expect(gameFs.createFile(AbsPath.from('/game'), 'created.txt')).resolves.toBe('/game/created.txt')
    await expect(gameFs.createFolder(AbsPath.from('/game'), 'folder')).resolves.toBe('/game/folder')
    await expect(gameFs.copyFile(AbsPath.from('/from.txt'), AbsPath.from('/game'))).resolves.toBe('/game/copied.txt')
    await expect(gameFs.moveFile(AbsPath.from('/from.txt'), AbsPath.from('/game'))).resolves.toEqual({
      echoMode: 'watcher',
      newPath: '/game/moved.txt',
    })
    await gameFs.deleteFile(AbsPath.from('/game/deleted.txt'), true)

    expect(deleteFileMock).toHaveBeenCalledWith('/game/deleted.txt', true)
    expect(mkdirMock).not.toHaveBeenCalled()
    expect(refreshCurrentGamePreviewAssetsMock).not.toHaveBeenCalled()
    expect(touchCurrentGameLastModifiedMock).toHaveBeenCalledTimes(4)
  })

  it('创建当前图标文件时只刷新图标预览资源', async () => {
    createFileMock.mockResolvedValue('/project/icons/favicon.ico')

    await expect(gameFs.createFile(AbsPath.from('/project/icons'), 'favicon.ico')).resolves.toBe('/project/icons/favicon.ico')

    expect(refreshCurrentGamePreviewAssetsMock).toHaveBeenCalledWith({ invalidate: 'icon' })
    expect(touchCurrentGameLastModifiedMock).not.toHaveBeenCalled()
  })

  it('删除当前封面文件时只刷新封面预览资源', async () => {
    await gameFs.deleteFile(AbsPath.from('/project/game/background/cover.png'), true)

    expect(deleteFileMock).toHaveBeenCalledWith('/project/game/background/cover.png', true)
    expect(refreshCurrentGamePreviewAssetsMock).toHaveBeenCalledWith({ invalidate: 'cover' })
    expect(touchCurrentGameLastModifiedMock).not.toHaveBeenCalled()
  })

  it('VFS 项目中的普通路径 rename 或 move 仍走 native adapter', async () => {
    useFileStoreMock.mockReturnValue({
      copyEntry: copyEntryMock,
      deleteEntry: vi.fn(async () => false),
      ensureWritable: ensureWritableMock,
      getFolderContents: getFolderContentsMock,
      isVfs: true,
      resolveFilePath: resolveFilePathMock,
    })

    fsRenameFileMock.mockResolvedValue('/project/game/background/new.txt')
    fsMoveFileMock.mockResolvedValue('/project/game/background/moved.txt')

    await expect(gameFs.renameFile(AbsPath.from('/project/game/background/old.txt'), 'new.txt')).resolves.toEqual({
      echoMode: 'watcher',
      newPath: '/project/game/background/new.txt',
    })
    await expect(gameFs.moveFile(
      AbsPath.from('/project/game/background/old.txt'),
      AbsPath.from('/project/game/background'),
    )).resolves.toEqual({
      echoMode: 'watcher',
      newPath: '/project/game/background/moved.txt',
    })

    expect(resolvePreviewSiteMock).not.toHaveBeenCalled()
    expect(fsRenameFileMock).toHaveBeenCalledWith('/project/game/background/old.txt', 'new.txt')
    expect(fsMoveFileMock).toHaveBeenCalledWith('/project/game/background/old.txt', '/project/game/background')
  })

  it('native move 接收计划目标名时会透传给底层 fs adapter', async () => {
    fsMoveFileMock.mockResolvedValue('/project/game/background/moved (1).txt')

    await expect(gameFs.moveFile(
      AbsPath.from('/project/game/background/old.txt'),
      AbsPath.from('/project/game/background'),
      'moved (1).txt',
    )).resolves.toEqual({
      echoMode: 'watcher',
      newPath: '/project/game/background/moved (1).txt',
    })

    expect(fsMoveFileMock).toHaveBeenCalledWith(
      '/project/game/background/old.txt',
      '/project/game/background',
      'moved (1).txt',
    )
  })

  it('缺少 currentGame 时不会把 CWD 下的 template 路径误判为覆盖层操作', async () => {
    useWorkspaceStoreMock.mockReturnValue({
      CWD: '/project',
      currentGame: undefined,
    })
    fsRenameFileMock.mockResolvedValue('/project/game/template/new.txt')

    await expect(gameFs.renameFile(
      AbsPath.from('/project/game/template/old.txt'),
      'new.txt',
    )).resolves.toEqual({
      echoMode: 'watcher',
      newPath: '/project/game/template/new.txt',
    })

    expect(resolvePreviewSiteMock).not.toHaveBeenCalled()
    expect(vfsRenamePathMock).not.toHaveBeenCalled()
    expect(fsRenameFileMock).toHaveBeenCalledWith('/project/game/template/old.txt', 'new.txt')
  })

  it('只有命中 game/template 路径时才走覆盖层 rename 或 move', async () => {
    const deleteEntryMock = vi.fn()

    useFileStoreMock.mockReturnValue({
      copyEntry: copyEntryMock,
      deleteEntry: deleteEntryMock,
      ensureWritable: ensureWritableMock,
      getFolderContents: getFolderContentsMock,
      isVfs: true,
      resolveFilePath: resolveFilePathMock,
    })

    resolvePreviewSiteMock.mockResolvedValue({
      projectPath: '/project',
      enginePath: '/engines/webgal',
      templatePath: '/templates/current',
    })
    vfsRenamePathMock.mockResolvedValue(RelPath.from('game/template/new.txt'))
    vfsMovePathMock.mockResolvedValue(RelPath.from('game/template/folder/old (1).txt'))
    copyEntryMock.mockResolvedValueOnce('/project/game/copied.txt')
    createFileMock.mockResolvedValue('/project/game/created.txt')
    createFolderMock.mockResolvedValue('/project/game/folder')
    deleteEntryMock.mockResolvedValueOnce(true)

    await expect(gameFs.renameFile(AbsPath.from('/project/game/template/old.txt'), 'new.txt')).resolves.toEqual({
      echoMode: 'synthetic',
      newPath: '/project/game/template/new.txt',
    })
    await expect(gameFs.createFile(AbsPath.from('/project/game'), 'created.txt')).resolves.toBe('/project/game/created.txt')
    await expect(gameFs.createFolder(AbsPath.from('/project/game'), 'folder')).resolves.toBe('/project/game/folder')
    await expect(gameFs.copyFile(AbsPath.from('/project/from.txt'), AbsPath.from('/project/game'))).resolves.toBe('/project/game/copied.txt')
    await expect(gameFs.moveFile(
      AbsPath.from('/project/game/template/old.txt'),
      AbsPath.from('/project/game/template/folder'),
      'old (1).txt',
    )).resolves.toEqual({
      echoMode: 'synthetic',
      newPath: '/project/game/template/folder/old (1).txt',
    })
    await gameFs.deleteFile(AbsPath.from('/project/game/deleted.txt'), true)

    expect(resolvePreviewSiteMock).toHaveBeenCalled()
    expect(vfsRenamePathMock).toHaveBeenCalledWith({
      projectPath: '/project',
      enginePath: '/engines/webgal',
      templatePath: '/templates/current',
      relPath: 'game/template/old.txt',
      newName: 'new.txt',
    })
    expect(vfsMovePathMock).toHaveBeenCalledWith({
      projectPath: '/project',
      enginePath: '/engines/webgal',
      templatePath: '/templates/current',
      relPath: 'game/template/old.txt',
      targetRelPath: 'game/template/folder/old (1).txt',
    })
    expect(copyEntryMock).toHaveBeenNthCalledWith(1, '/project/from.txt', '/project/game')
    expect(deleteEntryMock).toHaveBeenCalledOnce()
    expect(deleteEntryMock).toHaveBeenCalledWith('/project/game/deleted.txt')
    expect(fsRenameFileMock).not.toHaveBeenCalledWith('/project/game/template/old.txt', 'new.txt')
    expect(fsMoveFileMock).not.toHaveBeenCalledWith('/project/game/template/old.txt', '/project/game/template/folder')
  })

  it('VFS 模式下创建同名条目时会先按 overlay 视图生成唯一名称，再解析最终可写路径', async () => {
    useFileStoreMock.mockReturnValue({
      copyEntry: copyEntryMock,
      deleteEntry: vi.fn(async () => false),
      ensureWritable: ensureWritableMock,
      getFolderContents: getFolderContentsMock,
      isVfs: true,
      resolveFilePath: resolveFilePathMock,
    })

    getFolderContentsMock
      .mockResolvedValueOnce([{ name: 'scene.txt' }])
      .mockResolvedValueOnce([{ name: 'bgm' }])
    ensureWritableMock
      .mockResolvedValueOnce('/game/scene (1).txt')
      .mockResolvedValueOnce('/game/bgm (1)')

    await expect(gameFs.createFile(AbsPath.from('/game'), 'scene.txt')).resolves.toBe('/game/scene (1).txt')
    await expect(gameFs.createFolder(AbsPath.from('/game'), 'bgm')).resolves.toBe('/game/bgm (1)')

    expect(ensureWritableMock).toHaveBeenNthCalledWith(1, '/game/scene (1).txt')
    expect(ensureWritableMock).toHaveBeenNthCalledWith(2, '/game/bgm (1)')
    expect(writeTextFileMock).toHaveBeenCalledWith('/game/scene (1).txt', '')
    expect(mkdirMock).toHaveBeenCalledWith('/game/bgm (1)', { recursive: true })
    expect(createFileMock).not.toHaveBeenCalled()
    expect(createFolderMock).not.toHaveBeenCalled()
  })
})
