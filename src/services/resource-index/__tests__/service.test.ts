import '~/__tests__/mocks/tauri-fs'

import { readDir, readTextFile } from '@tauri-apps/plugin-fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, reactive } from 'vue'

import { AbsPath, RelPath } from '~/domain/path'
import { createAssetKey } from '~/services/resource-index/keys'

const {
  getConfigMock,
  onMock,
  useWorkspaceStoreMock,
} = vi.hoisted(() => ({
  getConfigMock: vi.fn(),
  onMock: vi.fn(),
  useWorkspaceStoreMock: vi.fn(),
}))

vi.mock('~/stores/workspace', () => ({
  useWorkspaceStore: useWorkspaceStoreMock,
}))

vi.mock('~/composables/useFileSystemEvents', () => ({
  useFileSystemEvents: () => ({
    on: onMock,
  }),
}))

vi.mock('@tauri-apps/plugin-log', () => ({
  warn: vi.fn(),
}))

vi.mock('~/services/config-manager', () => ({
  configManager: {
    getConfig: getConfigMock,
  },
}))

const readDirMock = vi.mocked(readDir)
const readTextFileMock = vi.mocked(readTextFile)

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

describe('useResourceIndex', () => {
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
    readTextFileMock.mockReset()
    readTextFileMock.mockResolvedValue('')

    getConfigMock.mockReset()
    getConfigMock.mockResolvedValue({
      entries: [],
      unmanagedLineCount: 0,
    })
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

    const { useResourceIndex, useResourceIndexBootstrap } = await import('../service')

    const scope = effectScope()
    let resourceIndex!: ReturnType<typeof useResourceIndex>
    scope.run(() => {
      useResourceIndexBootstrap()
      resourceIndex = useResourceIndex()
    })

    try {
      await waitFor(() => resourceIndex.status.value === 'ready')

      expect(resourceIndex.status.value).toBe('ready')
      expect(resourceIndex.hasAssetKey(createAssetKey('asset', 'background', RelPath.from('bg.jpg')))).toBe(true)
      expect(resourceIndex.hasAssetKey(createAssetKey('asset', 'background', RelPath.from('chapter1/night.png')))).toBe(true)
      expect(resourceIndex.hasAssetKey(createAssetKey('asset', 'figure', RelPath.from('hero.png')))).toBe(true)
      expect(resourceIndex.hasAssetKey(createAssetKey('scene', 'scene', RelPath.from('intro.txt')))).toBe(true)
      expect(resourceIndex.hasAssetKey(createAssetKey('asset', 'background', RelPath.from('missing.png')))).toBe(false)
      expect(resourceIndex.resolveByAbsolutePath(AbsPath.from('/project/game/background/bg.jpg')))
        .toEqual({
          key: createAssetKey('asset', 'background', RelPath.from('bg.jpg')),
          absolutePath: AbsPath.from('/project/game/background/bg.jpg'),
          fileName: 'bg.jpg',
          extension: '.jpg',
        })
      expect(resourceIndex.listByAssetType('background').map(entry => entry.key.relativePath))
        .toEqual([
          RelPath.from('bg.jpg'),
          RelPath.from('chapter1/night.png'),
        ])
    } finally {
      scope.stop()
    }
  })

  it('启动后会建立 scene 与 game config 的资源引用索引', async () => {
    readDirMock.mockImplementation(async (path: string | URL) => {
      switch (String(path)) {
        case '/project/game': {
          return [
            createDirEntry('background', true),
            createDirEntry('figure', true),
            createDirEntry('bgm', true),
            createDirEntry('scene', true),
            createDirEntry('vocal', true),
          ]
        }
        case '/project/game/background': {
          return [
            createDirEntry('bg.jpg', false),
            createDirEntry('cover.png', false),
            createDirEntry('opening.webp', false),
            createDirEntry('enter.webp', false),
          ]
        }
        case '/project/game/figure': {
          return [
            createDirEntry('hero.png', false),
          ]
        }
        case '/project/game/bgm': {
          return [
            createDirEntry('title.ogg', false),
          ]
        }
        case '/project/game/scene': {
          return [
            createDirEntry('intro.txt', false),
            createDirEntry('chapter1', true),
          ]
        }
        case '/project/game/scene/chapter1': {
          return [
            createDirEntry('branch.txt', false),
          ]
        }
        case '/project/game/vocal': {
          return [
            createDirEntry('voice.ogg', false),
          ]
        }
        default: {
          throw new TypeError(`unexpected readDir path: ${String(path)}`)
        }
      }
    })

    readTextFileMock.mockImplementation(async (path: string | URL) => {
      switch (String(path)) {
        case '/project/game/scene/intro.txt': {
          return [
            'changeBg:bg.jpg;',
            'Alice:Hello -vocal=voice.ogg;',
            'choose:A:chapter1/branch.txt|B:missing.txt;',
          ].join('\n')
        }
        case '/project/game/scene/chapter1/branch.txt': {
          return 'changeFigure:hero.png;'
        }
        default: {
          throw new TypeError(`unexpected readTextFile path: ${String(path)}`)
        }
      }
    })

    getConfigMock.mockResolvedValue({
      entries: [
        { key: 'Title_img', value: 'cover.png' },
        { key: 'Title_bgm', value: 'title.ogg' },
        { key: 'Game_Logo', value: 'opening.webp|enter.webp|' },
      ],
      unmanagedLineCount: 0,
    })

    const { useResourceIndex, useResourceIndexBootstrap } = await import('../service')

    const scope = effectScope()
    let resourceIndex!: ReturnType<typeof useResourceIndex>
    scope.run(() => {
      useResourceIndexBootstrap()
      resourceIndex = useResourceIndex()
    })

    try {
      await waitFor(() => resourceIndex.status.value === 'ready')

      const backgroundKey = createAssetKey('asset', 'background', RelPath.from('bg.jpg'))
      const coverKey = createAssetKey('asset', 'background', RelPath.from('cover.png'))
      const titleBgmKey = createAssetKey('asset', 'bgm', RelPath.from('title.ogg'))
      const openingLogoKey = createAssetKey('asset', 'background', RelPath.from('opening.webp'))
      const enterLogoKey = createAssetKey('asset', 'background', RelPath.from('enter.webp'))
      const branchSceneKey = createAssetKey('scene', 'scene', RelPath.from('chapter1/branch.txt'))
      const missingSceneKey = createAssetKey('scene', 'scene', RelPath.from('missing.txt'))

      expect(resourceIndex.hasAssetKey(backgroundKey)).toBe(true)
      expect(resourceIndex.getReferencesTo(backgroundKey)).toMatchObject([
        {
          sourcePath: '/project/game/scene/intro.txt',
          sourceKind: 'scene',
          fieldKey: '__content__',
          statementId: 1,
        },
      ])
      expect(resourceIndex.getReferencesTo(coverKey)).toMatchObject([
        {
          sourcePath: '/project/game/config.txt',
          sourceKind: 'game-config',
          fieldKey: 'Title_img',
        },
      ])
      expect(resourceIndex.getReferencesTo(titleBgmKey)).toMatchObject([
        {
          sourcePath: '/project/game/config.txt',
          sourceKind: 'game-config',
          fieldKey: 'Title_bgm',
        },
      ])
      expect(resourceIndex.getReferencesTo(openingLogoKey)).toMatchObject([
        {
          sourcePath: '/project/game/config.txt',
          sourceKind: 'game-config',
          fieldKey: 'Game_Logo',
        },
      ])
      expect(resourceIndex.getReferencesTo(enterLogoKey)).toMatchObject([
        {
          sourcePath: '/project/game/config.txt',
          sourceKind: 'game-config',
          fieldKey: 'Game_Logo',
        },
      ])
      expect(resourceIndex.getReferencesFrom(AbsPath.from('/project/game/scene/intro.txt'))).toHaveLength(4)
      expect(resourceIndex.getReferencesFrom(AbsPath.from('/project/game/config.txt'))).toHaveLength(4)
      expect(resourceIndex.getReferencesTo(branchSceneKey)).toMatchObject([
        {
          sourcePath: '/project/game/scene/intro.txt',
          sourceKind: 'scene',
          fieldKey: 'choose[0].file',
          statementId: 3,
        },
      ])
      expect(resourceIndex.findMissingReferences()).toEqual([
        {
          kind: 'missing-reference',
          assetKey: missingSceneKey,
          references: [
            expect.objectContaining({
              sourcePath: '/project/game/scene/intro.txt',
              fieldKey: 'choose[1].file',
              statementId: 3,
            }),
          ],
        },
      ])
    } finally {
      scope.stop()
    }
  })

  it('scene 文件修改时只重建该文件的引用记录', async () => {
    readDirMock.mockImplementation(async (path: string | URL) => {
      switch (String(path)) {
        case '/project/game': {
          return [
            createDirEntry('background', true),
            createDirEntry('scene', true),
          ]
        }
        case '/project/game/background': {
          return [
            createDirEntry('bg.jpg', false),
            createDirEntry('new-bg.jpg', false),
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

    readTextFileMock.mockResolvedValueOnce('changeBg:bg.jpg;')
    readTextFileMock.mockResolvedValue('changeBg:new-bg.jpg;')

    const { useResourceIndex, useResourceIndexBootstrap } = await import('../service')

    const scope = effectScope()
    let resourceIndex!: ReturnType<typeof useResourceIndex>
    scope.run(() => {
      useResourceIndexBootstrap()
      resourceIndex = useResourceIndex()
    })

    try {
      await waitFor(() => resourceIndex.status.value === 'ready')
      readDirMock.mockClear()

      const oldKey = createAssetKey('asset', 'background', RelPath.from('bg.jpg'))
      const nextKey = createAssetKey('asset', 'background', RelPath.from('new-bg.jpg'))

      expect(resourceIndex.getReferencesTo(oldKey)).toHaveLength(1)
      expect(resourceIndex.getReferencesTo(nextKey)).toHaveLength(0)

      emitFileSystemEvent('file:modified', {
        type: 'file:modified',
        path: '/project/game/scene/intro.txt',
      })
      await waitFor(() => resourceIndex.getReferencesTo(nextKey).length === 1)

      expect(resourceIndex.getReferencesTo(oldKey)).toHaveLength(0)
      expect(readDirMock).not.toHaveBeenCalled()
    } finally {
      scope.stop()
    }
  })

  it('game config 修改时只重建配置文件引用记录', async () => {
    readDirMock.mockImplementation(async (path: string | URL) => {
      switch (String(path)) {
        case '/project/game': {
          return [
            createDirEntry('background', true),
            createDirEntry('bgm', true),
            createDirEntry('scene', true),
          ]
        }
        case '/project/game/background': {
          return [
            createDirEntry('cover.png', false),
            createDirEntry('cover-next.png', false),
            createDirEntry('opening.webp', false),
            createDirEntry('opening-next.webp', false),
          ]
        }
        case '/project/game/bgm': {
          return [
            createDirEntry('title.ogg', false),
            createDirEntry('title-next.ogg', false),
          ]
        }
        case '/project/game/scene': {
          return []
        }
        default: {
          throw new TypeError(`unexpected readDir path: ${String(path)}`)
        }
      }
    })

    getConfigMock
      .mockResolvedValueOnce({
        entries: [
          { key: 'Title_img', value: 'cover.png' },
          { key: 'Title_bgm', value: 'title.ogg' },
          { key: 'Game_Logo', value: 'opening.webp|' },
        ],
        unmanagedLineCount: 0,
      })
      .mockResolvedValue({
        entries: [
          { key: 'Title_img', value: 'cover-next.png' },
          { key: 'Title_bgm', value: 'title-next.ogg' },
          { key: 'Game_Logo', value: 'opening-next.webp|' },
        ],
        unmanagedLineCount: 0,
      })

    const { useResourceIndex, useResourceIndexBootstrap } = await import('../service')

    const scope = effectScope()
    let resourceIndex!: ReturnType<typeof useResourceIndex>
    scope.run(() => {
      useResourceIndexBootstrap()
      resourceIndex = useResourceIndex()
    })

    try {
      await waitFor(() => resourceIndex.status.value === 'ready')
      readDirMock.mockClear()

      const oldCoverKey = createAssetKey('asset', 'background', RelPath.from('cover.png'))
      const nextCoverKey = createAssetKey('asset', 'background', RelPath.from('cover-next.png'))
      const oldTitleBgmKey = createAssetKey('asset', 'bgm', RelPath.from('title.ogg'))
      const nextTitleBgmKey = createAssetKey('asset', 'bgm', RelPath.from('title-next.ogg'))
      const oldLogoKey = createAssetKey('asset', 'background', RelPath.from('opening.webp'))
      const nextLogoKey = createAssetKey('asset', 'background', RelPath.from('opening-next.webp'))

      expect(resourceIndex.getReferencesTo(oldCoverKey)).toHaveLength(1)
      expect(resourceIndex.getReferencesTo(nextCoverKey)).toHaveLength(0)
      expect(resourceIndex.getReferencesTo(oldTitleBgmKey)).toHaveLength(1)
      expect(resourceIndex.getReferencesTo(nextTitleBgmKey)).toHaveLength(0)
      expect(resourceIndex.getReferencesTo(oldLogoKey)).toHaveLength(1)
      expect(resourceIndex.getReferencesTo(nextLogoKey)).toHaveLength(0)

      emitFileSystemEvent('file:modified', {
        type: 'file:modified',
        path: '/project/game/config.txt',
      })
      await waitFor(() =>
        resourceIndex.getReferencesTo(nextCoverKey).length === 1
        && resourceIndex.getReferencesTo(nextTitleBgmKey).length === 1
        && resourceIndex.getReferencesTo(nextLogoKey).length === 1,
      )

      expect(resourceIndex.getReferencesTo(oldCoverKey)).toHaveLength(0)
      expect(resourceIndex.getReferencesTo(oldTitleBgmKey)).toHaveLength(0)
      expect(resourceIndex.getReferencesTo(oldLogoKey)).toHaveLength(0)
      expect(readDirMock).not.toHaveBeenCalled()
    } finally {
      scope.stop()
    }
  })

  it('并发 scene 修改会合并到最新引用索引，不丢弃较晚完成的切片', async () => {
    readDirMock.mockImplementation(async (path: string | URL) => {
      switch (String(path)) {
        case '/project/game': {
          return [
            createDirEntry('background', true),
            createDirEntry('scene', true),
          ]
        }
        case '/project/game/background': {
          return [
            createDirEntry('old-a.jpg', false),
            createDirEntry('old-b.jpg', false),
            createDirEntry('new-a.jpg', false),
            createDirEntry('new-b.jpg', false),
          ]
        }
        case '/project/game/scene': {
          return [
            createDirEntry('a.txt', false),
            createDirEntry('b.txt', false),
          ]
        }
        default: {
          throw new TypeError(`unexpected readDir path: ${String(path)}`)
        }
      }
    })

    const pendingReads = new Map<string, ReturnType<typeof createDeferred<string>>>()
    readTextFileMock.mockImplementation(async (path: string | URL) => {
      const pathText = String(path)
      const pendingRead = pendingReads.get(pathText)
      if (pendingRead) {
        return pendingRead.promise
      }

      switch (pathText) {
        case '/project/game/scene/a.txt': {
          return 'changeBg:old-a.jpg;'
        }
        case '/project/game/scene/b.txt': {
          return 'changeBg:old-b.jpg;'
        }
        default: {
          throw new TypeError(`unexpected readTextFile path: ${pathText}`)
        }
      }
    })

    const { useResourceIndex, useResourceIndexBootstrap } = await import('../service')

    const scope = effectScope()
    let resourceIndex!: ReturnType<typeof useResourceIndex>
    scope.run(() => {
      useResourceIndexBootstrap()
      resourceIndex = useResourceIndex()
    })

    try {
      await waitFor(() => resourceIndex.status.value === 'ready')

      const oldAKey = createAssetKey('asset', 'background', RelPath.from('old-a.jpg'))
      const oldBKey = createAssetKey('asset', 'background', RelPath.from('old-b.jpg'))
      const newAKey = createAssetKey('asset', 'background', RelPath.from('new-a.jpg'))
      const newBKey = createAssetKey('asset', 'background', RelPath.from('new-b.jpg'))

      expect(resourceIndex.getReferencesTo(oldAKey)).toHaveLength(1)
      expect(resourceIndex.getReferencesTo(oldBKey)).toHaveLength(1)

      const aRead = createDeferred<string>()
      const bRead = createDeferred<string>()
      pendingReads.set('/project/game/scene/a.txt', aRead)
      pendingReads.set('/project/game/scene/b.txt', bRead)

      emitFileSystemEvent('file:modified', {
        type: 'file:modified',
        path: '/project/game/scene/a.txt',
      })
      emitFileSystemEvent('file:modified', {
        type: 'file:modified',
        path: '/project/game/scene/b.txt',
      })
      await flushMicrotasks()

      aRead.resolve('changeBg:new-a.jpg;')
      await waitFor(() => resourceIndex.getReferencesTo(newAKey).length === 1)

      bRead.resolve('changeBg:new-b.jpg;')
      await waitFor(() => resourceIndex.getReferencesTo(newBKey).length === 1)

      expect(resourceIndex.getReferencesTo(oldAKey)).toHaveLength(0)
      expect(resourceIndex.getReferencesTo(oldBKey)).toHaveLength(0)
      expect(resourceIndex.getReferencesTo(newAKey)).toHaveLength(1)
      expect(resourceIndex.getReferencesTo(newBKey)).toHaveLength(1)
    } finally {
      scope.stop()
    }
  })

  it('同一 scene 连续修改时会忽略较早完成的旧切片', async () => {
    readDirMock.mockImplementation(async (path: string | URL) => {
      switch (String(path)) {
        case '/project/game': {
          return [
            createDirEntry('background', true),
            createDirEntry('scene', true),
          ]
        }
        case '/project/game/background': {
          return [
            createDirEntry('old.jpg', false),
            createDirEntry('stale.jpg', false),
            createDirEntry('fresh.jpg', false),
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

    const pendingReads: ReturnType<typeof createDeferred<string>>[] = []
    readTextFileMock.mockImplementation(async (path: string | URL) => {
      if (String(path) !== '/project/game/scene/intro.txt') {
        throw new TypeError(`unexpected readTextFile path: ${String(path)}`)
      }
      const pendingRead = pendingReads.shift()
      return pendingRead ? pendingRead.promise : 'changeBg:old.jpg;'
    })

    const { useResourceIndex, useResourceIndexBootstrap } = await import('../service')

    const scope = effectScope()
    let resourceIndex!: ReturnType<typeof useResourceIndex>
    scope.run(() => {
      useResourceIndexBootstrap()
      resourceIndex = useResourceIndex()
    })

    try {
      await waitFor(() => resourceIndex.status.value === 'ready')

      const oldKey = createAssetKey('asset', 'background', RelPath.from('old.jpg'))
      const staleKey = createAssetKey('asset', 'background', RelPath.from('stale.jpg'))
      const freshKey = createAssetKey('asset', 'background', RelPath.from('fresh.jpg'))

      expect(resourceIndex.getReferencesTo(oldKey)).toHaveLength(1)

      const staleRead = createDeferred<string>()
      const freshRead = createDeferred<string>()
      pendingReads.push(staleRead, freshRead)

      emitFileSystemEvent('file:modified', {
        type: 'file:modified',
        path: '/project/game/scene/intro.txt',
      })
      emitFileSystemEvent('file:modified', {
        type: 'file:modified',
        path: '/project/game/scene/intro.txt',
      })
      await flushMicrotasks()

      freshRead.resolve('changeBg:fresh.jpg;')
      await waitFor(() => resourceIndex.getReferencesTo(freshKey).length === 1)

      staleRead.resolve('changeBg:stale.jpg;')
      await flushMicrotasks()

      expect(resourceIndex.getReferencesTo(oldKey)).toHaveLength(0)
      expect(resourceIndex.getReferencesTo(staleKey)).toHaveLength(0)
      expect(resourceIndex.getReferencesTo(freshKey)).toHaveLength(1)
    } finally {
      scope.stop()
    }
  })

  it('资源文件重命名会更新清单，并让旧引用进入缺失查询', async () => {
    readDirMock.mockImplementation(async (path: string | URL) => {
      switch (String(path)) {
        case '/project/game': {
          return [
            createDirEntry('background', true),
            createDirEntry('scene', true),
          ]
        }
        case '/project/game/background': {
          return [
            createDirEntry('bg.jpg', false),
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

    readTextFileMock.mockResolvedValue('changeBg:bg.jpg;')

    const { useResourceIndex, useResourceIndexBootstrap } = await import('../service')

    const scope = effectScope()
    let resourceIndex!: ReturnType<typeof useResourceIndex>
    scope.run(() => {
      useResourceIndexBootstrap()
      resourceIndex = useResourceIndex()
    })

    try {
      await waitFor(() => resourceIndex.status.value === 'ready')

      const oldKey = createAssetKey('asset', 'background', RelPath.from('bg.jpg'))
      const nextKey = createAssetKey('asset', 'background', RelPath.from('renamed.jpg'))

      expect(resourceIndex.hasAssetKey(oldKey)).toBe(true)
      expect(resourceIndex.findMissingReferences()).toEqual([])

      emitFileSystemEvent('file:renamed', {
        type: 'file:renamed',
        oldPath: '/project/game/background/bg.jpg',
        newPath: '/project/game/background/renamed.jpg',
      })
      await flushMicrotasks()

      expect(resourceIndex.hasAssetKey(oldKey)).toBe(false)
      expect(resourceIndex.hasAssetKey(nextKey)).toBe(true)
      expect(resourceIndex.getReferencesTo(oldKey)).toHaveLength(1)
      expect(resourceIndex.findMissingReferences()).toMatchObject([
        {
          kind: 'missing-reference',
          assetKey: oldKey,
        },
      ])
    } finally {
      scope.stop()
    }
  })

  it('scene 重命名会忽略旧路径上较晚完成的修改切片', async () => {
    readDirMock.mockImplementation(async (path: string | URL) => {
      switch (String(path)) {
        case '/project/game': {
          return [
            createDirEntry('background', true),
            createDirEntry('scene', true),
          ]
        }
        case '/project/game/background': {
          return [
            createDirEntry('old.jpg', false),
            createDirEntry('stale.jpg', false),
            createDirEntry('renamed.jpg', false),
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

    const pendingReads = new Map<string, ReturnType<typeof createDeferred<string>>>()
    readTextFileMock.mockImplementation(async (path: string | URL) => {
      const pathText = String(path)
      const pendingRead = pendingReads.get(pathText)
      if (pendingRead) {
        return pendingRead.promise
      }

      switch (pathText) {
        case '/project/game/scene/intro.txt': {
          return 'changeBg:old.jpg;'
        }
        case '/project/game/scene/renamed.txt': {
          return 'changeBg:renamed.jpg;'
        }
        default: {
          throw new TypeError(`unexpected readTextFile path: ${pathText}`)
        }
      }
    })

    const { useResourceIndex, useResourceIndexBootstrap } = await import('../service')

    const scope = effectScope()
    let resourceIndex!: ReturnType<typeof useResourceIndex>
    scope.run(() => {
      useResourceIndexBootstrap()
      resourceIndex = useResourceIndex()
    })

    try {
      await waitFor(() => resourceIndex.status.value === 'ready')

      const oldKey = createAssetKey('asset', 'background', RelPath.from('old.jpg'))
      const staleKey = createAssetKey('asset', 'background', RelPath.from('stale.jpg'))
      const renamedKey = createAssetKey('asset', 'background', RelPath.from('renamed.jpg'))

      expect(resourceIndex.getReferencesTo(oldKey)).toHaveLength(1)

      const staleRead = createDeferred<string>()
      pendingReads.set('/project/game/scene/intro.txt', staleRead)

      emitFileSystemEvent('file:modified', {
        type: 'file:modified',
        path: '/project/game/scene/intro.txt',
      })
      await flushMicrotasks()

      pendingReads.delete('/project/game/scene/intro.txt')
      emitFileSystemEvent('file:renamed', {
        type: 'file:renamed',
        oldPath: '/project/game/scene/intro.txt',
        newPath: '/project/game/scene/renamed.txt',
      })
      await waitFor(() => resourceIndex.getReferencesTo(renamedKey).length === 1)

      staleRead.resolve('changeBg:stale.jpg;')
      await flushMicrotasks()

      expect(resourceIndex.getReferencesTo(oldKey)).toHaveLength(0)
      expect(resourceIndex.getReferencesTo(staleKey)).toHaveLength(0)
      expect(resourceIndex.getReferencesTo(renamedKey)).toHaveLength(1)
      expect(resourceIndex.getReferencesFrom(AbsPath.from('/project/game/scene/intro.txt'))).toEqual([])
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

    const { useResourceIndex, useResourceIndexBootstrap } = await import('../service')

    const scope = effectScope()
    let resourceIndex!: ReturnType<typeof useResourceIndex>
    scope.run(() => {
      useResourceIndexBootstrap()
      resourceIndex = useResourceIndex()
    })

    try {
      slowRootRead.resolve([
        createDirEntry('background', true),
      ])
      await waitFor(() => resourceIndex.status.value === 'ready')

      expect(resourceIndex.status.value).toBe('ready')
      expect(resourceIndex.hasAssetKey(createAssetKey('asset', 'background', RelPath.from('bg.jpg')))).toBe(true)
      expect(readDirMock).toHaveBeenCalledTimes(2)

      emitFileSystemEvent('file:removed', {
        type: 'file:removed',
        path: '/project/game/background/bg.jpg',
      })
      await flushMicrotasks()

      expect(resourceIndex.hasAssetKey(createAssetKey('asset', 'background', RelPath.from('bg.jpg')))).toBe(false)
      expect(readDirMock).toHaveBeenCalledTimes(2)

      emitFileSystemEvent('file:created', {
        type: 'file:created',
        path: '/project/game/background/new-bg.jpg',
      })
      await flushMicrotasks()

      expect(resourceIndex.hasAssetKey(createAssetKey('asset', 'background', RelPath.from('new-bg.jpg')))).toBe(true)
      expect(readDirMock).toHaveBeenCalledTimes(2)
    } finally {
      scope.stop()
    }
  })

  it('文件移除时会清理对应的引用更新取消占位', async () => {
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

    const deleteSpy = vi.spyOn(Map.prototype, 'delete')

    const { useResourceIndex, useResourceIndexBootstrap } = await import('../service')

    const scope = effectScope()
    let resourceIndex!: ReturnType<typeof useResourceIndex>
    scope.run(() => {
      useResourceIndexBootstrap()
      resourceIndex = useResourceIndex()
    })

    try {
      await waitFor(() => resourceIndex.status.value === 'ready')
      deleteSpy.mockClear()

      emitFileSystemEvent('file:removed', {
        type: 'file:removed',
        path: '/project/game/background/bg.jpg',
      })
      await flushMicrotasks()

      expect(resourceIndex.hasAssetKey(createAssetKey('asset', 'background', RelPath.from('bg.jpg')))).toBe(false)
      expect(deleteSpy.mock.calls.some(([key]) => key === '/project/game/background/bg.jpg')).toBe(true)
    } finally {
      deleteSpy.mockRestore()
      scope.stop()
    }
  })

  it('非 scene 与配置文件的修改不会写入引用更新版本', async () => {
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

    const setSpy = vi.spyOn(Map.prototype, 'set')

    const { useResourceIndex, useResourceIndexBootstrap } = await import('../service')

    const scope = effectScope()
    let resourceIndex!: ReturnType<typeof useResourceIndex>
    scope.run(() => {
      useResourceIndexBootstrap()
      resourceIndex = useResourceIndex()
    })

    try {
      await waitFor(() => resourceIndex.status.value === 'ready')
      setSpy.mockClear()

      emitFileSystemEvent('file:modified', {
        type: 'file:modified',
        path: '/project/game/background/bg.jpg',
      })
      await flushMicrotasks()

      expect(setSpy.mock.calls.some(([key]) => key === '/project/game/background/bg.jpg')).toBe(false)
    } finally {
      setSpy.mockRestore()
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

    const { useResourceIndex, useResourceIndexBootstrap } = await import('../service')

    const scope = effectScope()
    let resourceIndex!: ReturnType<typeof useResourceIndex>
    scope.run(() => {
      useResourceIndexBootstrap()
      resourceIndex = useResourceIndex()
    })

    try {
      await waitFor(() => backgroundReadCount === 1)

      emitFileSystemEvent('file:created', {
        type: 'file:created',
        path: '/project/game/background/new-bg.jpg',
      })
      await flushMicrotasks()

      expect(resourceIndex.status.value).toBe('building')

      slowFigureRead.resolve([])

      await waitFor(() =>
        resourceIndex.status.value === 'ready'
        && resourceIndex.hasAssetKey(createAssetKey('asset', 'background', RelPath.from('new-bg.jpg'))),
      )
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

      const { useResourceIndex, useResourceIndexBootstrap } = await import('../service')

      const scope = effectScope()
      let resourceIndex!: ReturnType<typeof useResourceIndex>
      scope.run(() => {
        useResourceIndexBootstrap()
        resourceIndex = useResourceIndex()
      })

      try {
        await waitFor(() => resourceIndex.status.value === 'ready')
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
        await waitFor(() => resourceIndex.status.value === 'ready')

        expect(readDirMock).toHaveBeenCalledTimes(2)
      } finally {
        scope.stop()
      }
    } finally {
      vi.useRealTimers()
    }
  })
})
