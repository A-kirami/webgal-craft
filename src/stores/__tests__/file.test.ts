import '~/__tests__/setup'

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { reactive } from 'vue'

import { useFileStore } from '~/stores/file'

import type { readDirectoryItemsCached } from '~/services/directory-cache'
import type { handleError } from '~/utils/error-handler'

const {
  basenameMock,
  clearDirectoryItemsCacheMock,
  fileSystemEventsEmitMock,
  existsMock,
  handleErrorMock,
  invalidateDirectoryItemsCacheMock,
  loggerErrorMock,
  loggerWarnMock,
  readDirectoryItemsCachedMock,
  statMock,
  useWorkspaceStoreMock,
  watchFsMock,
} = vi.hoisted(() => ({
  basenameMock: vi.fn(async (input: string) => input.split('/').at(-1) ?? input),
  clearDirectoryItemsCacheMock: vi.fn(),
  fileSystemEventsEmitMock: vi.fn(),
  existsMock: vi.fn(),
  handleErrorMock: vi.fn<typeof handleError>(),
  invalidateDirectoryItemsCacheMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  loggerWarnMock: vi.fn(),
  readDirectoryItemsCachedMock: vi.fn<typeof readDirectoryItemsCached>(),
  statMock: vi.fn(),
  useWorkspaceStoreMock: vi.fn(),
  watchFsMock: vi.fn(),
}))

const emittedEvents: Record<string, unknown>[] = []
const workspaceStoreState = reactive<{ CWD?: string }>({
  CWD: '/workspace',
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
}))

vi.mock('~/utils/error-handler', () => ({
  handleError: handleErrorMock,
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

describe('文件状态仓库', () => {
  beforeEach(() => {
    basenameMock.mockClear()
    existsMock.mockReset()
    statMock.mockReset()
    watchFsMock.mockReset()
    readDirectoryItemsCachedMock.mockReset()
    invalidateDirectoryItemsCacheMock.mockReset()
    clearDirectoryItemsCacheMock.mockReset()
    handleErrorMock.mockReset()
    loggerErrorMock.mockReset()
    loggerWarnMock.mockReset()
    fileSystemEventsEmitMock.mockReset()
    fileSystemEventsEmitMock.mockImplementation((event: Record<string, unknown>) => {
      emittedEvents.push(event)
    })
    emittedEvents.length = 0
    watchHandler = undefined
    workspaceStoreState.CWD = '/workspace'
    useWorkspaceStoreMock.mockReturnValue(workspaceStoreState)

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

    await store.initialize()
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

    await store.initialize()
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

    const store = useFileStore()

    await store.initialize()
    await watchHandler?.({
      type: { modify: { kind: 'data' } },
      paths: ['/workspace/game/unloaded.txt'],
    })

    expect(emittedEvents).toContainEqual(expect.objectContaining({
      type: 'file:modified',
      path: '/workspace/game/unloaded.txt',
    }))
  })
})
