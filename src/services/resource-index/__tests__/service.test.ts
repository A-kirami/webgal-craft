import '~/__tests__/mocks/tauri-fs'

import { readDir } from '@tauri-apps/plugin-fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, reactive } from 'vue'

import { createTauriPathModuleMock } from '~/__tests__/mocks/tauri-path'

const {
  onMock,
  useWorkspaceStoreMock,
} = vi.hoisted(() => ({
  onMock: vi.fn(),
  useWorkspaceStoreMock: vi.fn(),
}))

vi.mock('@tauri-apps/api/path', () => createTauriPathModuleMock())

vi.mock('~/stores/workspace', () => ({
  useWorkspaceStore: useWorkspaceStoreMock,
}))

vi.mock('~/composables/useFileSystemEvents', () => ({
  useFileSystemEvents: () => ({
    on: onMock,
  }),
}))

const readDirMock = vi.mocked(readDir)

function createDirEntry(name: string, isDirectory: boolean) {
  return {
    name,
    isDirectory,
    isFile: !isDirectory,
    isSymlink: false,
  }
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

async function flushMicrotasks(times = 6): Promise<void> {
  if (times <= 0) {
    return
  }
  await Promise.resolve()
  await flushMicrotasks(times - 1)
}

async function waitFor(predicate: () => boolean, maxTries = 20): Promise<void> {
  if (predicate()) {
    return
  }
  if (maxTries <= 0) {
    throw new Error('waitFor timeout')
  }
  await flushMicrotasks()
  await waitFor(predicate, maxTries - 1)
}

describe('ResourceIndexService', () => {
  let workspaceStoreState = reactive<{ CWD?: string }>({
    CWD: '/project',
  })

  const eventHandlers = new Map<string, ((event: Record<string, unknown>) => void)[]>()

  function emitFileSystemEvent(type: string, event: Record<string, unknown>) {
    for (const handler of eventHandlers.get(type) ?? []) {
      handler(event)
    }
  }

  beforeEach(() => {
    vi.resetModules()

    workspaceStoreState = reactive({
      CWD: '/project',
    })

    useWorkspaceStoreMock.mockReset()
    useWorkspaceStoreMock.mockReturnValue(workspaceStoreState)

    eventHandlers.clear()
    onMock.mockReset()
    onMock.mockImplementation((eventType: string, handler: (event: Record<string, unknown>) => void) => {
      const handlers = eventHandlers.get(eventType) ?? []
      handlers.push(handler)
      eventHandlers.set(eventType, handlers)
      return vi.fn(() => {
        const nextHandlers = (eventHandlers.get(eventType) ?? []).filter(item => item !== handler)
        eventHandlers.set(eventType, nextHandlers)
      })
    })

    readDirMock.mockReset()
  })

  it('启动后会建立资源清单，并支持按 assetType 和相对路径查询', async () => {
    readDirMock.mockImplementation(async (path: string | URL) => {
      switch (String(path)) {
        case '/project/game': {
          return [
            createDirEntry('background', true),
            createDirEntry('figure', true),
            createDirEntry('scene', true),
          ]
        }
        case '/project/game/background': {
          return [
            createDirEntry('bg.jpg', false),
            createDirEntry('chapter1', true),
          ]
        }
        case '/project/game/background/chapter1': {
          return [
            createDirEntry('night.png', false),
          ]
        }
        case '/project/game/figure': {
          return [
            createDirEntry('hero.png', false),
          ]
        }
        case '/project/game/scene': {
          return [
            createDirEntry('intro.txt', false),
          ]
        }
        default: {
          throw new TypeError(`unexpected readDir path: ${String(path)}`)
        }
      }
    })

    const { useResourceCatalog, useResourceCatalogBootstrap } = await import('../service')

    const scope = effectScope()
    let catalog!: ReturnType<typeof useResourceCatalog>
    scope.run(() => {
      useResourceCatalogBootstrap()
      catalog = useResourceCatalog()
    })

    try {
      await waitFor(() => catalog.status.value === 'ready')

      expect(catalog.status.value).toBe('ready')
      expect(catalog.hasAsset('background', 'bg.jpg')).toBe(true)
      expect(catalog.hasAsset('background', 'chapter1/night.png')).toBe(true)
      expect(catalog.hasAsset('figure', 'hero.png')).toBe(true)
      expect(catalog.hasAsset('scene', 'intro.txt')).toBe(true)
      expect(catalog.hasAsset('background', 'missing.png')).toBe(false)
    } finally {
      scope.stop()
    }
  })

  it('文件事件会增量更新资源清单，而不是强制全量重建', async () => {
    const slowRootRead = createDeferred<ReturnType<typeof createDirEntry>[]>()

    readDirMock.mockImplementation(async (path: string | URL) => {
      switch (String(path)) {
        case '/project/game': {
          return slowRootRead.promise
        }
        case '/project/game/background': {
          return [
            createDirEntry('bg.jpg', false),
          ]
        }
        default: {
          throw new TypeError(`unexpected readDir path: ${String(path)}`)
        }
      }
    })

    const { useResourceCatalog, useResourceCatalogBootstrap } = await import('../service')

    const scope = effectScope()
    let catalog!: ReturnType<typeof useResourceCatalog>
    scope.run(() => {
      useResourceCatalogBootstrap()
      catalog = useResourceCatalog()
    })

    try {
      slowRootRead.resolve([
        createDirEntry('background', true),
      ])
      await waitFor(() => catalog.status.value === 'ready')

      expect(catalog.status.value).toBe('ready')
      expect(catalog.hasAsset('background', 'bg.jpg')).toBe(true)
      expect(readDirMock).toHaveBeenCalledTimes(2)

      emitFileSystemEvent('file:removed', {
        type: 'file:removed',
        path: '/project/game/background/bg.jpg',
      })
      await flushMicrotasks()

      expect(catalog.hasAsset('background', 'bg.jpg')).toBe(false)
      expect(readDirMock).toHaveBeenCalledTimes(2)

      emitFileSystemEvent('file:created', {
        type: 'file:created',
        path: '/project/game/background/new-bg.jpg',
      })
      await flushMicrotasks()

      expect(catalog.hasAsset('background', 'new-bg.jpg')).toBe(true)
      expect(readDirMock).toHaveBeenCalledTimes(2)
    } finally {
      scope.stop()
    }
  })

  it('构建期间收到文件事件后会在完成后补一次重建', async () => {
    const slowFigureRead = createDeferred<ReturnType<typeof createDirEntry>[]>()
    let backgroundReadCount = 0

    readDirMock.mockImplementation(async (path: string | URL) => {
      switch (String(path)) {
        case '/project/game': {
          return [
            createDirEntry('background', true),
            createDirEntry('figure', true),
          ]
        }
        case '/project/game/background': {
          backgroundReadCount += 1
          if (backgroundReadCount === 1) {
            return [
              createDirEntry('bg.jpg', false),
            ]
          }
          return [
            createDirEntry('bg.jpg', false),
            createDirEntry('new-bg.jpg', false),
          ]
        }
        case '/project/game/figure': {
          if (backgroundReadCount === 1) {
            return slowFigureRead.promise
          }
          return []
        }
        default: {
          throw new TypeError(`unexpected readDir path: ${String(path)}`)
        }
      }
    })

    const { useResourceCatalog, useResourceCatalogBootstrap } = await import('../service')

    const scope = effectScope()
    let catalog!: ReturnType<typeof useResourceCatalog>
    scope.run(() => {
      useResourceCatalogBootstrap()
      catalog = useResourceCatalog()
    })

    try {
      await waitFor(() => backgroundReadCount === 1)

      emitFileSystemEvent('file:created', {
        type: 'file:created',
        path: '/project/game/background/new-bg.jpg',
      })
      await flushMicrotasks()

      expect(catalog.status.value).toBe('building')

      slowFigureRead.resolve([])

      await waitFor(() => catalog.status.value === 'ready' && catalog.hasAsset('background', 'new-bg.jpg'))
      expect(backgroundReadCount).toBe(2)
    } finally {
      scope.stop()
    }
  })

  it('连续目录事件会合并为一次重建', async () => {
    vi.useFakeTimers()

    try {
      readDirMock.mockImplementation(async (path: string | URL) => {
        switch (String(path)) {
          case '/project/game': {
            return [
              createDirEntry('background', true),
            ]
          }
          case '/project/game/background': {
            return [
              createDirEntry('bg.jpg', false),
            ]
          }
          default: {
            throw new TypeError(`unexpected readDir path: ${String(path)}`)
          }
        }
      })

      const { useResourceCatalog, useResourceCatalogBootstrap } = await import('../service')

      const scope = effectScope()
      let catalog!: ReturnType<typeof useResourceCatalog>
      scope.run(() => {
        useResourceCatalogBootstrap()
        catalog = useResourceCatalog()
      })

      try {
        await waitFor(() => catalog.status.value === 'ready')
        readDirMock.mockClear()

        emitFileSystemEvent('directory:created', {
          type: 'directory:created',
          path: '/project/game/background/chapter1',
        })
        emitFileSystemEvent('directory:removed', {
          type: 'directory:removed',
          path: '/project/game/background/chapter2',
        })
        emitFileSystemEvent('directory:renamed', {
          type: 'directory:renamed',
          oldPath: '/project/game/background/old-folder',
          newPath: '/project/game/background/new-folder',
        })

        expect(readDirMock).not.toHaveBeenCalled()

        await vi.advanceTimersByTimeAsync(199)
        expect(readDirMock).not.toHaveBeenCalled()

        await vi.advanceTimersByTimeAsync(1)
        await waitFor(() => readDirMock.mock.calls.length === 2)
        await waitFor(() => catalog.status.value === 'ready')

        expect(readDirMock).toHaveBeenCalledTimes(2)
      } finally {
        scope.stop()
      }
    } finally {
      vi.useRealTimers()
    }
  })
})
