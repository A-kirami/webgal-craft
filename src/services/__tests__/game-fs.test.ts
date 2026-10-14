import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AbsPath, RelPath } from '~/domain/path'
import { gameFs } from '~/services/game-fs'

const {
  commitPendingFileWriteMock,
  copyEntryMock,
  deleteEntryMock,
  createFileMock,
  createFolderMock,
  copyFileMock,
  importExternalEntryMock,
  deleteFileMock,
  ensureWritableMock,
  getFolderContentsMock,
  mkdirMock,
  fsMoveFileMock,
  vfsMovePathMock,
  resolvePreviewSiteMock,
  registerPendingFileWriteMock,
  rollbackPendingFileWriteMock,
  statMock,
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
  commitPendingFileWriteMock: vi.fn(),
  copyEntryMock: vi.fn(),
  deleteEntryMock: vi.fn(),
  createFileMock: vi.fn(),
  createFolderMock: vi.fn(),
  copyFileMock: vi.fn(),
  importExternalEntryMock: vi.fn(),
  deleteFileMock: vi.fn(),
  ensureWritableMock: vi.fn(),
  getFolderContentsMock: vi.fn(),
  mkdirMock: vi.fn(),
  fsMoveFileMock: vi.fn(),
  vfsMovePathMock: vi.fn(),
  resolvePreviewSiteMock: vi.fn(),
  registerPendingFileWriteMock: vi.fn(),
  rollbackPendingFileWriteMock: vi.fn(),
  statMock: vi.fn(),
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
  stat: statMock,
  writeFile: writeBinaryFileMock,
  writeTextFile: writeTextFileMock,
}))

vi.mock('~/services/game-manager', () => ({
  gameManager: {
    refreshCurrentGamePreviewAssets: refreshCurrentGamePreviewAssetsMock,
    touchCurrentGameLastModified: touchCurrentGameLastModifiedMock,
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
    importExternalEntry: importExternalEntryMock,
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
    importExternalEntryMock.mockReset()
    deleteFileMock.mockReset()
    ensureWritableMock.mockReset()
    getFolderContentsMock.mockReset()
    mkdirMock.mockReset()
    fsMoveFileMock.mockReset()
    vfsMovePathMock.mockReset()
    deleteEntryMock.mockReset()
    resolvePreviewSiteMock.mockReset()
    registerPendingFileWriteMock.mockReset()
    rollbackPendingFileWriteMock.mockReset()
    statMock.mockReset()
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

    deleteEntryMock.mockResolvedValue(undefined)
    registerPendingFileWriteMock.mockReturnValue({
      physicalPath: '/game/image.bin',
      id: 1,
    })
    ensureWritableMock.mockImplementation(async (path: string) => path)
    getFolderContentsMock.mockResolvedValue([])
    readFileMock.mockResolvedValue(new Uint8Array([1, 2, 3]))
    resolveFilePathMock.mockImplementation(async (path: string) => path)
    statMock.mockResolvedValue({ isDirectory: false })
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
    useFileStoreMock.mockReturnValue({
      copyEntry: copyEntryMock,
      deleteEntry: deleteEntryMock,
      ensureWritable: ensureWritableMock,
      getFolderContents: getFolderContentsMock,
      resolveFilePath: resolveFilePathMock,
    })
  })

  it('VFS 模式下写入文本和二进制文件前会通过 file store 解析可写路径', async () => {
    useFileStoreMock.mockReturnValue({
      copyEntry: copyEntryMock,
      deleteEntry: deleteEntryMock,
      ensureWritable: ensureWritableMock,
      getFolderContents: getFolderContentsMock,
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
      deleteEntry: deleteEntryMock,
      ensureWritable: ensureWritableMock,
      getFolderContents: getFolderContentsMock,
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
      deleteEntry: deleteEntryMock,
      ensureWritable: ensureWritableMock,
      getFolderContents: getFolderContentsMock,
      resolveFilePath: resolveFilePathMock,
    })
    resolveFilePathMock.mockResolvedValueOnce('/game/.overlay/scene.txt')

    await expect(gameFs.readDocumentFile(AbsPath.from('/game/scene.txt'))).resolves.toEqual(new Uint8Array([1, 2, 3]))

    expect(resolveFilePathMock).toHaveBeenCalledWith('/game/scene.txt')
    expect(readFileMock).toHaveBeenCalledWith('/game/.overlay/scene.txt')
  })

  it('创建当前图标文件时只刷新图标预览资源', async () => {
    ensureWritableMock.mockResolvedValueOnce('/project/icons/favicon.ico')

    await expect(gameFs.createFile(AbsPath.from('/project/icons'), 'favicon.ico')).resolves.toBe('/project/icons/favicon.ico')

    expect(writeTextFileMock).toHaveBeenCalledWith('/project/icons/favicon.ico', '')
    expect(refreshCurrentGamePreviewAssetsMock).toHaveBeenCalledWith({ invalidate: 'icon' })
    expect(touchCurrentGameLastModifiedMock).not.toHaveBeenCalled()
  })

  it('删除当前封面文件时只刷新封面预览资源', async () => {
    await gameFs.deleteFile(AbsPath.from('/project/game/background/cover.png'), true)

    expect(deleteEntryMock).toHaveBeenCalledWith('/project/game/background/cover.png', true)
    expect(refreshCurrentGamePreviewAssetsMock).toHaveBeenCalledWith({ invalidate: 'cover' })
    expect(touchCurrentGameLastModifiedMock).not.toHaveBeenCalled()
  })

  it('底层删除边界也拒绝场景入口文件的大小写变体', async () => {
    await expect(gameFs.deleteFile(AbsPath.from('/project/game/scene/Start.TXT'), true))
      .rejects.toMatchObject({ code: 'PATH_OPERATION' })
    await expect(gameFs.renameFile(AbsPath.from('/project/game/scene/start.txt'), 'intro.txt'))
      .rejects.toMatchObject({ code: 'PATH_OPERATION' })
    await expect(gameFs.moveFile(
      AbsPath.from('/project/game/scene/START.TXT'),
      AbsPath.from('/project/game/scene/chapter'),
    )).rejects.toMatchObject({ code: 'PATH_OPERATION' })

    expect(deleteEntryMock).not.toHaveBeenCalled()
    expect(fsRenameFileMock).not.toHaveBeenCalled()
    expect(fsMoveFileMock).not.toHaveBeenCalled()
  })

  it('VFS 项目中的普通路径 rename 或 move 仍走 native adapter', async () => {
    useFileStoreMock.mockReturnValue({
      copyEntry: copyEntryMock,
      deleteEntry: deleteEntryMock,
      ensureWritable: ensureWritableMock,
      getFolderContents: getFolderContentsMock,
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
    resolvePreviewSiteMock.mockResolvedValue({
      projectPath: '/project',
      enginePath: '/engines/webgal',
      templatePath: '/templates/current',
    })
    vfsRenamePathMock.mockResolvedValue(RelPath.from('game/template/new.txt'))
    vfsMovePathMock.mockResolvedValue(RelPath.from('game/template/folder/old (1).txt'))

    await expect(gameFs.renameFile(AbsPath.from('/project/game/template/old.txt'), 'new.txt')).resolves.toEqual({
      echoMode: 'synthetic',
      newPath: '/project/game/template/new.txt',
    })
    await expect(gameFs.moveFile(
      AbsPath.from('/project/game/template/old.txt'),
      AbsPath.from('/project/game/template/folder'),
      'old (1).txt',
    )).resolves.toEqual({
      echoMode: 'synthetic',
      newPath: '/project/game/template/folder/old (1).txt',
    })

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
    expect(fsRenameFileMock).not.toHaveBeenCalledWith('/project/game/template/old.txt', 'new.txt')
    expect(fsMoveFileMock).not.toHaveBeenCalledWith('/project/game/template/old.txt', '/project/game/template/folder')
  })

  it('删除资源会把回收站意图透传给 file store', async () => {
    await gameFs.deleteFile(AbsPath.from('/project/game/bgm/theme.ogg'))
    await gameFs.deleteFile(AbsPath.from('/project/game/bgm/theme.ogg'), true)

    expect(deleteEntryMock).toHaveBeenNthCalledWith(1, '/project/game/bgm/theme.ogg', false)
    expect(deleteEntryMock).toHaveBeenNthCalledWith(2, '/project/game/bgm/theme.ogg', true)
    expect(deleteFileMock).not.toHaveBeenCalled()
  })

  it('创建同名条目时会先按 overlay 视图生成唯一名称，再解析最终可写路径', async () => {
    useFileStoreMock.mockReturnValue({
      copyEntry: copyEntryMock,
      deleteEntry: deleteEntryMock,
      ensureWritable: ensureWritableMock,
      getFolderContents: getFolderContentsMock,
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

  it('从外部导入时会按 overlay 可见内容避让同名项并写入 upper 路径', async () => {
    useFileStoreMock.mockReturnValue({
      copyEntry: copyEntryMock,
      deleteEntry: deleteEntryMock,
      ensureWritable: ensureWritableMock,
      getFolderContents: getFolderContentsMock,
      initialized: Promise.resolve(),
      resolveFilePath: resolveFilePathMock,
    })
    getFolderContentsMock.mockResolvedValueOnce([{ name: 'hero.png' }])
    ensureWritableMock.mockResolvedValueOnce('/project/.overlay/game/background/hero (1).png')
    importExternalEntryMock.mockResolvedValueOnce('hero (1).png')

    await expect(gameFs.importExternalEntry(
      AbsPath.from('C:/Downloads/hero.png'),
      AbsPath.from('/project/game/background'),
    )).resolves.toBe('/project/game/background/hero (1).png')

    expect(ensureWritableMock).toHaveBeenCalledWith('/project/game/background/hero (1).png')
    expect(importExternalEntryMock).toHaveBeenCalledWith(
      'C:/Downloads/hero.png',
      '/project/.overlay/game/background',
      'hero (1).png',
      '/project',
    )
    expect(copyEntryMock).not.toHaveBeenCalled()
    expect(resolveFilePathMock).not.toHaveBeenCalled()
    expect(touchCurrentGameLastModifiedMock).toHaveBeenCalledOnce()
  })

  it('外部导入会把解析后的可写目录传给导入命令', async () => {
    statMock.mockResolvedValueOnce({ isDirectory: false })
    importExternalEntryMock.mockResolvedValueOnce('hero.png')

    await expect(gameFs.importExternalEntry(
      AbsPath.from('C:/Downloads/hero.png'),
      AbsPath.from('/project/game/background'),
    )).resolves.toBe('/project/game/background/hero.png')

    expect(importExternalEntryMock).toHaveBeenCalledWith(
      'C:/Downloads/hero.png',
      '/project/game/background',
      'hero.png',
      '/project',
    )
    expect(touchCurrentGameLastModifiedMock).toHaveBeenCalledOnce()
  })

  it('Rust 原子占名发现物理冲突时会采用命令返回的最终名称', async () => {
    useFileStoreMock.mockReturnValue({
      copyEntry: copyEntryMock,
      deleteEntry: deleteEntryMock,
      ensureWritable: ensureWritableMock,
      getFolderContents: getFolderContentsMock,
      initialized: Promise.resolve(),
      resolveFilePath: resolveFilePathMock,
    })
    getFolderContentsMock.mockResolvedValueOnce([{ name: 'hero.png' }])
    ensureWritableMock.mockImplementation(async (path: string) => path.replace('/game/', '/.overlay/game/'))
    importExternalEntryMock.mockResolvedValueOnce('hero (2).png')

    await expect(gameFs.importExternalEntry(
      AbsPath.from('C:/Other/hero.png'),
      AbsPath.from('/project/game/background'),
    )).resolves.toBe('/project/game/background/hero (2).png')

    expect(ensureWritableMock).toHaveBeenCalledOnce()
    expect(ensureWritableMock).toHaveBeenCalledWith('/project/game/background/hero (1).png')
    expect(importExternalEntryMock).toHaveBeenCalledWith(
      'C:/Other/hero.png',
      '/project/.overlay/game/background',
      'hero (1).png',
      '/project',
    )
  })

  it('拒绝把外部内容写到当前项目外', async () => {
    await expect(gameFs.importExternalEntry(
      AbsPath.from('C:/Downloads/hero.png'),
      AbsPath.from('/other/game/background'),
    )).rejects.toMatchObject({ code: 'PATH_DENIED' })

    expect(importExternalEntryMock).not.toHaveBeenCalled()
  })
})
