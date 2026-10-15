import '~/__tests__/setup'

import { LRUCache } from 'lru-cache'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { AbsPath } from '~/domain/path'
import { mime } from '~/plugins/mime'
import { registerPendingFileWrite, rollbackPendingFileWrite } from '~/services/file-write-echo-registry'
import {
  clearPendingPathOperations,
  registerPathOperation,
  updatePathOperationChannel,
} from '~/services/path-operation-registry'
import { useFileStore } from '~/stores/file'
import { AppError } from '~/types/errors'

import type { VfsDirEntry } from '~/types/project-config'
import type { handleError } from '~/utils/error-handler'

const {
  clearDirectoryItemsCacheMock,
  fileSystemEventsEmitMock,
  handleErrorMock,
  invalidateDirectoryItemsCacheMock,
  loggerErrorMock,
  loggerWarnMock,
  readFileMock,
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
  handleErrorMock: vi.fn<typeof handleError>(),
  invalidateDirectoryItemsCacheMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  loggerWarnMock: vi.fn(),
  readFileMock: vi.fn(),
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
  invalidateDirectoryItemsCache: invalidateDirectoryItemsCacheMock,
  clearDirectoryItemsCache: clearDirectoryItemsCacheMock,
}))

vi.mock('~/utils/error-handler', () => ({
  handleError: handleErrorMock,
}))

vi.mock('~/services/game-manager', () => ({
  gameManager: {
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

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, reject, resolve }
}

/** 让所有已排队的微任务与定时器回调跑完，用于断言"迟到的异步结果不会落地" */
async function flushPendingTasks(): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, 0)
  })
}

function createVfsEntry(name: string, isDir: boolean, metadata: Partial<VfsDirEntry> = {}): VfsDirEntry {
  return {
    name,
    isDir,
    source: 'upper',
    ...metadata,
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

describe('useFileStore', () => {
  beforeEach(() => {
    pendingWrites = []
    clearPendingPathOperations()
    statMock.mockReset()
    watchFsMock.mockReset()
    invalidateDirectoryItemsCacheMock.mockReset()
    clearDirectoryItemsCacheMock.mockReset()
    handleErrorMock.mockReset()
    loggerErrorMock.mockReset()
    loggerWarnMock.mockReset()
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
      CWD: '/workspace',
      currentGame: { path: '/workspace' },
    })
    useWorkspaceStoreMock.mockReturnValue(workspaceStoreState)
    resolvePreviewSiteMock.mockResolvedValue({
      projectPath: '/workspace',
      enginePath: '/engines/webgal',
      templatePath: undefined,
    })
    vfsListDirMock.mockResolvedValue([])
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
    clearPendingPathOperations()
    vi.clearAllTimers()
    vi.useRealTimers()
  })

  it('getFolderContents 会把逻辑路径交给 vfs.listDir 并复用加载结果', async () => {
    vfsListDirMock.mockImplementation(async ({ relPath }) => {
      if (relPath === 'game') {
        return [createVfsEntry('scene', true)]
      }
      return [createVfsEntry('start.txt', false)]
    })

    const store = useFileStore()
    await vi.waitFor(() => {
      expect(watchFsMock).toHaveBeenCalledTimes(1)
    })

    const firstRead = await store.getFolderContents(AbsPath.from('/workspace/game/scene'))
    const secondRead = await store.getFolderContents(AbsPath.from('/workspace/game/scene'))

    expect(vfsListDirMock).toHaveBeenNthCalledWith(1, {
      projectPath: '/workspace',
      enginePath: '/engines/webgal',
      templatePath: undefined,
      relPath: 'game',
    })
    expect(vfsListDirMock).toHaveBeenNthCalledWith(2, {
      projectPath: '/workspace',
      enginePath: '/engines/webgal',
      templatePath: undefined,
      relPath: 'game/scene',
    })
    expect(vfsListDirMock).toHaveBeenCalledTimes(2)
    expect(firstRead.map(item => item.path)).toEqual(['/workspace/game/scene/start.txt'])
    expect(secondRead.map(item => item.path)).toEqual(['/workspace/game/scene/start.txt'])
  })

  it('initialize 后 create/remove 事件会同步到目录内容与事件总线', async () => {
    vfsListDirMock.mockImplementation(async ({ relPath }) => (
      relPath === 'game' ? [createVfsEntry('scene', true)] : []
    ))
    statMock.mockImplementation(async (path: string) => createStatResult(String(path), false))

    const store = useFileStore()
    await vi.waitFor(() => {
      expect(watchFsMock).toHaveBeenCalledTimes(1)
    })
    await watchHandler?.({
      type: { create: {} },
      paths: ['/workspace/game/new.txt'],
    })

    const afterCreate = await store.getFolderContents(AbsPath.from('/workspace/game'))
    expect(afterCreate.map(item => item.path)).toEqual([
      '/workspace/game/scene',
      '/workspace/game/new.txt',
    ])
    expect(emittedEvents).toContainEqual(expect.objectContaining({
      type: 'file:created',
      path: '/workspace/game/new.txt',
    }))

    await watchHandler?.({
      type: { remove: {} },
      paths: ['/workspace/game/new.txt'],
    })

    const afterRemove = await store.getFolderContents(AbsPath.from('/workspace/game'))
    expect(afterRemove.map(item => item.path)).toEqual(['/workspace/game/scene'])
    expect(emittedEvents).toContainEqual(expect.objectContaining({
      type: 'file:removed',
      path: '/workspace/game/new.txt',
    }))
  })

  it('rename 事件会更新现有节点的路径与名称', async () => {
    vfsListDirMock.mockImplementation(async ({ relPath }) => (
      relPath === 'game' ? [createVfsEntry('old.txt', false)] : []
    ))
    statMock.mockImplementation(async (path: string) => createStatResult(String(path), false))

    const store = useFileStore()
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
    statMock.mockImplementation(async (path: string) => {
      if (path === '/workspace/game/unloaded.txt') {
        return createStatResult(path, false)
      }
      return createStatResult(path, true)
    })

    useFileStore()
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

  it('路径操作回声命中 pending 时会吞掉 modify 广播并只做缓存对账', async () => {
    vfsListDirMock.mockImplementation(async ({ relPath }) => (
      relPath === 'game' ? [createVfsEntry('pending.txt', false)] : []
    ))

    const pendingId = registerPathOperation({
      sourcePath: AbsPath.from('/workspace/game/pending.txt'),
      targetPath: AbsPath.from('/workspace/game/pending-renamed.txt'),
    })
    updatePathOperationChannel(pendingId, {
      echoMode: 'watcher',
      expectedEchoes: 1,
    })

    const store = useFileStore()
    await vi.waitFor(() => {
      expect(watchFsMock).toHaveBeenCalledTimes(1)
    })

    await store.getFolderContents(AbsPath.from('/workspace/game'))
    emittedEvents.length = 0
    await watchHandler?.({
      type: { modify: { kind: 'data' } },
      paths: ['/workspace/game/pending-renamed.txt'],
    })

    expect(emittedEvents).not.toContainEqual(expect.objectContaining({
      type: 'file:modified',
      path: '/workspace/game/pending-renamed.txt',
    }))
    expect(emittedEvents).not.toContainEqual(expect.objectContaining({
      type: 'directory:modified',
      path: '/workspace/game/pending-renamed.txt',
    }))
  })

  it('命中自写入回响且磁盘字节一致时不会广播 file:modified', async () => {
    vfsListDirMock.mockImplementation(async ({ relPath }) => (
      relPath === 'game' ? [createVfsEntry('echo-loaded.txt', false)] : []
    ))
    statMock.mockImplementation(async (path: string) => createStatResult(String(path), false))

    const expectedBytes = new Uint8Array([104, 101, 108, 108, 111])
    readFileMock.mockResolvedValue(expectedBytes)

    pendingWrites.push(registerPendingFileWrite(AbsPath.from('/workspace/game/echo-loaded.txt'), expectedBytes))

    const store = useFileStore()
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
    const expectedBytes = new Uint8Array([111, 107])
    readFileMock.mockResolvedValue(expectedBytes)

    pendingWrites.push(registerPendingFileWrite(AbsPath.from('/workspace/game/echo-unloaded.txt'), expectedBytes))

    useFileStore()
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
    vfsListDirMock.mockImplementation(async ({ relPath }) => (
      relPath === 'game' ? [createVfsEntry('echo-mismatch.txt', false)] : []
    ))
    statMock.mockImplementation(async (path: string) => createStatResult(String(path), false))

    readFileMock.mockResolvedValue(new Uint8Array([98, 121, 101]))

    pendingWrites.push(registerPendingFileWrite(AbsPath.from('/workspace/game/echo-mismatch.txt'), new Uint8Array([104, 101, 108, 108, 111])))

    const store = useFileStore()
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
    vfsListDirMock.mockImplementation(async ({ relPath }) => (
      relPath === 'game' ? [createVfsEntry('echo-partial.txt', false)] : []
    ))
    statMock.mockImplementation(async (path: string) => createStatResult(String(path), false))

    const expectedBytes = new Uint8Array([104, 101, 108, 108, 111])
    readFileMock
      .mockResolvedValueOnce(new Uint8Array([104, 101]))
      .mockResolvedValueOnce(expectedBytes)
      .mockResolvedValue(expectedBytes)

    pendingWrites.push(registerPendingFileWrite(AbsPath.from('/workspace/game/echo-partial.txt'), expectedBytes))

    const store = useFileStore()
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
    useFileStore()
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
    statMock.mockImplementation(async (path: string) => {
      if (path === '/workspace/game/renamed.txt') {
        return createStatResult(path, false)
      }
      return createStatResult(path, true)
    })

    useFileStore()
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

  it('命中 system-refactor 的 file:written 时会刷新元信息与父目录缓存并跳过外部修改分支', async () => {
    vfsListDirMock.mockImplementation(async ({ relPath }) => {
      if (relPath === 'game') {
        return [createVfsEntry('scene', true)]
      }
      return [createVfsEntry('start.txt', false)]
    })
    statMock.mockImplementation(async (path: string) => createStatResult(path, false))
    readFileMock.mockResolvedValue(new Uint8Array([104, 101, 108, 108, 111]))

    pendingWrites.push(registerPendingFileWrite(AbsPath.from('/workspace/game/scene/start.txt'), new Uint8Array([104, 101, 108, 108, 111])))

    const store = useFileStore()
    await vi.waitFor(() => {
      expect(watchFsMock).toHaveBeenCalledTimes(1)
    })
    await store.getFolderContents(AbsPath.from('/workspace/game/scene'))

    emittedEvents.length = 0
    invalidateDirectoryItemsCacheMock.mockClear()
    await watchHandler?.({
      type: { modify: { kind: 'data' } },
      paths: ['/workspace/game/scene/start.txt'],
    })

    expect(statMock).toHaveBeenCalledWith('/workspace/game/scene/start.txt')
    expect(invalidateDirectoryItemsCacheMock).toHaveBeenCalledWith(
      AbsPath.from('/workspace/game/scene'),
      { includeChildren: false },
    )
    expect(emittedEvents).toContainEqual(expect.objectContaining({
      type: 'file:written',
      path: '/workspace/game/scene/start.txt',
      source: 'system-refactor',
    }))
    expect(emittedEvents).not.toContainEqual(expect.objectContaining({
      type: 'file:modified',
      path: '/workspace/game/scene/start.txt',
    }))
  })

  it('收到已存在条目的 create 事件时不会重复追加同一子项', async () => {
    vfsListDirMock.mockImplementation(async ({ relPath }) => (
      relPath === 'game' ? [createVfsEntry('scene.txt', false)] : []
    ))
    statMock.mockImplementation(async (path: string) => createStatResult(String(path), false))

    const store = useFileStore()
    await vi.waitFor(() => {
      expect(watchFsMock).toHaveBeenCalledTimes(1)
    })

    const before = await store.getFolderContents(AbsPath.from('/workspace/game'))
    expect(before.map(item => item.path)).toEqual(['/workspace/game/scene.txt'])

    await watchHandler?.({
      type: { create: {} },
      paths: ['/workspace/game/scene.txt'],
    })

    const after = await store.getFolderContents(AbsPath.from('/workspace/game'))
    expect(after.map(item => item.path)).toEqual(['/workspace/game/scene.txt'])
  })

  it('目录列举会保留条目的来源与大小时间属性', async () => {
    vfsListDirMock.mockImplementation(async ({ relPath }) => (
      relPath === 'game'
        ? [createVfsEntry('scene.txt', false, {
            createdAt: 1700_0000_0000,
            modifiedAt: 1700_0001_0000,
            size: 2048,
          })]
        : []
    ))

    const store = useFileStore()
    await vi.waitFor(() => {
      expect(watchFsMock).toHaveBeenCalledTimes(1)
    })

    const [item] = await store.getFolderContents(AbsPath.from('/workspace/game'))
    expect(item).toEqual(expect.objectContaining({
      createdAt: 1700_0000_0000,
      modifiedAt: 1700_0001_0000,
      size: 2048,
      source: 'upper',
    }))
    expect(vfsListDirMock).toHaveBeenCalledWith({
      projectPath: '/workspace',
      enginePath: '/engines/webgal',
      templatePath: undefined,
      relPath: 'game',
    })
  })

  it('applyPathMutation 会立即更新目录视图路径', async () => {
    vfsListDirMock.mockImplementation(async ({ relPath }) => (
      relPath === 'game' ? [createVfsEntry('original.txt', false)] : []
    ))
    statMock.mockImplementation(async (path: string) => createStatResult(path, false))

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

    await store.applyPathMutation(
      AbsPath.from('/workspace/game/original.txt'),
      AbsPath.from('/workspace/game/renamed.png'),
    )

    const after = await store.getFolderContents(AbsPath.from('/workspace/game'))
    expect(after).toEqual([
      expect.objectContaining({
        name: 'renamed.png',
        path: '/workspace/game/renamed.png',
        mimeType: mime.getType('/workspace/game/renamed.png') ?? '',
      }),
    ])
    expect(vfsRenamePathMock).not.toHaveBeenCalled()
  })

  it('applyPathMutation 会立即把条目迁移到目标目录', async () => {
    vfsListDirMock.mockImplementation(async ({ relPath }) => {
      if (relPath === 'game') {
        return [createVfsEntry('original.txt', false), createVfsEntry('folder', true)]
      }
      return []
    })
    statMock.mockImplementation(async (path: string) => createStatResult(path, false))

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

    await store.getFolderContents(AbsPath.from('/workspace/game/folder'))
    await store.applyPathMutation(
      AbsPath.from('/workspace/game/original.txt'),
      AbsPath.from('/workspace/game/folder/original.txt'),
    )

    const after = await store.getFolderContents(AbsPath.from('/workspace/game/folder'))
    expect(after).toEqual([
      expect.objectContaining({
        path: '/workspace/game/folder/original.txt',
      }),
    ])
    expect(store.getItemByPath(AbsPath.from('/workspace/game/original.txt'))).toBeUndefined()
    expect(vfsMovePathMock).not.toHaveBeenCalled()
  })

  it('pathToId 与 items LRU 脱同步时会自动恢复而非抛错', async () => {
    vfsListDirMock.mockImplementation(async ({ relPath }) => (
      relPath === 'game' ? [createVfsEntry('scene', true)] : []
    ))

    const caches = captureFileStoreCaches()

    try {
      const store = useFileStore()
      await vi.waitFor(() => {
        expect(watchFsMock).toHaveBeenCalledTimes(1)
      })

      const firstRead = await store.getFolderContents(AbsPath.from('/workspace/game'))
      expect(firstRead.map(item => item.path)).toEqual(['/workspace/game/scene'])
      expect(vfsListDirMock).toHaveBeenCalledTimes(1)

      const { pathToId, items } = caches
      const parentId = pathToId!.get('/workspace/game')
      expect(parentId).toBeDefined()

      items!.delete(parentId!)
      expect(pathToId!.get('/workspace/game')).toBe(parentId)
      expect(items!.has(parentId!)).toBe(false)

      const secondRead = await store.getFolderContents(AbsPath.from('/workspace/game'))
      expect(secondRead.map(item => item.path)).toEqual(['/workspace/game/scene'])
      expect(vfsListDirMock).toHaveBeenCalledTimes(2)
    } finally {
      caches.restore()
    }
  })

  it('Windows 盘符大小写不同的路径会命中同一个缓存项', async () => {
    vfsListDirMock.mockImplementation(async ({ relPath }) => (
      relPath === 'game' ? [createVfsEntry('scene.txt', false)] : []
    ))
    workspaceStoreState = reactive({
      CWD: 'c:/workspace',
      currentGame: {
        path: 'C:/workspace',
      },
    })
    useWorkspaceStoreMock.mockReturnValue(workspaceStoreState)

    const store = useFileStore()
    await vi.waitFor(() => {
      expect(watchFsMock).toHaveBeenCalledTimes(1)
    })

    const items = await store.getFolderContents(AbsPath.from('c:/workspace/game'))
    const sameItem = store.getItemByPath(AbsPath.from('c:/workspace/game/scene.txt'))

    expect(vfsListDirMock).toHaveBeenCalledTimes(1)
    expect(items).toHaveLength(1)
    expect(sameItem).toBe(items[0])
    expect(sameItem?.path).toBe('C:/workspace/game/scene.txt')
  })

  it('并发 getFolderContents 不会因加载锁缺失而返回空列表', async () => {
    let callCount = 0
    let resolveListDir: ((value: VfsDirEntry[]) => void) | undefined
    vfsListDirMock.mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        // 初始化调用，立即返回
        return Promise.resolve([createVfsEntry('scene', true)])
      }
      // 第二次调用（并发目标），延迟 resolve
      return new Promise((resolve) => {
        resolveListDir = resolve
      })
    })

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

    resolveListDir!([createVfsEntry('start.txt', false)])

    const [resultA, resultB] = await Promise.all([loadA, loadB])

    expect(resultA.map(item => item.path)).toEqual(['/workspace/game/scene/start.txt'])
    expect(resultB.map(item => item.path)).toEqual(['/workspace/game/scene/start.txt'])
    // 初始化 1 次 + scene 目录 1 次 = 2 次（加载锁保证 scene 只调用一次）
    expect(vfsListDirMock).toHaveBeenCalledTimes(2)
    expect(vfsListDirMock).toHaveBeenNthCalledWith(2, {
      projectPath: '/workspace',
      enginePath: '/engines/webgal',
      templatePath: undefined,
      relPath: 'game/scene',
    })
  })

  it('子项全部被 LRU 驱逐后 getFolderContents 会自动重新加载', async () => {
    vfsListDirMock.mockImplementation(async ({ relPath }) => (
      relPath === 'game'
        ? [createVfsEntry('file-a.txt', false), createVfsEntry('file-b.txt', false)]
        : []
    ))

    const caches = captureFileStoreCaches()

    try {
      const store = useFileStore()
      await vi.waitFor(() => {
        expect(watchFsMock).toHaveBeenCalledTimes(1)
      })

      const firstRead = await store.getFolderContents(AbsPath.from('/workspace/game'))
      expect(firstRead.map(item => item.path)).toEqual([
        '/workspace/game/file-a.txt',
        '/workspace/game/file-b.txt',
      ])
      expect(vfsListDirMock).toHaveBeenCalledTimes(1)

      const { pathToId, items } = caches
      const parentId = pathToId!.get('/workspace/game')
      const childIds = ['file-a.txt', 'file-b.txt']
        .map(name => pathToId!.get(`/workspace/game/${name}`))
      expect(childIds).toEqual([expect.any(String), expect.any(String)])

      for (const childId of childIds) {
        items!.delete(childId!)
        expect(items!.has(childId!)).toBe(false)
      }
      expect(items!.has(parentId!)).toBe(true)

      const secondRead = await store.getFolderContents(AbsPath.from('/workspace/game'))
      expect(secondRead.map(item => item.path)).toEqual([
        '/workspace/game/file-a.txt',
        '/workspace/game/file-b.txt',
      ])
      expect(vfsListDirMock).toHaveBeenCalledTimes(2)
    } finally {
      caches.restore()
    }
  })

  it('部分子项被 LRU 驱逐后 getFolderContents 也会自动重新加载', async () => {
    vfsListDirMock.mockImplementation(async ({ relPath }) => (
      relPath === 'game'
        ? [createVfsEntry('file-a.txt', false), createVfsEntry('file-b.txt', false)]
        : []
    ))

    const caches = captureFileStoreCaches()

    try {
      const store = useFileStore()
      await vi.waitFor(() => {
        expect(watchFsMock).toHaveBeenCalledTimes(1)
      })

      const firstRead = await store.getFolderContents(AbsPath.from('/workspace/game'))
      expect(firstRead).toHaveLength(2)
      expect(vfsListDirMock).toHaveBeenCalledTimes(1)

      const { pathToId, items } = caches
      const evictedId = pathToId!.get('/workspace/game/file-a.txt')
      expect(evictedId).toBeDefined()
      items!.delete(evictedId!)

      const secondRead = await store.getFolderContents(AbsPath.from('/workspace/game'))
      expect(secondRead.map(item => item.path)).toEqual([
        '/workspace/game/file-a.txt',
        '/workspace/game/file-b.txt',
      ])
      expect(vfsListDirMock).toHaveBeenCalledTimes(2)
    } finally {
      caches.restore()
    }
  })

  it('文件视图命令会携带 templatePath，删除会透传删除方式并返回 void', async () => {
    resolvePreviewSiteMock.mockResolvedValue({
      projectPath: '/workspace',
      enginePath: '/engines/webgal',
      templatePath: '/templates/current',
    })
    vfsDeletePathMock.mockResolvedValue(undefined)
    vfsEnsureWritableMock.mockResolvedValue('/workspace/game/original.txt')
    vfsResolvePathMock.mockResolvedValue('/templates/current/game/original.txt')
    vfsListDirMock.mockImplementation(async ({ relPath }) => (
      relPath === 'game' ? [createVfsEntry('original.txt', false)] : []
    ))

    const store = useFileStore()
    await vi.waitFor(() => {
      expect(watchFsMock).toHaveBeenCalledTimes(1)
    })

    await expect(store.ensureWritable(AbsPath.from('/workspace/game/original.txt')))
      .resolves.toBe('/workspace/game/original.txt')
    await expect(store.resolveFilePath(AbsPath.from('/workspace/game/original.txt')))
      .resolves.toBe('/templates/current/game/original.txt')
    await expect(store.deleteEntry(AbsPath.from('/workspace/game/original.txt'), false))
      .resolves.toBeUndefined()
    await expect(store.deleteEntry(AbsPath.from('/workspace/game/original.txt'), true))
      .resolves.toBeUndefined()

    expect(vfsEnsureWritableMock).toHaveBeenCalledWith({
      projectPath: '/workspace',
      enginePath: '/engines/webgal',
      templatePath: '/templates/current',
      relPath: 'game/original.txt',
    })
    expect(vfsResolvePathMock).toHaveBeenCalledWith({
      projectPath: '/workspace',
      enginePath: '/engines/webgal',
      templatePath: '/templates/current',
      relPath: 'game/original.txt',
    })
    expect(vfsDeletePathMock).toHaveBeenCalledTimes(2)
    expect(vfsDeletePathMock).toHaveBeenCalledWith({
      projectPath: '/workspace',
      enginePath: '/engines/webgal',
      templatePath: '/templates/current',
      relPath: 'game/original.txt',
      permanent: false,
    })
    expect(vfsDeletePathMock).toHaveBeenCalledWith({
      projectPath: '/workspace',
      enginePath: '/engines/webgal',
      templatePath: '/templates/current',
      relPath: 'game/original.txt',
      permanent: true,
    })
  })

  it('copyEntry 会在 resolvePath 与复制命令中携带 templatePath 并返回新路径', async () => {
    resolvePreviewSiteMock.mockResolvedValue({
      projectPath: '/workspace',
      enginePath: '/engines/webgal',
      templatePath: '/templates/current',
    })
    statMock.mockImplementation(async (path: string) => createStatResult(path, false))
    vfsResolvePathMock.mockResolvedValue('/templates/current/game/original.txt')
    vfsCopyPathMock.mockResolvedValue('game/folder-copy/original.txt')
    vfsListDirMock.mockImplementation(async ({ relPath }) => (
      relPath === 'game'
        ? [createVfsEntry('original.txt', false), createVfsEntry('folder-copy', true)]
        : []
    ))

    const store = useFileStore()
    await vi.waitFor(() => {
      expect(watchFsMock).toHaveBeenCalledTimes(1)
    })

    const copiedPath = await store.copyEntry(
      AbsPath.from('/workspace/game/original.txt'),
      AbsPath.from('/workspace/game/folder-copy'),
    )

    expect(copiedPath).toBe('/workspace/game/folder-copy/original.txt')
    expect(vfsResolvePathMock).toHaveBeenNthCalledWith(1, {
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
    expect(vfsMovePathMock).not.toHaveBeenCalled()
  })

  it('refreshTemplateOverlay 后会丢弃旧 overlay 的目录结果并重新加载', async () => {
    let resolveOldTemplateList: ((value: VfsDirEntry[]) => void) | undefined

    resolvePreviewSiteMock.mockResolvedValue({
      projectPath: '/workspace',
      enginePath: '/engines/webgal',
      templatePath: '/templates/old',
    })
    vfsListDirMock.mockImplementation(async ({ relPath, templatePath }) => {
      if (relPath === 'game/template' && templatePath === '/templates/old') {
        return await new Promise<VfsDirEntry[]>((resolve) => {
          resolveOldTemplateList = resolve
        })
      }

      if (relPath === 'game/template' && templatePath === '/templates/new') {
        return [createVfsEntry('new.txt', false, { source: 'templateLower' })]
      }

      return []
    })

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
      // 初始化 1 次 + 旧 overlay 1 次 + 新 overlay 1 次
      expect(vfsListDirMock).toHaveBeenCalledTimes(3)
    })

    resolveOldTemplateList!([createVfsEntry('old.txt', false, { source: 'templateLower' })])

    const refreshedItems = await refreshedLoad
    await staleLoad

    expect(refreshedItems.map(item => item.path)).toEqual(['/workspace/game/template/new.txt'])

    const finalItems = await store.getFolderContents(AbsPath.from('/workspace/game/template'))
    expect(finalItems.map(item => item.path)).toEqual(['/workspace/game/template/new.txt'])
    // 显式传入两层路径时不再回查当前游戏快照
    expect(resolvePreviewSiteMock).toHaveBeenCalledTimes(1)
    expect(emittedEvents).toContainEqual({
      type: 'directory:modified',
      path: '/workspace/game/template',
    })
  })

  it('applyPathMutation 会递归迁移已加载目录子树', async () => {
    vfsListDirMock.mockImplementation(async ({ relPath }) => {
      if (relPath === 'game') {
        return [createVfsEntry('foo', true), createVfsEntry('dest', true)]
      }
      if (relPath === 'game/foo') {
        return [createVfsEntry('bar', true)]
      }
      if (relPath === 'game/foo/bar') {
        return [createVfsEntry('baz.txt', false)]
      }
      return []
    })
    statMock.mockImplementation(async (path: string) => createStatResult(path, false))

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
    await store.applyPathMutation(
      AbsPath.from('/workspace/game/foo'),
      AbsPath.from('/workspace/game/dest/foo'),
    )

    expect(store.getItemByPath(AbsPath.from('/workspace/game/foo'))).toBeUndefined()
    expect(store.getItemByPath(AbsPath.from('/workspace/game/foo/bar'))).toBeUndefined()
    expect(store.getItemByPath(AbsPath.from('/workspace/game/foo/bar/baz.txt'))).toBeUndefined()
    expect(store.getItemByPath(AbsPath.from('/workspace/game/dest/foo'))).toBeDefined()
    expect(store.getItemByPath(AbsPath.from('/workspace/game/dest/foo/bar'))).toBeDefined()
    expect(store.getItemByPath(AbsPath.from('/workspace/game/dest/foo/bar/baz.txt'))).toBeDefined()
    expect(emittedEvents).toEqual([])
    expect(vfsMovePathMock).not.toHaveBeenCalled()
  })

  it('refreshTemplateOverlay 会同步失效父 game 目录', async () => {
    resolvePreviewSiteMock.mockResolvedValue({
      projectPath: '/workspace',
      enginePath: '/engines/webgal',
      templatePath: '/templates/old',
    })
    vfsListDirMock.mockImplementation(async ({ relPath }) => (
      relPath === 'game' ? [createVfsEntry('template', true)] : []
    ))

    const store = useFileStore()
    await vi.waitFor(() => {
      expect(watchFsMock).toHaveBeenCalledTimes(1)
    })

    await store.getFolderContents(AbsPath.from('/workspace/game'))
    const gameItem = store.getItemByPath(AbsPath.from('/workspace/game'))
    expect(gameItem?.isDir).toBe(true)
    expect((gameItem as { isLoaded: boolean }).isLoaded).toBe(true)

    emittedEvents.length = 0
    await store.refreshTemplateOverlay(AbsPath.from('/workspace'), { nextTemplatePath: AbsPath.from('/templates/new') })

    const refreshedGameItem = store.getItemByPath(AbsPath.from('/workspace/game'))
    expect((refreshedGameItem as { isLoaded: boolean }).isLoaded).toBe(false)
    expect(emittedEvents).toContainEqual({
      type: 'directory:modified',
      path: '/workspace/game/template',
    })
  })

  it('refreshTemplateOverlay 在父 game 目录尚未加载时不会抛错', async () => {
    resolvePreviewSiteMock.mockResolvedValue({
      projectPath: '/workspace',
      enginePath: '/engines/webgal',
      templatePath: '/templates/old',
    })

    const caches = captureFileStoreCaches()

    try {
      const store = useFileStore()
      await vi.waitFor(() => {
        expect(watchFsMock).toHaveBeenCalledTimes(1)
      })

      // initialize 内部已加载 game/，需要把它从 items 里移除以模拟"未加载"
      const { pathToId, items } = caches
      const gameId = pathToId!.get('/workspace/game')
      expect(gameId).toBeDefined()
      items!.delete(gameId!)
      expect(items!.has(gameId!)).toBe(false)

      await expect(
        store.refreshTemplateOverlay(AbsPath.from('/workspace'), { nextTemplatePath: AbsPath.from('/templates/new') }),
      ).resolves.toBeUndefined()
      expect(store.getItemByPath(AbsPath.from('/workspace/game'))).toBeUndefined()
    } finally {
      caches.restore()
    }
  })

  it('引擎不可用时文件视图操作会被拒绝', async () => {
    resolvePreviewSiteMock.mockRejectedValue(new AppError('CONFIG_ERROR', '游戏未绑定可用引擎'))

    const store = useFileStore()

    await expect(store.getFolderContents(AbsPath.from('/workspace/game'))).rejects.toMatchObject({
      code: 'FS_ERROR',
      message: '加载目录失败: 当前项目没有可用的引擎，无法解析文件视图',
    })
    await expect(store.ensureWritable(AbsPath.from('/workspace/game/a.txt'))).rejects.toMatchObject({
      code: 'FS_ERROR',
      message: '当前项目没有可用的引擎，无法解析文件视图',
    })
    await expect(store.resolveFilePath(AbsPath.from('/workspace/game/a.txt'))).rejects.toMatchObject({
      code: 'FS_ERROR',
      message: '当前项目没有可用的引擎，无法解析文件视图',
    })
    await expect(store.deleteEntry(AbsPath.from('/workspace/game/a.txt'), false)).rejects.toMatchObject({
      code: 'FS_ERROR',
      message: '当前项目没有可用的引擎，无法解析文件视图',
    })
    await expect(store.copyEntry(AbsPath.from('/workspace/game/a.txt'), AbsPath.from('/workspace/game'))).rejects.toMatchObject({
      code: 'FS_ERROR',
      message: '当前项目没有可用的引擎，无法解析文件视图',
    })

    expect(resolvePreviewSiteMock).toHaveBeenCalledWith({ path: '/workspace' })
    expect(vfsListDirMock).not.toHaveBeenCalled()
    expect(vfsDeletePathMock).not.toHaveBeenCalled()
    expect(watchFsMock).not.toHaveBeenCalled()
  })

  it('deleteEntry 拒绝删除项目根目录', async () => {
    const store = useFileStore()
    await vi.waitFor(() => {
      expect(watchFsMock).toHaveBeenCalledTimes(1)
    })

    await expect(store.deleteEntry(AbsPath.from('/workspace'), false)).rejects.toMatchObject({
      code: 'FS_ERROR',
      message: '不能通过资源视图删除项目根目录',
    })
    expect(vfsDeletePathMock).not.toHaveBeenCalled()
  })

  it('copyEntry 拒绝项目根与项目外的路径', async () => {
    const store = useFileStore()
    await vi.waitFor(() => {
      expect(watchFsMock).toHaveBeenCalledTimes(1)
    })

    await expect(
      store.copyEntry(AbsPath.from('/workspace'), AbsPath.from('/workspace/game')),
    ).rejects.toMatchObject({
      code: 'PATH_DENIED',
      message: '不能复制或移动项目根目录',
    })
    await expect(
      store.copyEntry(AbsPath.from('/outside/a.txt'), AbsPath.from('/workspace/game')),
    ).rejects.toMatchObject({
      code: 'PATH_DENIED',
      message: '路径不在当前项目内',
    })
    await expect(
      store.copyEntry(AbsPath.from('/workspace/game/a.txt'), AbsPath.from('/outside')),
    ).rejects.toMatchObject({
      code: 'PATH_DENIED',
      message: '路径不在当前项目内',
    })
    expect(vfsCopyPathMock).not.toHaveBeenCalled()
  })

  it('refreshTemplateOverlay 在文件树尚未建立时会补建文件树并通知目录变更', async () => {
    resolvePreviewSiteMock.mockRejectedValueOnce(new AppError('CONFIG_ERROR', '游戏未绑定可用引擎'))

    const store = useFileStore()
    await store.initialized

    expect(watchFsMock).not.toHaveBeenCalled()

    await store.refreshTemplateOverlay(AbsPath.from('/workspace'), {
      nextEnginePath: AbsPath.from('/engines/webgal'),
    })

    // 引擎路径已显式给出，不再回查当前（落后的）游戏快照
    expect(resolvePreviewSiteMock).toHaveBeenCalledTimes(1)
    expect(vfsListDirMock).toHaveBeenCalledWith({
      projectPath: '/workspace',
      enginePath: '/engines/webgal',
      templatePath: undefined,
      relPath: 'game',
    })
    expect(watchFsMock).toHaveBeenCalledWith('/workspace/game', expect.any(Function), {
      recursive: true,
      delayMs: 150,
    })
    expect(emittedEvents).toContainEqual({
      type: 'directory:modified',
      path: '/workspace/game',
    })
    expect(store.getItemByPath(AbsPath.from('/workspace/game'))).toBeDefined()
  })

  it('切换工作区后 initialized 立即指向新一代，同一轮更新里的消费者不会读到上一代已兑现的状态', async () => {
    const store = useFileStore()
    await vi.waitFor(() => {
      expect(watchFsMock).toHaveBeenCalledTimes(1)
    })
    await store.initialized

    // 新工作区的站点解析挂起，模拟进入工程时引擎解析尚未完成的窗口
    const site = createDeferred<{ enginePath: string, projectPath: string }>()
    resolvePreviewSiteMock.mockImplementation(() => site.promise)

    workspaceStoreState.currentGame = { path: '/workspace-2' }
    workspaceStoreState.CWD = '/workspace-2'

    let isReady = false
    void store.initialized.then(() => {
      isReady = true
    })

    // 与工作区切换同一轮响应式更新里读取 initialized 的消费者（如编辑器标签页加载）
    // 必须等到新工作区初始化完成，而不是复用上一个工作区已兑现的 Promise
    await Promise.resolve()
    expect(isReady).toBe(false)

    site.resolve({ enginePath: '/engines/webgal', projectPath: '/workspace-2' })
    await store.initialized
    expect(isReady).toBe(true)
  })

  it('旧工作区迟到的初始化不会兑现新工作区的 initialized，也不会挂上旧工作区的监听', async () => {
    const siteA = createDeferred<{ enginePath: string, projectPath: string }>()
    const siteB = createDeferred<{ enginePath: string, projectPath: string }>()
    resolvePreviewSiteMock
      .mockReturnValueOnce(siteA.promise)
      .mockReturnValueOnce(siteB.promise)
    vfsResolvePathMock.mockImplementation(async ({ relPath }: { relPath: string }) => `/physical/${relPath}`)

    const store = useFileStore()
    await Promise.resolve()

    // 切到新工作区：它的站点解析同样挂起
    workspaceStoreState.currentGame = { path: '/workspace-b' }
    workspaceStoreState.CWD = '/workspace-b'

    let isReady = false
    void store.initialized.then(() => {
      isReady = true
    })
    await Promise.resolve()
    expect(isReady).toBe(false)

    // 旧工作区迟到完成：既不能兑现新工作区的 initialized，也不能写状态或挂监听
    siteA.resolve({ enginePath: '/engines/a', projectPath: '/workspace' })
    await flushPendingTasks()
    expect(isReady).toBe(false)
    expect(watchFsMock).not.toHaveBeenCalled()

    siteB.resolve({ enginePath: '/engines/b', projectPath: '/workspace-b' })
    await vi.waitFor(() => {
      expect(isReady).toBe(true)
    })

    expect(watchFsMock).toHaveBeenCalledTimes(1)
    expect(watchFsMock).toHaveBeenCalledWith('/workspace-b/game', expect.any(Function), { recursive: true, delayMs: 150 })
    await expect(store.resolveFilePath(AbsPath.from('/workspace-b/game/x.txt')))
      .resolves.toBe('/physical/game/x.txt')
  })

  it('切换工作区后迟到的目录列举结果会被丢弃', async () => {
    const staleList = createDeferred<VfsDirEntry[]>()
    vfsListDirMock.mockImplementationOnce(() => staleList.promise)

    const store = useFileStore()
    await vi.waitFor(() => {
      expect(vfsListDirMock).toHaveBeenCalledTimes(1)
    })

    // 切到新工作区并完成初始化
    workspaceStoreState.currentGame = { path: '/workspace-b' }
    workspaceStoreState.CWD = '/workspace-b'
    await vi.waitFor(() => {
      expect(watchFsMock).toHaveBeenCalledTimes(1)
    })
    await store.initialized

    // 旧工作区的列举迟到完成：不得写回文件树，也不得再挂旧监听
    staleList.resolve([createVfsEntry('stale.txt', false)])
    await flushPendingTasks()

    expect(store.getItemByPath(AbsPath.from('/workspace/game/stale.txt'))).toBeUndefined()
    expect(watchFsMock).toHaveBeenCalledTimes(1)
    expect(watchFsMock).toHaveBeenCalledWith('/workspace-b/game', expect.any(Function), { recursive: true, delayMs: 150 })
  })

  it('挂载监听期间切换工作区会立刻停掉旧监听，不顶掉新工作区的监听', async () => {
    const staleWatch = createDeferred<() => void>()
    const staleStop = vi.fn()
    const currentStop = vi.fn()
    watchFsMock
      .mockImplementationOnce(() => staleWatch.promise)
      .mockImplementationOnce(async (_path: string, handler: typeof watchHandler) => {
        watchHandler = handler
        return currentStop
      })

    const store = useFileStore()
    await vi.waitFor(() => {
      expect(watchFsMock).toHaveBeenCalledTimes(1)
    })

    // 旧工作区的监听还挂在半途时切到新工作区，新工作区正常完成初始化
    workspaceStoreState.currentGame = { path: '/workspace-b' }
    workspaceStoreState.CWD = '/workspace-b'
    await vi.waitFor(() => {
      expect(watchFsMock).toHaveBeenCalledTimes(2)
    })
    await store.initialized

    // 旧监听迟到返回：必须立刻停掉，且不能顶掉新工作区的监听
    staleWatch.resolve(staleStop)
    await flushPendingTasks()

    expect(staleStop).toHaveBeenCalledTimes(1)
    expect(currentStop).not.toHaveBeenCalled()

    // 离开工作区时停掉的应当是新工作区的监听
    workspaceStoreState.currentGame = undefined
    workspaceStoreState.CWD = undefined
    await flushPendingTasks()

    expect(currentStop).toHaveBeenCalledTimes(1)
    expect(staleStop).toHaveBeenCalledTimes(1)
  })
})
