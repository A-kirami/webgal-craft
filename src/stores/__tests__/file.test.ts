import '~/__tests__/setup'

import { LRUCache } from 'lru-cache'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useFileStore } from '~/stores/file'

import type { readDirectoryItemsCached } from '~/services/directory-cache'
import type { VfsDirEntry } from '~/types/project-config'
import type { handleError } from '~/utils/error-handler'

const {
  basenameMock,
  clearDirectoryItemsCacheMock,
  fileSystemEventsEmitMock,
  existsMock,
  getGameEnginePathMock,
  handleErrorMock,
  invalidateDirectoryItemsCacheMock,
  loggerErrorMock,
  loggerWarnMock,
  projectConfigPathMock,
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
  basenameMock: vi.fn(async (input: string) => input.split('/').at(-1) ?? input),
  clearDirectoryItemsCacheMock: vi.fn(),
  fileSystemEventsEmitMock: vi.fn(),
  existsMock: vi.fn(),
  getGameEnginePathMock: vi.fn<(game: { path: string, engineId?: string }) => Promise<string | undefined>>(),
  handleErrorMock: vi.fn<typeof handleError>(),
  invalidateDirectoryItemsCacheMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  loggerWarnMock: vi.fn(),
  projectConfigPathMock: vi.fn(async (gamePath: string) => `${gamePath}/project.wgcp`),
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

vi.mock('@tauri-apps/api/path', () => ({
  basename: basenameMock,
  join: async (...parts: string[]) => normalizePath(parts.join('/')),
  normalize: async (path: string) => normalizePath(path),
}))

vi.mock('@tauri-apps/plugin-fs', () => ({
  exists: existsMock,
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
  const isAbsolute = path.startsWith('/')
  const segments: string[] = []

  for (const rawSegment of path.replaceAll('\\', '/').split('/')) {
    if (!rawSegment || rawSegment === '.') {
      continue
    }
    if (rawSegment === '..') {
      segments.pop()
      continue
    }
    segments.push(rawSegment)
  }

  return `${isAbsolute ? '/' : ''}${segments.join('/')}`
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
    basenameMock.mockClear()
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

    watchFsMock.mockImplementation(async (_path: string, handler: typeof watchHandler) => {
      watchHandler = handler
      return () => undefined
    })
  })

  it('getFolderContents 会懒加载目录内容并复用缓存结果', async () => {
    existsMock.mockResolvedValue(true)
    readDirectoryItemsCachedMock.mockResolvedValue([
      createFileViewerItem('/root/scene', true),
      createFileViewerItem('/root/readme.txt', false),
    ])

    const store = useFileStore()

    const firstRead = await store.getFolderContents('/root')
    const secondRead = await store.getFolderContents('/root')

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

    const afterCreate = await store.getFolderContents('/workspace/game')
    expect(afterCreate.map(item => item.path)).toContain('/workspace/game/new.txt')
    expect(emittedEvents).toContainEqual(expect.objectContaining({
      type: 'file:created',
      path: '/workspace/game/new.txt',
    }))

    await watchHandler?.({
      type: { remove: {} },
      paths: ['/workspace/game/new.txt'],
    })

    const afterRemove = await store.getFolderContents('/workspace/game')
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

    const items = await store.getFolderContents('/workspace/game')
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

    const before = await store.getFolderContents('/workspace/game')
    expect(before).toEqual([
      expect.objectContaining({
        path: '/workspace/game/scene.txt',
      }),
    ])

    await watchHandler?.({
      type: { create: {} },
      paths: ['/workspace/game/scene.txt'],
    })

    const after = await store.getFolderContents('/workspace/game')
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

    const before = await store.getFolderContents('/workspace/game')
    expect(before).toEqual([
      expect.objectContaining({
        path: '/workspace/game/original.txt',
      }),
    ])

    await store.renameEntry('/workspace/game/original.txt', 'renamed.txt')

    const after = await store.getFolderContents('/workspace/game')
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

    const before = await store.getFolderContents('/workspace/game')
    expect(before).toEqual(expect.arrayContaining([
      expect.objectContaining({
        path: '/workspace/game/folder',
      }),
      expect.objectContaining({
        path: '/workspace/game/original.txt',
      }),
    ]))

    await store.moveEntry('/workspace/game/original.txt', '/workspace/game/folder')

    const after = await store.getFolderContents('/workspace/game/folder')
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
      const firstRead = await store.getFolderContents('/root')
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

      const secondRead = await store.getFolderContents('/root')
      expect(secondRead.map(item => item.path)).toEqual(['/root/scene'])
      expect(readDirectoryItemsCachedMock).toHaveBeenCalledTimes(2)
    } finally {
      caches.restore()
    }
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
    const loadA = store.getFolderContents('/workspace/game/scene')
    const loadB = store.getFolderContents('/workspace/game/scene')

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

      const firstRead = await store.getFolderContents('/root')
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

      const secondRead = await store.getFolderContents('/root')
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

    await store.renameEntry('/workspace/game/original.txt', 'renamed.txt')
    await store.ensureWritable('/workspace/game/renamed.txt')
    await store.resolveFilePath('/workspace/game/renamed.txt')
    await store.deleteEntry('/workspace/game/renamed.txt')

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

    await store.copyEntry('/workspace/game/original.txt', '/workspace/game/folder-copy')
    await store.moveEntry('/workspace/game/original.txt', '/workspace/game/folder-move')

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

    const staleLoad = store.getFolderContents('/workspace/game/template')
    await vi.waitFor(() => {
      expect(resolveOldTemplateList).toBeDefined()
    })

    await store.refreshTemplateOverlay('/workspace', {
      nextEnginePath: '/engines/webgal',
      nextTemplatePath: '/templates/new',
    })

    const refreshedLoad = store.getFolderContents('/workspace/game/template')
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

    const finalItems = await store.getFolderContents('/workspace/game/template')
    expect(finalItems.map(item => item.path)).toEqual(['/workspace/game/template/new.txt'])
  })
})
