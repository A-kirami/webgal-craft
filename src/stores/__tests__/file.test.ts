import '~/__tests__/setup'

import { LRUCache } from 'lru-cache'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AbsPath, normalizePosix } from '~/domain/path'
import { registerPendingFileWrite, rollbackPendingFileWrite } from '~/services/file-write-echo-registry'
import { useFileStore } from '~/stores/file'

import type { readDirectoryItemsCached } from '~/services/directory-cache'
import type { VfsDirEntry } from '~/types/project-config'
import type { handleError } from '~/utils/error-handler'

const {
  clearDirectoryItemsCacheMock,
  fileSystemEventsEmitMock,
  existsMock,
  getGameEnginePathMock,
  handleErrorMock,
  invalidateDirectoryItemsCacheMock,
  loggerErrorMock,
  loggerWarnMock,
  projectConfigPathMock,
  readFileMock,
  readDirectoryItemsCachedMock,
  resolvePreviewSiteMock,
  statMock,
  useWorkspaceStoreMock,
  vfsCopyPathMock,
  vfsDeletePathMock,
  vfsEnsureWritableMock,
  vfsListDirMock,
  vfsMovePathMock,
  vfsRenamePathMock,
  vfsResolvePathMock,
  watchFsMock,
} = vi.hoisted(() => ({
  clearDirectoryItemsCacheMock: vi.fn(),
  fileSystemEventsEmitMock: vi.fn(),
  existsMock: vi.fn(),
  getGameEnginePathMock: vi.fn<(game: { path: string, engineId?: string }) => Promise<string | undefined>>(),
  handleErrorMock: vi.fn<typeof handleError>(),
  invalidateDirectoryItemsCacheMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  loggerWarnMock: vi.fn(),
  projectConfigPathMock: vi.fn((gamePath: string) => `${gamePath}/project.wgcp`),
  readFileMock: vi.fn(),
  readDirectoryItemsCachedMock: vi.fn<typeof readDirectoryItemsCached>(),
  resolvePreviewSiteMock: vi.fn(),
  statMock: vi.fn(),
  useWorkspaceStoreMock: vi.fn(),
  vfsCopyPathMock: vi.fn(),
  vfsDeletePathMock: vi.fn(),
  vfsEnsureWritableMock: vi.fn(),
  vfsListDirMock: vi.fn<(args: { projectPath: string, enginePath: string, relPath: string, templatePath?: string }) => Promise<VfsDirEntry[]>>(),
  vfsMovePathMock: vi.fn(),
  vfsRenamePathMock: vi.fn(),
  vfsResolvePathMock: vi.fn(),
  watchFsMock: vi.fn(),
}))

const emittedEvents: Record<string, unknown>[] = []
let workspaceStoreState = reactive<{
  CWD?: string
  currentGame?: {
    engineId?: string
    path: string
  }
}>({
  CWD: undefined,
  currentGame: undefined,
})

let watchHandler: ((event: Record<string, unknown>) => Promise<void>) | undefined
let pendingWrites: ReturnType<typeof registerPendingFileWrite>[] = []

vi.mock('@tauri-apps/plugin-fs', () => ({
  exists: existsMock,
  readFile: readFileMock,
  stat: statMock,
  watch: watchFsMock,
}))

vi.mock('@tauri-apps/plugin-log', () => ({
  error: loggerErrorMock,
  warn: loggerWarnMock,
  debug: vi.fn(),
  info: vi.fn(),
  attachConsole: vi.fn(),
}))

vi.mock('~/plugins/mime', () => ({
  mime: {
    getType: (path: string) => (path.endsWith('.png') ? 'image/png' : 'text/plain'),
  },
}))

vi.mock('~build/meta', () => ({
  isDebug: false,
}))

vi.mock('~/stores/workspace', () => ({
  useWorkspaceStore: useWorkspaceStoreMock,
}))

vi.mock('~/composables/useFileSystemEvents', () => ({
  useFileSystemEvents: () => ({
    emit: fileSystemEventsEmitMock,
  }),
}))

vi.mock('~/services/directory-cache', () => ({
  readDirectoryItemsCached: readDirectoryItemsCachedMock,
  invalidateDirectoryItemsCache: invalidateDirectoryItemsCacheMock,
  clearDirectoryItemsCache: clearDirectoryItemsCacheMock,
}))

vi.mock('~/services/platform/app-paths', () => ({
  gameRootDir: async (path: string) => normalizePath(`${path}/game`),
  projectConfigPath: projectConfigPathMock,
}))

vi.mock('~/utils/error-handler', () => ({
  handleError: handleErrorMock,
}))

vi.mock('~/services/game-manager', () => ({
  gameManager: {
    getGameEnginePath: getGameEnginePathMock,
    resolvePreviewSite: resolvePreviewSiteMock,
  },
}))

vi.mock('~/commands/vfs', () => ({
  vfsCmds: {
    copyPath: vfsCopyPathMock,
    deletePath: vfsDeletePathMock,
    ensureWritable: vfsEnsureWritableMock,
    listDir: vfsListDirMock,
    movePath: vfsMovePathMock,
    renamePath: vfsRenamePathMock,
    resolvePath: vfsResolvePathMock,
  },
}))

function normalizePath(path: string): string {
  return normalizePosix(path)
}

function createFileViewerItem(path: string, isDir: boolean) {
  const normalizedPath = normalizePath(path)
  return {
    name: normalizedPath.split('/').at(-1)!,
    path: normalizedPath,
    isDir,
    mimeType: isDir ? undefined : 'text/plain',
    size: isDir ? undefined : 12,
    modifiedAt: 1,
    createdAt: 2,
  }
}

function createStatResult(path: string, isDirectory: boolean) {
  return {
    isDirectory,
    size: isDirectory ? undefined : 12,
    mtime: new Date(`2026-03-18T00:00:0${path.length % 10}.000Z`),
    birthtime: new Date(`2026-03-17T00:00:0${path.length % 10}.000Z`),
  }
}

function captureFileStoreCaches() {
  const setSpy = vi.spyOn(LRUCache.prototype, 'set')

  function findCache<TValue extends object | string>(
    predicate: (value: unknown) => value is TValue,
  ): LRUCache<string, TValue> | undefined {
    const callIndex = setSpy.mock.calls.findIndex(([, value]) => predicate(value))
    if (callIndex === -1) {
      return undefined
    }

    const cache = setSpy.mock.contexts[callIndex]
    return cache instanceof LRUCache ? cache as LRUCache<string, TValue> : undefined
  }

  return {
    get items() {
      return findCache((value): value is { path: string } =>
        !!value && typeof value === 'object' && 'path' in value,
      )
    },
    get pathToId() {
      return findCache((value): value is string => typeof value === 'string')
    },
    restore() {
      setSpy.mockRestore()
    },
  }
}

describe('文件状态仓库', () => {
  beforeEach(() => {
    pendingWrites = []
    existsMock.mockReset()
    getGameEnginePathMock.mockReset()
    statMock.mockReset()
    watchFsMock.mockReset()
    readDirectoryItemsCachedMock.mockReset()
    invalidateDirectoryItemsCacheMock.mockReset()
    clearDirectoryItemsCacheMock.mockReset()
    handleErrorMock.mockReset()
    loggerErrorMock.mockReset()
    loggerWarnMock.mockReset()
    projectConfigPathMock.mockClear()
    readFileMock.mockReset()
    resolvePreviewSiteMock.mockReset()
    vfsCopyPathMock.mockReset()
    vfsDeletePathMock.mockReset()
    vfsEnsureWritableMock.mockReset()
    vfsListDirMock.mockReset()
    vfsMovePathMock.mockReset()
    vfsRenamePathMock.mockReset()
    vfsResolvePathMock.mockReset()
    fileSystemEventsEmitMock.mockReset()
    fileSystemEventsEmitMock.mockImplementation((event: Record<string, unknown>) => {
      emittedEvents.push(event)
    })
    emittedEvents.length = 0
    watchHandler = undefined
    workspaceStoreState = reactive({
      CWD: undefined,
      currentGame: undefined,
    })
    useWorkspaceStoreMock.mockReturnValue(workspaceStoreState)
    resolvePreviewSiteMock.mockRejectedValue(new Error('preview site unavailable'))
    readFileMock.mockResolvedValue(new Uint8Array())

    watchFsMock.mockImplementation(async (_path: string, handler: typeof watchHandler) => {
      watchHandler = handler
      return () => undefined
    })
  })

  afterEach(() => {
    for (const pendingWrite of pendingWrites) {
      rollbackPendingFileWrite(pendingWrite)
    }
    vi.clearAllTimers()
    vi.useRealTimers()
  })

  it('getFolderContents 会懒加载目录内容并复用缓存结果', async () => {
    existsMock.mockResolvedValue(true)
    readDirectoryItemsCachedMock.mockResolvedValue([
      createFileViewerItem('/root/scene', true),
      createFileViewerItem('/root/readme.txt', false),
    ])

    const store = useFileStore()

    const firstRead = await store.getFolderContents(AbsPath.from('/root'))
    const secondRead = await store.getFolderContents(AbsPath.from('/root'))

    expect(readDirectoryItemsCachedMock).toHaveBeenCalledTimes(1)
    expect(firstRead.map(item => item.path)).toEqual(['/root/scene', '/root/readme.txt'])
    expect(secondRead.map(item => item.path)).toEqual(['/root/scene', '/root/readme.txt'])
  })

  it('initialize 后 create/remove 事件会同步到目录内容与事件总线', async () => {
    existsMock.mockResolvedValue(true)
    statMock.mockImplementation(async (path: string) => createStatResult(String(path), false))
    readDirectoryItemsCachedMock.mockImplementation(async (path: string) => {
      if (path === '/workspace/game') {
        return [createFileViewerItem('/workspace/game/scene', true)]
      }
      return []
    })

    const store = useFileStore()
    workspaceStoreState.CWD = '/workspace'
    await vi.waitFor(() => {
      expect(watchFsMock).toHaveBeenCalledTimes(1)
    })
    await watchHandler?.({
      type: { create: {} },
      paths: ['/workspace/game/new.txt'],
    })

    const afterCreate = await store.getFolderContents(AbsPath.from('/workspace/game'))
    expect(afterCreate.map(item => item.path)).toContain('/workspace/game/new.txt')
    expect(emittedEvents).toContainEqual(expect.objectContaining({
      type: 'file:created',
      path: '/workspace/game/new.txt',
    }))

    await watchHandler?.({
      type: { remove: {} },
      paths: ['/workspace/game/new.txt'],
    })

    const afterRemove = await store.getFolderContents(AbsPath.from('/workspace/game'))
    expect(afterRemove.map(item => item.path)).not.toContain('/workspace/game/new.txt')
    expect(emittedEvents).toContainEqual(expect.objectContaining({
      type: 'file:removed',
      path: '/workspace/game/new.txt',
    }))
  })

  it('rename 事件会更新现有节点的路径与名称', async () => {
    existsMock.mockResolvedValue(true)
    statMock.mockImplementation(async (path: string) => createStatResult(String(path), false))
    readDirectoryItemsCachedMock.mockResolvedValue([
      createFileViewerItem('/workspace/game/old.txt', false),
    ])

    const store = useFileStore()
    workspaceStoreState.CWD = '/workspace'
    await vi.waitFor(() => {
      expect(watchFsMock).toHaveBeenCalledTimes(1)
    })
    await watchHandler?.({
      type: { modify: { kind: 'rename' } },
      paths: ['/workspace/game/old.txt', '/workspace/game/new.txt'],
    })

    const items = await store.getFolderContents(AbsPath.from('/workspace/game'))
    expect(items).toEqual([
      expect.objectContaining({
        name: 'new.txt',
        path: '/workspace/game/new.txt',
      }),
    ])
    expect(emittedEvents).toContainEqual(expect.objectContaining({
      type: 'file:renamed',
      oldPath: '/workspace/game/old.txt',
      newPath: '/workspace/game/new.txt',
    }))
  })

  it('未加载到缓存的路径收到 modify 事件时仍会发布文件变更通知', async () => {
    existsMock.mockResolvedValue(true)
    statMock.mockImplementation(async (path: string) => {
      if (path === '/workspace/game/unloaded.txt') {
        return createStatResult(path, false)
      }
      return createStatResult(path, true)
    })
    readDirectoryItemsCachedMock.mockResolvedValue([])

    useFileStore()
    workspaceStoreState.CWD = '/workspace'
    await vi.waitFor(() => {
      expect(watchFsMock).toHaveBeenCalledTimes(1)
    })
    await watchHandler?.({
      type: { modify: { kind: 'data' } },
      paths: ['/workspace/game/unloaded.txt'],
    })

    expect(emittedEvents).toContainEqual(expect.objectContaining({
      type: 'file:modified',
      path: '/workspace/game/unloaded.txt',
    }))
  })

  it('命中自写入回响且磁盘字节一致时不会广播 file:modified', async () => {
    existsMock.mockResolvedValue(true)
    statMock.mockImplementation(async (path: string) => createStatResult(String(path), false))
    readDirectoryItemsCachedMock.mockResolvedValue([
      createFileViewerItem('/workspace/game/echo-loaded.txt', false),
    ])

    const expectedBytes = new Uint8Array([104, 101, 108, 108, 111])
    readFileMock.mockResolvedValue(expectedBytes)

    pendingWrites.push(registerPendingFileWrite(AbsPath.from('/workspace/game/echo-loaded.txt'), expectedBytes))

    const store = useFileStore()
    workspaceStoreState.CWD = '/workspace'
    await vi.waitFor(() => {
      expect(watchFsMock).toHaveBeenCalledTimes(1)
    })

    await store.getFolderContents(AbsPath.from('/workspace/game'))
    emittedEvents.length = 0
    await watchHandler?.({
      type: { modify: { kind: 'data' } },
      paths: ['/workspace/game/echo-loaded.txt'],
    })

    expect(readFileMock).toHaveBeenCalledWith('/workspace/game/echo-loaded.txt')
    expect(emittedEvents).toContainEqual(expect.objectContaining({
      type: 'file:written',
      path: '/workspace/game/echo-loaded.txt',
    }))
    expect(emittedEvents).not.toContainEqual(expect.objectContaining({
      type: 'file:modified',
      path: '/workspace/game/echo-loaded.txt',
    }))
  })

  it('未加载到缓存的路径命中自写入回响时仍会吞掉 file:modified', async () => {
    existsMock.mockResolvedValue(true)
    statMock.mockImplementation(async (path: string) => createStatResult(String(path), false))
    readDirectoryItemsCachedMock.mockResolvedValue([])

    const expectedBytes = new Uint8Array([111, 107])
    readFileMock.mockResolvedValue(expectedBytes)

    pendingWrites.push(registerPendingFileWrite(AbsPath.from('/workspace/game/echo-unloaded.txt'), expectedBytes))

    useFileStore()
    workspaceStoreState.CWD = '/workspace'
    await vi.waitFor(() => {
      expect(watchFsMock).toHaveBeenCalledTimes(1)
    })

    emittedEvents.length = 0
    await watchHandler?.({
      type: { modify: { kind: 'data' } },
      paths: ['/workspace/game/echo-unloaded.txt'],
    })

    expect(readFileMock).toHaveBeenCalledWith('/workspace/game/echo-unloaded.txt')
    expect(emittedEvents).toContainEqual(expect.objectContaining({
      type: 'file:written',
      path: '/workspace/game/echo-unloaded.txt',
    }))
    expect(emittedEvents).not.toContainEqual(expect.objectContaining({
      type: 'file:modified',
      path: '/workspace/game/echo-unloaded.txt',
    }))
  })

  it('命中待回响路径但磁盘字节不一致时仍广播外部修改', async () => {
    existsMock.mockResolvedValue(true)
    statMock.mockImplementation(async (path: string) => createStatResult(String(path), false))
    readDirectoryItemsCachedMock.mockResolvedValue([
      createFileViewerItem('/workspace/game/echo-mismatch.txt', false),
    ])

    readFileMock.mockResolvedValue(new Uint8Array([98, 121, 101]))

    pendingWrites.push(registerPendingFileWrite(AbsPath.from('/workspace/game/echo-mismatch.txt'), new Uint8Array([104, 101, 108, 108, 111])))

    const store = useFileStore()
    workspaceStoreState.CWD = '/workspace'
    await vi.waitFor(() => {
      expect(watchFsMock).toHaveBeenCalledTimes(1)
    })

    await store.getFolderContents(AbsPath.from('/workspace/game'))
    emittedEvents.length = 0
    await watchHandler?.({
      type: { modify: { kind: 'data' } },
      paths: ['/workspace/game/echo-mismatch.txt'],
    })

    expect(readFileMock).toHaveBeenCalledWith('/workspace/game/echo-mismatch.txt')
    expect(emittedEvents).toContainEqual(expect.objectContaining({
      type: 'file:modified',
      path: '/workspace/game/echo-mismatch.txt',
    }))
  })

  it('命中待回响路径且字节在短暂波动后稳定时仍识别为自写入回响', async () => {
    existsMock.mockResolvedValue(true)
    statMock.mockImplementation(async (path: string) => createStatResult(String(path), false))
    readDirectoryItemsCachedMock.mockResolvedValue([
      createFileViewerItem('/workspace/game/echo-partial.txt', false),
    ])

    const expectedBytes = new Uint8Array([104, 101, 108, 108, 111])
    readFileMock
      .mockResolvedValueOnce(new Uint8Array([104, 101]))
      .mockResolvedValueOnce(expectedBytes)
      .mockResolvedValue(expectedBytes)

    pendingWrites.push(registerPendingFileWrite(AbsPath.from('/workspace/game/echo-partial.txt'), expectedBytes))

    const store = useFileStore()
    workspaceStoreState.CWD = '/workspace'
    await vi.waitFor(() => {
      expect(watchFsMock).toHaveBeenCalledTimes(1)
    })

    await store.getFolderContents(AbsPath.from('/workspace/game'))
    emittedEvents.length = 0
    await watchHandler?.({
      type: { modify: { kind: 'data' } },
      paths: ['/workspace/game/echo-partial.txt'],
    })

    expect(readFileMock).toHaveBeenCalledTimes(3)
    expect(emittedEvents).toContainEqual(expect.objectContaining({
      type: 'file:written',
      path: '/workspace/game/echo-partial.txt',
    }))
    expect(emittedEvents).not.toContainEqual(expect.objectContaining({
      type: 'file:modified',
      path: '/workspace/game/echo-partial.txt',
    }))
  })

  it('未加载到缓存的路径收到 remove 事件时仍会发布删除通知', async () => {
    existsMock.mockResolvedValue(true)
    readDirectoryItemsCachedMock.mockResolvedValue([])

    useFileStore()
    workspaceStoreState.CWD = '/workspace'
    await vi.waitFor(() => {
      expect(watchFsMock).toHaveBeenCalledTimes(1)
    })
    await watchHandler?.({
      type: { remove: { kind: 'file' } },
      paths: ['/workspace/game/unloaded.txt'],
    })

    expect(emittedEvents).toContainEqual(expect.objectContaining({
      type: 'file:removed',
      path: '/workspace/game/unloaded.txt',
    }))
  })

  it('未加载到缓存的路径收到 rename 事件时仍会发布重命名通知', async () => {
    existsMock.mockResolvedValue(true)
    statMock.mockImplementation(async (path: string) => {
      if (path === '/workspace/game/renamed.txt') {
        return createStatResult(path, false)
      }
      return createStatResult(path, true)
    })
    readDirectoryItemsCachedMock.mockResolvedValue([])

    useFileStore()
    workspaceStoreState.CWD = '/workspace'
    await vi.waitFor(() => {
      expect(watchFsMock).toHaveBeenCalledTimes(1)
    })
    await watchHandler?.({
      type: { modify: { kind: 'rename' } },
      paths: ['/workspace/game/original.txt', '/workspace/game/renamed.txt'],
    })

    expect(emittedEvents).toContainEqual(expect.objectContaining({
      type: 'file:renamed',
      oldPath: '/workspace/game/original.txt',
      newPath: '/workspace/game/renamed.txt',
    }))
  })

  it('VFS 模式下收到已代理条目的 create 事件时不会重复追加同一子项', async () => {
    existsMock.mockImplementation(async (path: string) => path === '/workspace/project.wgcp')
    getGameEnginePathMock.mockResolvedValue('/engines/webgal')
    statMock.mockImplementation(async (path: string) => createStatResult(path, false))
    vfsListDirMock.mockResolvedValueOnce([{
      isDir: false,
      name: 'scene.txt',
      source: 'upper',
    }])

    workspaceStoreState = reactive({
      CWD: '/workspace',
      currentGame: {
        engineId: 'engine-1',
        path: '/workspace',
      },
    })
    useWorkspaceStoreMock.mockReturnValue(workspaceStoreState)

    const store = useFileStore()
    await vi.waitFor(() => {
      expect(watchFsMock).toHaveBeenCalledTimes(1)
    })

    const before = await store.getFolderContents(AbsPath.from('/workspace/game'))
    expect(before).toEqual([
      expect.objectContaining({
        path: '/workspace/game/scene.txt',
      }),
    ])

    await watchHandler?.({
      type: { create: {} },
      paths: ['/workspace/game/scene.txt'],
    })

    const after = await store.getFolderContents(AbsPath.from('/workspace/game'))
    expect(after).toEqual([
      expect.objectContaining({
        path: '/workspace/game/scene.txt',
      }),
    ])
  })

  it('VFS rename 后目录视图会反映新路径', async () => {
    existsMock.mockImplementation(async (path: string) => path === '/workspace/project.wgcp')
    getGameEnginePathMock.mockResolvedValue('/engines/webgal')
    statMock.mockImplementation(async (path: string) => createStatResult(path, false))
    vfsRenamePathMock.mockResolvedValue('game/renamed.txt')
    vfsListDirMock.mockResolvedValueOnce([{
      isDir: false,
      name: 'original.txt',
      source: 'upper',
    }])

    workspaceStoreState = reactive({
      CWD: '/workspace',
      currentGame: {
        engineId: 'engine-1',
        path: '/workspace',
      },
    })
    useWorkspaceStoreMock.mockReturnValue(workspaceStoreState)

    const store = useFileStore()
    await vi.waitFor(() => {
      expect(watchFsMock).toHaveBeenCalledTimes(1)
    })

    const before = await store.getFolderContents(AbsPath.from('/workspace/game'))
    expect(before).toEqual([
      expect.objectContaining({
        path: '/workspace/game/original.txt',
      }),
    ])

    await store.renameEntry(AbsPath.from('/workspace/game/original.txt'), 'renamed.txt')

    const after = await store.getFolderContents(AbsPath.from('/workspace/game'))
    expect(after).toEqual([
      expect.objectContaining({
        path: '/workspace/game/renamed.txt',
      }),
    ])
    expect(vfsRenamePathMock).toHaveBeenCalledWith({
      projectPath: '/workspace',
      enginePath: '/engines/webgal',
      templatePath: undefined,
      relPath: 'game/original.txt',
      newName: 'renamed.txt',
    })
  })

  it('VFS move 会调用后端 move 语义并在目标目录按 overlay 结果刷新', async () => {
    existsMock.mockImplementation(async (path: string) => path === '/workspace/project.wgcp')
    getGameEnginePathMock.mockResolvedValue('/engines/webgal')
    statMock.mockImplementation(async (path: string) => createStatResult(path, false))
    vfsResolvePathMock.mockResolvedValue('/engines/webgal/game/original.txt')
    vfsMovePathMock.mockResolvedValue('game/folder/original.txt')
    vfsListDirMock
      .mockResolvedValueOnce([
        {
          isDir: false,
          name: 'original.txt',
          source: 'upper',
        },
        {
          isDir: true,
          name: 'folder',
          source: 'upper',
        },
      ])
      .mockResolvedValueOnce([])

    workspaceStoreState = reactive({
      CWD: '/workspace',
      currentGame: {
        engineId: 'engine-1',
        path: '/workspace',
      },
    })
    useWorkspaceStoreMock.mockReturnValue(workspaceStoreState)

    const store = useFileStore()
    await vi.waitFor(() => {
      expect(watchFsMock).toHaveBeenCalledTimes(1)
    })

    const before = await store.getFolderContents(AbsPath.from('/workspace/game'))
    expect(before).toEqual(expect.arrayContaining([
      expect.objectContaining({
        path: '/workspace/game/folder',
      }),
      expect.objectContaining({
        path: '/workspace/game/original.txt',
      }),
    ]))

    await store.moveEntry(AbsPath.from('/workspace/game/original.txt'), AbsPath.from('/workspace/game/folder'))

    const after = await store.getFolderContents(AbsPath.from('/workspace/game/folder'))
    expect(after).toEqual([
      expect.objectContaining({
        path: '/workspace/game/folder/original.txt',
      }),
    ])
    expect(vfsMovePathMock).toHaveBeenCalledWith({
      projectPath: '/workspace',
      enginePath: '/engines/webgal',
      templatePath: undefined,
      relPath: 'game/original.txt',
      targetRelPath: 'game/folder/original.txt',
    })
  })

  it('pathToId 与 items LRU 脱同步时会自动恢复而非抛错', async () => {
    existsMock.mockResolvedValue(true)
    readDirectoryItemsCachedMock
      .mockResolvedValueOnce([
        createFileViewerItem('/root/scene', true),
      ])
      .mockResolvedValueOnce([
        createFileViewerItem('/root/scene', true),
      ])

    const caches = captureFileStoreCaches()

    try {
      const store = useFileStore()
      const firstRead = await store.getFolderContents(AbsPath.from('/root'))
      expect(firstRead.map(item => item.path)).toEqual(['/root/scene'])
      expect(readDirectoryItemsCachedMock).toHaveBeenCalledTimes(1)

      const pathToId = caches.pathToId
      const items = caches.items
      expect(pathToId).toBeDefined()
      expect(items).toBeDefined()

      const parentId = pathToId!.get('/root')
      expect(parentId).toBeDefined()

      items!.delete(parentId!)
      expect(pathToId!.get('/root')).toBe(parentId)
      expect(items!.has(parentId!)).toBe(false)

      const secondRead = await store.getFolderContents(AbsPath.from('/root'))
      expect(secondRead.map(item => item.path)).toEqual(['/root/scene'])
      expect(readDirectoryItemsCachedMock).toHaveBeenCalledTimes(2)
    } finally {
      caches.restore()
    }
  })

  it('Windows 盘符大小写不同的路径会命中同一个缓存项', async () => {
    existsMock.mockResolvedValue(true)
    statMock.mockImplementation(async (path: string) => createStatResult(path, path.endsWith('/game')))
    readDirectoryItemsCachedMock.mockResolvedValue([
      createFileViewerItem('C:/workspace/game/scene.txt', false),
    ])

    workspaceStoreState = reactive({
      CWD: 'c:/workspace',
      currentGame: {
        path: 'c:/workspace',
      },
    })
    useWorkspaceStoreMock.mockReturnValue(workspaceStoreState)

    const store = useFileStore()

    const items = await store.getFolderContents(AbsPath.from('c:/workspace/game'))
    const sameItem = store.getItemByPath(AbsPath.from('c:/workspace/game/scene.txt'))

    expect(items).toHaveLength(1)
    expect(sameItem?.path).toBe('C:/workspace/game/scene.txt')
  })

  it('并发 getFolderContents 不会因加载锁缺失而返回空列表', async () => {
    let callCount = 0
    let resolveListDir: ((value: VfsDirEntry[]) => void) | undefined
    existsMock.mockImplementation(async (path: string) => path === '/workspace/project.wgcp')
    getGameEnginePathMock.mockResolvedValue('/engines/webgal')
    vfsListDirMock.mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        // 初始化调用，立即返回
        return Promise.resolve([{
          isDir: true,
          name: 'scene',
          source: 'upper',
        }])
      }
      // 第二次调用（并发目标），延迟 resolve
      return new Promise((resolve) => {
        resolveListDir = resolve
      })
    })

    workspaceStoreState = reactive({
      CWD: '/workspace',
      currentGame: {
        engineId: 'engine-1',
        path: '/workspace',
      },
    })
    useWorkspaceStoreMock.mockReturnValue(workspaceStoreState)

    const store = useFileStore()
    await vi.waitFor(() => {
      expect(watchFsMock).toHaveBeenCalledTimes(1)
    })

    // 初始化完成后 game 目录已加载，scene 子目录待加载
    // 并发发起两次对 scene 子目录的加载
    const loadA = store.getFolderContents(AbsPath.from('/workspace/game/scene'))
    const loadB = store.getFolderContents(AbsPath.from('/workspace/game/scene'))

    await vi.waitFor(() => {
      expect(resolveListDir).toBeDefined()
    })

    resolveListDir!([{
      isDir: false,
      name: 'start.txt',
      source: 'upper',
    }])

    const [resultA, resultB] = await Promise.all([loadA, loadB])

    expect(resultA.map(item => item.path)).toEqual(['/workspace/game/scene/start.txt'])
    expect(resultB.map(item => item.path)).toEqual(['/workspace/game/scene/start.txt'])
    // 初始化 1 次 + scene 目录 1 次 = 2 次（加载锁保证 scene 只调用一次）
    expect(vfsListDirMock).toHaveBeenCalledTimes(2)
  })

  it('子项全部被 LRU 驱逐后 getFolderContents 会自动重新加载', async () => {
    existsMock.mockResolvedValue(true)
    readDirectoryItemsCachedMock
      .mockResolvedValueOnce([
        createFileViewerItem('/root/file-a.txt', false),
        createFileViewerItem('/root/file-b.txt', false),
      ])
      .mockResolvedValueOnce([
        createFileViewerItem('/root/file-a.txt', false),
        createFileViewerItem('/root/file-b.txt', false),
      ])

    const caches = captureFileStoreCaches()

    try {
      const store = useFileStore()

      const firstRead = await store.getFolderContents(AbsPath.from('/root'))
      expect(firstRead).toHaveLength(2)
      expect(readDirectoryItemsCachedMock).toHaveBeenCalledTimes(1)

      const pathToId = caches.pathToId
      const items = caches.items
      expect(pathToId).toBeDefined()
      expect(items).toBeDefined()

      const parentId = pathToId!.get('/root')
      const childIds = ['/root/file-a.txt', '/root/file-b.txt'].map(path => pathToId!.get(path))
      expect(parentId).toBeDefined()
      expect(childIds).toEqual([expect.any(String), expect.any(String)])

      for (const childId of childIds) {
        items!.delete(childId!)
        expect(items!.has(childId!)).toBe(false)
      }
      expect(items!.has(parentId!)).toBe(true)

      const secondRead = await store.getFolderContents(AbsPath.from('/root'))
      expect(secondRead.map(item => item.path)).toEqual(['/root/file-a.txt', '/root/file-b.txt'])
      expect(readDirectoryItemsCachedMock).toHaveBeenCalledTimes(2)
    } finally {
      caches.restore()
    }
  })

  it('部分子项被 LRU 驱逐后 getFolderContents 也会自动重新加载', async () => {
    existsMock.mockResolvedValue(true)
    readDirectoryItemsCachedMock
      .mockResolvedValueOnce([
        createFileViewerItem('/root/file-a.txt', false),
        createFileViewerItem('/root/file-b.txt', false),
      ])
      .mockResolvedValueOnce([
        createFileViewerItem('/root/file-a.txt', false),
        createFileViewerItem('/root/file-b.txt', false),
      ])

    const caches = captureFileStoreCaches()

    try {
      const store = useFileStore()

      const firstRead = await store.getFolderContents(AbsPath.from('/root'))
      expect(firstRead).toHaveLength(2)
      expect(readDirectoryItemsCachedMock).toHaveBeenCalledTimes(1)

      const pathToId = caches.pathToId
      const items = caches.items
      const evictedId = pathToId!.get('/root/file-a.txt')
      expect(evictedId).toBeDefined()
      items!.delete(evictedId!)

      const secondRead = await store.getFolderContents(AbsPath.from('/root'))
      expect(secondRead.map(item => item.path)).toEqual(['/root/file-a.txt', '/root/file-b.txt'])
      expect(readDirectoryItemsCachedMock).toHaveBeenCalledTimes(2)
    } finally {
      caches.restore()
    }
  })

  it('VFS 写操作会携带 templatePath 传给 rename/delete/ensureWritable/resolveFilePath', async () => {
    existsMock.mockImplementation(async (path: string) => path === '/workspace/project.wgcp')
    resolvePreviewSiteMock.mockResolvedValue({
      projectPath: '/workspace',
      enginePath: '/engines/webgal',
      templatePath: '/templates/current',
    })
    statMock.mockImplementation(async (path: string) => createStatResult(path, false))
    vfsRenamePathMock.mockResolvedValue('game/renamed.txt')
    vfsDeletePathMock.mockResolvedValue(undefined)
    vfsEnsureWritableMock.mockResolvedValue('/workspace/game/renamed.txt')
    vfsResolvePathMock.mockResolvedValue('/templates/current/game/renamed.txt')
    vfsListDirMock.mockResolvedValueOnce([{
      isDir: false,
      name: 'original.txt',
      source: 'upper',
    }])

    workspaceStoreState = reactive({
      CWD: '/workspace',
      currentGame: {
        engineId: 'engine-1',
        path: '/workspace',
      },
    })
    useWorkspaceStoreMock.mockReturnValue(workspaceStoreState)

    const store = useFileStore()
    await vi.waitFor(() => {
      expect(watchFsMock).toHaveBeenCalledTimes(1)
    })

    await store.renameEntry(AbsPath.from('/workspace/game/original.txt'), 'renamed.txt')
    await store.ensureWritable(AbsPath.from('/workspace/game/renamed.txt'))
    await store.resolveFilePath(AbsPath.from('/workspace/game/renamed.txt'))
    await store.deleteEntry(AbsPath.from('/workspace/game/renamed.txt'))

    expect(vfsRenamePathMock).toHaveBeenCalledWith({
      projectPath: '/workspace',
      enginePath: '/engines/webgal',
      templatePath: '/templates/current',
      relPath: 'game/original.txt',
      newName: 'renamed.txt',
    })
    expect(vfsEnsureWritableMock).toHaveBeenCalledWith({
      projectPath: '/workspace',
      enginePath: '/engines/webgal',
      templatePath: '/templates/current',
      relPath: 'game/renamed.txt',
    })
    expect(vfsResolvePathMock).toHaveBeenCalledWith({
      projectPath: '/workspace',
      enginePath: '/engines/webgal',
      templatePath: '/templates/current',
      relPath: 'game/renamed.txt',
    })
    expect(vfsDeletePathMock).toHaveBeenCalledWith({
      projectPath: '/workspace',
      enginePath: '/engines/webgal',
      templatePath: '/templates/current',
      relPath: 'game/renamed.txt',
    })
  })

  it('VFS copy 和 move 会在 resolvePath 与后续命令中携带 templatePath', async () => {
    existsMock.mockImplementation(async (path: string) => path === '/workspace/project.wgcp')
    resolvePreviewSiteMock.mockResolvedValue({
      projectPath: '/workspace',
      enginePath: '/engines/webgal',
      templatePath: '/templates/current',
    })
    statMock.mockImplementation(async (path: string) => createStatResult(path, false))
    vfsResolvePathMock.mockResolvedValue('/templates/current/game/original.txt')
    vfsCopyPathMock.mockResolvedValue('game/folder-copy/original.txt')
    vfsMovePathMock.mockResolvedValue('game/folder-move/original.txt')
    vfsListDirMock
      .mockResolvedValueOnce([
        {
          isDir: false,
          name: 'original.txt',
          source: 'upper',
        },
        {
          isDir: true,
          name: 'folder-copy',
          source: 'upper',
        },
        {
          isDir: true,
          name: 'folder-move',
          source: 'upper',
        },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])

    workspaceStoreState = reactive({
      CWD: '/workspace',
      currentGame: {
        engineId: 'engine-1',
        path: '/workspace',
      },
    })
    useWorkspaceStoreMock.mockReturnValue(workspaceStoreState)

    const store = useFileStore()
    await vi.waitFor(() => {
      expect(watchFsMock).toHaveBeenCalledTimes(1)
    })

    await store.copyEntry(AbsPath.from('/workspace/game/original.txt'), AbsPath.from('/workspace/game/folder-copy'))
    await store.moveEntry(AbsPath.from('/workspace/game/original.txt'), AbsPath.from('/workspace/game/folder-move'))

    expect(vfsResolvePathMock).toHaveBeenNthCalledWith(1, {
      projectPath: '/workspace',
      enginePath: '/engines/webgal',
      templatePath: '/templates/current',
      relPath: 'game/original.txt',
    })
    expect(vfsResolvePathMock).toHaveBeenNthCalledWith(2, {
      projectPath: '/workspace',
      enginePath: '/engines/webgal',
      templatePath: '/templates/current',
      relPath: 'game/original.txt',
    })
    expect(vfsCopyPathMock).toHaveBeenCalledWith({
      projectPath: '/workspace',
      enginePath: '/engines/webgal',
      templatePath: '/templates/current',
      relPath: 'game/original.txt',
      targetRelPath: 'game/folder-copy/original.txt',
    })
    expect(vfsMovePathMock).toHaveBeenCalledWith({
      projectPath: '/workspace',
      enginePath: '/engines/webgal',
      templatePath: '/templates/current',
      relPath: 'game/original.txt',
      targetRelPath: 'game/folder-move/original.txt',
    })
  })

  it('refreshTemplateOverlay 后会丢弃旧 overlay 的目录结果并重新加载', async () => {
    let resolveOldTemplateList: ((value: VfsDirEntry[]) => void) | undefined

    existsMock.mockImplementation(async (path: string) => path === '/workspace/project.wgcp')
    resolvePreviewSiteMock.mockResolvedValue({
      projectPath: '/workspace',
      enginePath: '/engines/webgal',
      templatePath: '/templates/old',
    })
    vfsListDirMock.mockImplementation(async ({ relPath, templatePath }: { relPath: string, templatePath?: string }) => {
      if (relPath === '') {
        return [{
          isDir: true,
          name: 'template',
          source: 'upper',
        }]
      }

      if (relPath === 'game/template' && templatePath === '/templates/old') {
        return await new Promise<VfsDirEntry[]>((resolve) => {
          resolveOldTemplateList = resolve
        })
      }

      if (relPath === 'game/template' && templatePath === '/templates/new') {
        return [{
          isDir: false,
          name: 'new.txt',
          source: 'templateLower',
        }]
      }

      return []
    })

    workspaceStoreState = reactive({
      CWD: '/workspace',
      currentGame: {
        engineId: 'engine-1',
        path: '/workspace',
      },
    })
    useWorkspaceStoreMock.mockReturnValue(workspaceStoreState)

    const store = useFileStore()
    await vi.waitFor(() => {
      expect(watchFsMock).toHaveBeenCalledTimes(1)
    })

    const staleLoad = store.getFolderContents(AbsPath.from('/workspace/game/template'))
    await vi.waitFor(() => {
      expect(resolveOldTemplateList).toBeDefined()
    })

    await store.refreshTemplateOverlay(AbsPath.from('/workspace'), {
      nextEnginePath: AbsPath.from('/engines/webgal'),
      nextTemplatePath: AbsPath.from('/templates/new'),
    })

    const refreshedLoad = store.getFolderContents(AbsPath.from('/workspace/game/template'))
    await vi.waitFor(() => {
      expect(vfsListDirMock).toHaveBeenCalledTimes(3)
    })

    resolveOldTemplateList!([{
      isDir: false,
      name: 'old.txt',
      source: 'templateLower',
    }])

    const refreshedItems = await refreshedLoad
    await staleLoad

    expect(refreshedItems.map(item => item.path)).toEqual(['/workspace/game/template/new.txt'])

    const finalItems = await store.getFolderContents(AbsPath.from('/workspace/game/template'))
    expect(finalItems.map(item => item.path)).toEqual(['/workspace/game/template/new.txt'])
  })

  it('跨目录 moveEntry 会递归清理源子树并按 post-order 发出 removed 事件', async () => {
    existsMock.mockImplementation(async (path: string) => path === '/workspace/project.wgcp')
    getGameEnginePathMock.mockResolvedValue('/engines/webgal')
    statMock.mockImplementation(async (path: string) => createStatResult(path, false))
    vfsResolvePathMock.mockResolvedValue('/engines/webgal/game/foo')
    vfsMovePathMock.mockResolvedValue('game/dest/foo')
    vfsListDirMock.mockImplementation(async ({ relPath }: { relPath: string }) => {
      if (relPath === '') {
        return [
          { isDir: true, name: 'foo', source: 'upper' },
          { isDir: true, name: 'dest', source: 'upper' },
        ]
      }
      if (relPath === 'game/foo') {
        return [{ isDir: true, name: 'bar', source: 'upper' }]
      }
      if (relPath === 'game/foo/bar') {
        return [{ isDir: false, name: 'baz.txt', source: 'upper' }]
      }
      if (relPath === 'game/dest') {
        return []
      }
      return []
    })

    workspaceStoreState = reactive({
      CWD: '/workspace',
      currentGame: { engineId: 'engine-1', path: '/workspace' },
    })
    useWorkspaceStoreMock.mockReturnValue(workspaceStoreState)

    const store = useFileStore()
    await vi.waitFor(() => {
      expect(watchFsMock).toHaveBeenCalledTimes(1)
    })

    // 预热整棵子树
    await store.getFolderContents(AbsPath.from('/workspace/game/foo'))
    await store.getFolderContents(AbsPath.from('/workspace/game/foo/bar'))
    await store.getFolderContents(AbsPath.from('/workspace/game/dest'))

    expect(store.getItemByPath(AbsPath.from('/workspace/game/foo'))).toBeDefined()
    expect(store.getItemByPath(AbsPath.from('/workspace/game/foo/bar'))).toBeDefined()
    expect(store.getItemByPath(AbsPath.from('/workspace/game/foo/bar/baz.txt'))).toBeDefined()

    emittedEvents.length = 0
    await store.moveEntry(AbsPath.from('/workspace/game/foo'), AbsPath.from('/workspace/game/dest'))

    expect(store.getItemByPath(AbsPath.from('/workspace/game/foo'))).toBeUndefined()
    expect(store.getItemByPath(AbsPath.from('/workspace/game/foo/bar'))).toBeUndefined()
    expect(store.getItemByPath(AbsPath.from('/workspace/game/foo/bar/baz.txt'))).toBeUndefined()

    const removedPaths = emittedEvents
      .filter(event => event.type === 'file:removed' || event.type === 'directory:removed')
      .map(event => event.path)
    expect(removedPaths).toEqual([
      '/workspace/game/foo/bar/baz.txt',
      '/workspace/game/foo/bar',
      '/workspace/game/foo',
    ])
  })

  it('refreshTemplateOverlay 会同步失效父 game 目录', async () => {
    existsMock.mockImplementation(async (path: string) => path === '/workspace/project.wgcp')
    resolvePreviewSiteMock.mockResolvedValue({
      projectPath: '/workspace',
      enginePath: '/engines/webgal',
      templatePath: '/templates/old',
    })
    vfsListDirMock.mockResolvedValue([
      { isDir: true, name: 'template', source: 'upper' },
    ])

    workspaceStoreState = reactive({
      CWD: '/workspace',
      currentGame: { engineId: 'engine-1', path: '/workspace' },
    })
    useWorkspaceStoreMock.mockReturnValue(workspaceStoreState)

    const store = useFileStore()
    await vi.waitFor(() => {
      expect(watchFsMock).toHaveBeenCalledTimes(1)
    })

    await store.getFolderContents(AbsPath.from('/workspace/game'))
    const gameItem = store.getItemByPath(AbsPath.from('/workspace/game'))
    expect(gameItem).toBeDefined()
    expect(gameItem?.isDir).toBe(true)
    expect((gameItem as { isLoaded: boolean }).isLoaded).toBe(true)

    await store.refreshTemplateOverlay(AbsPath.from('/workspace'), { nextTemplatePath: AbsPath.from('/templates/new') })

    const refreshedGameItem = store.getItemByPath(AbsPath.from('/workspace/game'))
    expect((refreshedGameItem as { isLoaded: boolean }).isLoaded).toBe(false)
  })

  it('refreshTemplateOverlay 在父 game 目录尚未加载时不会抛错', async () => {
    existsMock.mockImplementation(async (path: string) => path === '/workspace/project.wgcp')
    resolvePreviewSiteMock.mockResolvedValue({
      projectPath: '/workspace',
      enginePath: '/engines/webgal',
      templatePath: '/templates/old',
    })
    vfsListDirMock.mockResolvedValue([])

    workspaceStoreState = reactive({
      CWD: '/workspace',
      currentGame: { engineId: 'engine-1', path: '/workspace' },
    })
    useWorkspaceStoreMock.mockReturnValue(workspaceStoreState)

    const store = useFileStore()
    await vi.waitFor(() => {
      expect(watchFsMock).toHaveBeenCalledTimes(1)
    })

    // initialize 内部已加载 game/，需要把它从 items 里移除以模拟"未加载"
    const caches = captureFileStoreCaches()
    try {
      const pathToId = caches.pathToId
      const items = caches.items
      const gameId = pathToId?.get(AbsPath.from('/workspace/game'))
      if (gameId) {
        items?.delete(gameId)
        pathToId?.delete(AbsPath.from('/workspace/game'))
      }

      await expect(
        store.refreshTemplateOverlay(AbsPath.from('/workspace'), { nextTemplatePath: AbsPath.from('/templates/new') }),
      ).resolves.toBeUndefined()
    } finally {
      caches.restore()
    }
  })
})
