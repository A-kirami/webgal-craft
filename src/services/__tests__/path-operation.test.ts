import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createTextMetadata } from '~/domain/document/document-model'
import { AbsPath, RelPath } from '~/domain/path'
import { createPathOperationService } from '~/services/path-operation'
import { createAssetKey } from '~/services/resource-index/keys'

import type { TextMetadata } from '~/domain/document/document-model'
import type {
  PathOperationConfirmDecision,
  PathOperationDeps,
  PathOperationPlan,
} from '~/services/path-operation'
import type { AssetReferenceRecord } from '~/services/resource-index/references'

type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends (...args: infer _Args) => unknown
    ? T[K]
    : T[K] extends object
      ? DeepPartial<T[K]>
      : T[K]
}

const { existsMock } = vi.hoisted(() => ({
  existsMock: vi.fn(),
}))

const { backupManagerMock } = vi.hoisted(() => ({
  backupManagerMock: {
    createSystemRefactorBackup: vi.fn(),
    moveSceneHistory: vi.fn(async () => undefined),
  },
}))

vi.mock('@tauri-apps/plugin-fs', () => ({
  exists: existsMock,
}))

vi.mock('@tauri-apps/plugin-log', () => ({
  debug: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
}))

vi.mock('~/services/backup-manager', () => ({
  backupManager: backupManagerMock,
}))

function createDeps(overrides: DeepPartial<PathOperationDeps> = {}): PathOperationDeps {
  const loadedSourcePaths = new Set([
    '/project/game/background/bg.jpg',
    '/project/game/background/cover.png',
  ])
  const base = {
    editor: {
      applySystemRefactor: vi.fn(() => true),
      peekSceneBuffer: vi.fn(() => undefined),
      peekSceneRevision: vi.fn(() => undefined),
    },
    fileStore: {
      applyPathMutation: vi.fn(),
      getItemByPath: vi.fn((path: AbsPath) =>
        loadedSourcePaths.has(path) ? { isDir: false } : undefined,
      ),
      invalidatePathOperationCaches: vi.fn(),
      refreshItemMetadata: vi.fn(),
    },
    fileSystemEvents: {
      emit: vi.fn(),
    },
    gameConfig: {
      getConfig: vi.fn(async () => ({
        entries: [],
        unmanagedLineCount: 0,
      })),
      setConfig: vi.fn(),
    },
    gameFs: {
      moveFile: vi.fn(async (_sourcePath, targetDirectory) => ({
        echoMode: 'watcher' as const,
        newPath: AbsPath.append(targetDirectory, 'bg.jpg'),
      })),
      readDocumentFile: vi.fn(async () => new TextEncoder().encode('changeBg:bg.jpg;')),
      renameFile: vi.fn(async (sourcePath, newName) => ({
        echoMode: 'watcher' as const,
        newPath: AbsPath.append(AbsPath.parent(sourcePath), newName),
      })),
      writeDocumentFile: vi.fn(),
    },
    gameManager: {
      refreshRegisteredGameSnapshot: vi.fn(),
    },
    getGamePath: vi.fn(() => AbsPath.from('/project')),
    history: {
      migrateSceneHistory: vi.fn(),
    },
    pathOperationRegistry: {
      hasOverlap: vi.fn(() => false),
      markSettled: vi.fn(),
      register: vi.fn(() => 1),
      release: vi.fn(),
      updateChannel: vi.fn(),
    },
    resourceIndex: {
      getReferencesTo: vi.fn(() => []),
      resolveByAbsolutePath: vi.fn(() => undefined),
      listByAssetType: vi.fn(() => []),
    },
  } satisfies PathOperationDeps

  return {
    ...base,
    ...overrides,
    editor: {
      ...base.editor,
      ...overrides.editor,
    },
    fileStore: {
      ...base.fileStore,
      ...overrides.fileStore,
    },
    fileSystemEvents: {
      ...base.fileSystemEvents,
      ...overrides.fileSystemEvents,
    },
    gameConfig: {
      ...base.gameConfig,
      ...overrides.gameConfig,
    },
    gameFs: {
      ...base.gameFs,
      ...overrides.gameFs,
    },
    gameManager: {
      ...base.gameManager,
      ...overrides.gameManager,
    },
    history: {
      ...base.history,
      ...overrides.history,
    },
    pathOperationRegistry: {
      ...base.pathOperationRegistry,
      ...overrides.pathOperationRegistry,
    },
    resourceIndex: {
      ...base.resourceIndex,
      ...overrides.resourceIndex,
    },
  }
}

beforeEach(() => {
  backupManagerMock.createSystemRefactorBackup.mockReset()
  backupManagerMock.moveSceneHistory.mockReset().mockResolvedValue(undefined)
})

describe('pathOperation', () => {
  beforeEach(() => {
    vi.useRealTimers()
    existsMock.mockReset()
    existsMock.mockResolvedValue(false)
  })

  it('无引用 rename 会执行 FS、副作用提交、事件广播和单次游戏刷新', async () => {
    const deps = createDeps()
    const service = createPathOperationService(deps)

    const result = await service.perform({
      kind: 'rename',
      sourcePath: AbsPath.from('/project/game/background/bg.jpg'),
      target: { type: 'name', name: 'renamed.jpg' },
    })

    expect(result.cancelled).toBe(false)
    expect(result.finalPath).toBe('/project/game/background/renamed.jpg')
    expect(deps.gameFs.renameFile).toHaveBeenCalledWith('/project/game/background/bg.jpg', 'renamed.jpg')
    expect(deps.fileStore.applyPathMutation).toHaveBeenCalledWith(
      '/project/game/background/bg.jpg',
      '/project/game/background/renamed.jpg',
    )
    expect(deps.fileSystemEvents.emit).toHaveBeenCalledWith({
      type: 'file:renamed',
      oldPath: '/project/game/background/bg.jpg',
      newPath: '/project/game/background/renamed.jpg',
      source: 'system-refactor',
    })
    expect(deps.gameManager.refreshRegisteredGameSnapshot).toHaveBeenCalledWith('/project')
    expect(deps.pathOperationRegistry.updateChannel).toHaveBeenCalledWith(1, {
      echoMode: 'watcher',
      expectedEchoes: 1,
    })
    expect(deps.pathOperationRegistry.markSettled).toHaveBeenCalledWith(1)
    expect(deps.pathOperationRegistry.release).not.toHaveBeenCalled()
  })

  it('有结构化场景引用时会先确认，用户取消后不产生副作用', async () => {
    const referencedRecord = {
      assetKey: createAssetKey('asset', 'background', RelPath.from('bg.jpg')),
      fieldKey: '__content__',
      sourceKind: 'scene',
      sourcePath: AbsPath.from('/project/game/scene/start.txt'),
      statementId: 1,
    } satisfies AssetReferenceRecord
    const deps = createDeps({
      resourceIndex: {
        getReferencesTo: vi.fn(() => [referencedRecord]),
        listByAssetType: vi.fn(() => []),
        resolveByAbsolutePath: vi.fn(() => ({
          absolutePath: AbsPath.from('/project/game/background/bg.jpg'),
          extension: '.jpg',
          fileName: 'bg.jpg',
          key: createAssetKey('asset', 'background', RelPath.from('bg.jpg')),
        })),
      },
    })
    const service = createPathOperationService(deps)
    const confirm = vi.fn(async (_plan: PathOperationPlan): Promise<PathOperationConfirmDecision> => 'cancel')

    const result = await service.perform({
      kind: 'rename',
      sourcePath: AbsPath.from('/project/game/background/bg.jpg'),
      target: { type: 'name', name: 'renamed.jpg' },
    }, confirm)

    expect(result.cancelled).toBe(true)
    expect(confirm).toHaveBeenCalledWith(expect.objectContaining({
      rewrites: [
        expect.objectContaining({
          after: 'changeBg:renamed.jpg;',
          before: 'changeBg:bg.jpg;',
          filePath: '/project/game/scene/start.txt',
          kind: 'scene',
          referenceCount: 1,
        }),
      ],
    }))
    expect(deps.gameFs.renameFile).not.toHaveBeenCalled()
    expect(deps.fileStore.applyPathMutation).not.toHaveBeenCalled()
    expect(deps.fileSystemEvents.emit).not.toHaveBeenCalled()
  })

  it('选择仅重命名时会执行路径操作，但不会写入引用重写', async () => {
    const referencedRecord = {
      assetKey: createAssetKey('asset', 'background', RelPath.from('bg.jpg')),
      fieldKey: '__content__',
      sourceKind: 'scene',
      sourcePath: AbsPath.from('/project/game/scene/start.txt'),
      statementId: 1,
    } satisfies AssetReferenceRecord
    const deps = createDeps({
      resourceIndex: {
        getReferencesTo: vi.fn(() => [referencedRecord]),
        listByAssetType: vi.fn(() => []),
        resolveByAbsolutePath: vi.fn(() => ({
          absolutePath: AbsPath.from('/project/game/background/bg.jpg'),
          extension: '.jpg',
          fileName: 'bg.jpg',
          key: createAssetKey('asset', 'background', RelPath.from('bg.jpg')),
        })),
      },
    })
    const service = createPathOperationService(deps)
    const confirm = vi.fn(async (_plan: PathOperationPlan): Promise<PathOperationConfirmDecision> => 'path-only')

    const result = await service.perform({
      kind: 'rename',
      sourcePath: AbsPath.from('/project/game/background/bg.jpg'),
      target: { type: 'name', name: 'renamed.jpg' },
    }, confirm)

    expect(result.cancelled).toBe(false)
    expect(result.finalPath).toBe('/project/game/background/renamed.jpg')
    expect(confirm).toHaveBeenCalledWith(expect.objectContaining({
      rewrites: [
        expect.objectContaining({
          filePath: '/project/game/scene/start.txt',
          referenceCount: 1,
        }),
      ],
    }))
    expect(result.plan.rewrites).toEqual([])
    expect(deps.gameFs.renameFile).toHaveBeenCalledWith('/project/game/background/bg.jpg', 'renamed.jpg')
    expect(deps.gameFs.writeDocumentFile).not.toHaveBeenCalled()
    expect(deps.fileSystemEvents.emit).toHaveBeenCalledWith({
      type: 'file:renamed',
      oldPath: '/project/game/background/bg.jpg',
      newPath: '/project/game/background/renamed.jpg',
      source: 'system-refactor',
    })
  })

  it('rename 目标路径未加载但磁盘已存在时会阻断 duplicate-target', async () => {
    existsMock.mockResolvedValue(true)
    const deps = createDeps({
      fileStore: {
        getItemByPath: vi.fn(() => undefined),
      },
    })
    const service = createPathOperationService(deps)

    const plan = await service.plan({
      kind: 'rename',
      sourcePath: AbsPath.from('/project/game/background/bg.jpg'),
      target: { type: 'name', name: 'renamed.jpg' },
    })

    expect(plan.blockedReasons).toContainEqual(expect.objectContaining({
      kind: 'duplicate-target',
      filePath: '/project/game/background/renamed.jpg',
    }))
    expect(deps.gameFs.renameFile).not.toHaveBeenCalled()
  })

  it('move 目标存在同名文件时会在 plan 阶段保留两者，并让引用重写指向最终唯一路径', async () => {
    const referencedRecord = {
      assetKey: createAssetKey('asset', 'background', RelPath.from('bg.jpg')),
      fieldKey: '__content__',
      sourceKind: 'scene',
      sourcePath: AbsPath.from('/project/game/scene/start.txt'),
      statementId: 1,
    } satisfies AssetReferenceRecord
    existsMock.mockImplementation(async (path: AbsPath) =>
      path === AbsPath.from('/project/game/background/archive/bg.jpg'),
    )
    const deps = createDeps({
      fileStore: {
        getItemByPath: vi.fn((path: AbsPath) => {
          if (path === AbsPath.from('/project/game/background/bg.jpg')) {
            return { isDir: false }
          }
          if (path === AbsPath.from('/project/game/background/archive/bg.jpg')) {
            return { isDir: false }
          }
          return
        }),
      },
      gameFs: {
        moveFile: vi.fn(async (_sourcePath, targetDirectory) => ({
          echoMode: 'watcher' as const,
          newPath: AbsPath.append(targetDirectory, 'bg (1).jpg'),
        })),
      },
      resourceIndex: {
        getReferencesTo: vi.fn(() => [referencedRecord]),
        listByAssetType: vi.fn(() => []),
        resolveByAbsolutePath: vi.fn(() => ({
          absolutePath: AbsPath.from('/project/game/background/bg.jpg'),
          extension: '.jpg',
          fileName: 'bg.jpg',
          key: createAssetKey('asset', 'background', RelPath.from('bg.jpg')),
        })),
      },
    })
    const service = createPathOperationService(deps)

    const result = await service.perform({
      kind: 'move',
      sourcePath: AbsPath.from('/project/game/background/bg.jpg'),
      target: { type: 'directory', directory: AbsPath.from('/project/game/background/archive') },
    }, async (): Promise<PathOperationConfirmDecision> => 'rewrite')

    expect(result.finalPath).toBe('/project/game/background/archive/bg (1).jpg')
    expect(result.plan.blockedReasons).toEqual([])
    expect(result.plan.rewrites).toEqual([
      expect.objectContaining({
        after: 'changeBg:archive/bg (1).jpg;',
        before: 'changeBg:bg.jpg;',
        filePath: '/project/game/scene/start.txt',
      }),
    ])
    expect(deps.gameFs.moveFile).toHaveBeenCalledWith(
      '/project/game/background/bg.jpg',
      '/project/game/background/archive',
      'bg (1).jpg',
    )
  })

  it('move 确认期间计划目标被占用时会重新 plan 到下一个唯一名称', async () => {
    let firstUniqueTargetChecked = false
    existsMock.mockImplementation(async (path: AbsPath) => {
      if (path === AbsPath.from('/project/game/background/archive/bg.jpg')) {
        return true
      }
      if (path !== AbsPath.from('/project/game/background/archive/bg (1).jpg')) {
        return false
      }
      if (!firstUniqueTargetChecked) {
        firstUniqueTargetChecked = true
        return false
      }
      return true
    })
    const deps = createDeps({
      fileStore: {
        getItemByPath: vi.fn((path: AbsPath) => {
          if (path === AbsPath.from('/project/game/background/bg.jpg')) {
            return { isDir: false }
          }
          return
        }),
      },
      gameFs: {
        moveFile: vi.fn(async (_sourcePath, targetDirectory, targetName = 'bg.jpg') => ({
          echoMode: 'watcher' as const,
          newPath: AbsPath.append(targetDirectory, targetName),
        })),
      },
    })
    const service = createPathOperationService(deps)

    const result = await service.perform({
      kind: 'move',
      sourcePath: AbsPath.from('/project/game/background/bg.jpg'),
      target: { type: 'directory', directory: AbsPath.from('/project/game/background/archive') },
    })

    expect(result.finalPath).toBe('/project/game/background/archive/bg (2).jpg')
    expect(deps.gameFs.moveFile).toHaveBeenCalledWith(
      '/project/game/background/bg.jpg',
      '/project/game/background/archive',
      'bg (2).jpg',
    )
  })

  it('确认后会写入场景补丁并广播 system-refactor 修改事件', async () => {
    const referencedRecord = {
      assetKey: createAssetKey('asset', 'background', RelPath.from('bg.jpg')),
      fieldKey: '__content__',
      sourceKind: 'scene',
      sourcePath: AbsPath.from('/project/game/scene/start.txt'),
      statementId: 1,
    } satisfies AssetReferenceRecord
    const deps = createDeps({
      resourceIndex: {
        getReferencesTo: vi.fn(() => [referencedRecord]),
        listByAssetType: vi.fn(() => []),
        resolveByAbsolutePath: vi.fn(() => ({
          absolutePath: AbsPath.from('/project/game/background/bg.jpg'),
          extension: '.jpg',
          fileName: 'bg.jpg',
          key: createAssetKey('asset', 'background', RelPath.from('bg.jpg')),
        })),
      },
    })
    const service = createPathOperationService(deps)

    await service.perform({
      kind: 'rename',
      sourcePath: AbsPath.from('/project/game/background/bg.jpg'),
      target: { type: 'name', name: 'renamed.jpg' },
    }, async (): Promise<PathOperationConfirmDecision> => 'rewrite')

    expect(deps.gameFs.writeDocumentFile).toHaveBeenCalledOnce()
    const writeCall = vi.mocked(deps.gameFs.writeDocumentFile).mock.calls[0]
    expect(writeCall?.[0]).toBe('/project/game/scene/start.txt')
    expect(new TextDecoder().decode(writeCall?.[1])).toBe('changeBg:renamed.jpg;')
    expect(backupManagerMock.createSystemRefactorBackup).toHaveBeenCalledWith(
      AbsPath.from('/project'),
      RelPath.from('game/scene/start.txt'),
    )
    expect(deps.fileSystemEvents.emit).toHaveBeenCalledWith({
      type: 'file:modified',
      path: '/project/game/scene/start.txt',
      source: 'system-refactor',
    })
  })

  it('系统重写的场景写盘回声会把打开中的编辑器状态同步为新内容', async () => {
    const metadata = createTextMetadata('changeBg:bg.jpg;')
    const applySystemRefactor = vi.fn(() => true)
    const fileSystemEvents = { emit: vi.fn() }
    const deps = createDeps({
      editor: {
        applySystemRefactor,
        peekSceneBuffer: vi.fn(() => ({
          content: 'changeBg:bg.jpg;',
          metadata,
          revision: 'r1',
        })),
        peekSceneRevision: vi.fn(() => 'r1'),
      },
      fileSystemEvents,
      resourceIndex: {
        getReferencesTo: vi.fn(() => [{
          assetKey: createAssetKey('asset', 'background', RelPath.from('bg.jpg')),
          fieldKey: '__content__',
          sourceKind: 'scene',
          sourcePath: AbsPath.from('/project/game/scene/start.txt'),
          statementId: 1,
        } satisfies AssetReferenceRecord]),
        listByAssetType: vi.fn(() => []),
        resolveByAbsolutePath: vi.fn(() => ({
          absolutePath: AbsPath.from('/project/game/background/bg.jpg'),
          extension: '.jpg',
          fileName: 'bg.jpg',
          key: createAssetKey('asset', 'background', RelPath.from('bg.jpg')),
        })),
      },
    })
    const service = createPathOperationService(deps)

    await service.perform({
      kind: 'rename',
      sourcePath: AbsPath.from('/project/game/background/bg.jpg'),
      target: { type: 'name', name: 'renamed.jpg' },
    }, async (): Promise<PathOperationConfirmDecision> => 'rewrite')

    expect(applySystemRefactor).toHaveBeenCalledWith(
      '/project/game/scene/start.txt',
      'changeBg:renamed.jpg;',
      metadata,
      'r1',
    )
    expect(fileSystemEvents.emit).toHaveBeenCalledWith({
      type: 'file:modified',
      path: '/project/game/scene/start.txt',
      source: 'system-refactor',
    })
  })

  it('游戏配置资源引用会按已注册字段重写', async () => {
    const referencedRecord = {
      assetKey: createAssetKey('asset', 'background', RelPath.from('cover.png')),
      fieldKey: 'Title_img',
      sourceKind: 'game-config',
      sourcePath: AbsPath.from('/project/game/config.txt'),
    } satisfies AssetReferenceRecord
    const deps = createDeps({
      gameConfig: {
        getConfig: vi.fn(async () => ({
          entries: [{ key: 'Title_img', value: 'cover.png' }],
          unmanagedLineCount: 0,
        })),
        setConfig: vi.fn(),
      },
      resourceIndex: {
        getReferencesTo: vi.fn(() => [referencedRecord]),
        listByAssetType: vi.fn(() => []),
        resolveByAbsolutePath: vi.fn(() => ({
          absolutePath: AbsPath.from('/project/game/background/cover.png'),
          extension: '.png',
          fileName: 'cover.png',
          key: createAssetKey('asset', 'background', RelPath.from('cover.png')),
        })),
      },
    })
    const service = createPathOperationService(deps)

    await service.perform({
      kind: 'rename',
      sourcePath: AbsPath.from('/project/game/background/cover.png'),
      target: { type: 'name', name: 'cover-next.png' },
    }, async (): Promise<PathOperationConfirmDecision> => 'rewrite')

    expect(deps.gameConfig.setConfig).toHaveBeenCalledWith('/project', {
      entries: [{ key: 'Title_img', value: 'cover-next.png' }],
    })
  })

  it('game-config 基线会把完整配置状态纳入稳定 hash', async () => {
    const referencedRecord = {
      assetKey: createAssetKey('asset', 'background', RelPath.from('cover.png')),
      fieldKey: 'Title_img',
      sourceKind: 'game-config',
      sourcePath: AbsPath.from('/project/game/config.txt'),
    } satisfies AssetReferenceRecord
    const deps = createDeps({
      gameConfig: {
        getConfig: vi.fn()
          .mockResolvedValueOnce({
            entries: [{ key: 'Title_img', value: 'cover.png' }],
            unmanagedLineCount: 0,
          })
          .mockResolvedValueOnce({
            entries: [{ key: 'Title_img', value: 'cover.png' }],
            unmanagedLineCount: 1,
          }),
        setConfig: vi.fn(),
      },
      resourceIndex: {
        getReferencesTo: vi.fn(() => [referencedRecord]),
        listByAssetType: vi.fn(() => []),
        resolveByAbsolutePath: vi.fn(() => ({
          absolutePath: AbsPath.from('/project/game/background/cover.png'),
          extension: '.png',
          fileName: 'cover.png',
          key: createAssetKey('asset', 'background', RelPath.from('cover.png')),
        })),
      },
    })
    const service = createPathOperationService(deps)

    const plan = await service.plan({
      kind: 'rename',
      sourcePath: AbsPath.from('/project/game/background/cover.png'),
      target: { type: 'name', name: 'cover-next.png' },
    })

    expect(plan.rollback.files[0]?.baselineRevision).toMatchObject({
      kind: 'disk-hash',
      hash: expect.stringMatching(/^[0-9a-f]{64}$/),
    })

    await expect(service.apply(plan)).rejects.toMatchObject({ code: 'stale-plan' })
    expect(deps.gameFs.renameFile).not.toHaveBeenCalled()
  })

  it('scene 目标已有历史时不在 plan 阶段阻断，沿用迁移时覆盖目标历史的语义', async () => {
    const deps = createDeps({
      fileStore: {
        getItemByPath: vi.fn((path: AbsPath) =>
          path === AbsPath.from('/project/game/scene/start.txt') ? { isDir: false } : undefined,
        ),
      },
      history: {
        migrateSceneHistory: vi.fn(),
      },
    })
    const service = createPathOperationService(deps)

    const plan = await service.plan({
      kind: 'rename',
      sourcePath: AbsPath.from('/project/game/scene/start.txt'),
      target: { type: 'name', name: 'intro.txt' },
    })

    expect(plan.blockedReasons).toEqual([])

    await service.apply(plan)

    expect(deps.history.migrateSceneHistory).toHaveBeenCalledWith({
      projectPath: '/project',
      oldLogicalPath: 'game/scene/start.txt',
      newLogicalPath: 'game/scene/intro.txt',
    })
  })

  it('scene 历史迁移后发生后续失败时会反向恢复历史目录', async () => {
    const migrateSceneHistory = vi.fn()
    const refreshRegisteredGameSnapshot = vi.fn(async () => {
      throw new Error('refresh failed')
    })
    const deps = createDeps({
      fileStore: {
        getItemByPath: vi.fn((path: AbsPath) =>
          path === AbsPath.from('/project/game/scene/start.txt') ? { isDir: false } : undefined,
        ),
      },
      gameManager: {
        refreshRegisteredGameSnapshot,
      },
      history: {
        migrateSceneHistory,
      },
    })
    const service = createPathOperationService(deps)

    const plan = await service.plan({
      kind: 'rename',
      sourcePath: AbsPath.from('/project/game/scene/start.txt'),
      target: { type: 'name', name: 'intro.txt' },
    })

    await expect(service.apply(plan)).rejects.toThrow('refresh failed')

    expect(migrateSceneHistory).toHaveBeenNthCalledWith(1, {
      projectPath: '/project',
      oldLogicalPath: 'game/scene/start.txt',
      newLogicalPath: 'game/scene/intro.txt',
    })
    expect(migrateSceneHistory).toHaveBeenNthCalledWith(2, {
      projectPath: '/project',
      oldLogicalPath: 'game/scene/intro.txt',
      newLogicalPath: 'game/scene/start.txt',
    })
    expect(deps.fileStore.applyPathMutation).toHaveBeenNthCalledWith(
      1,
      '/project/game/scene/start.txt',
      '/project/game/scene/intro.txt',
    )
    expect(deps.fileStore.applyPathMutation).toHaveBeenNthCalledWith(
      2,
      '/project/game/scene/intro.txt',
      '/project/game/scene/start.txt',
    )
    expect(refreshRegisteredGameSnapshot).toHaveBeenCalledTimes(1)
  })

  it('非 scene 路径不会迁移场景历史或返回迁移 warning', async () => {
    const referencedRecord = {
      assetKey: createAssetKey('asset', 'background', RelPath.from('bg.jpg')),
      fieldKey: '__content__',
      sourceKind: 'scene',
      sourcePath: AbsPath.from('/project/game/scene/start.txt'),
      statementId: 1,
    } satisfies AssetReferenceRecord
    const deps = createDeps({
      history: {
        migrateSceneHistory: vi.fn(async () => {
          throw new Error('history failed')
        }),
      },
      resourceIndex: {
        getReferencesTo: vi.fn(() => [referencedRecord]),
        listByAssetType: vi.fn(() => []),
        resolveByAbsolutePath: vi.fn(() => ({
          absolutePath: AbsPath.from('/project/game/background/bg.jpg'),
          extension: '.jpg',
          fileName: 'bg.jpg',
          key: createAssetKey('asset', 'background', RelPath.from('bg.jpg')),
        })),
      },
    })
    const service = createPathOperationService(deps)

    const result = await service.perform({
      kind: 'rename',
      sourcePath: AbsPath.from('/project/game/background/bg.jpg'),
      target: { type: 'name', name: 'renamed.jpg' },
    }, async (): Promise<PathOperationConfirmDecision> => 'rewrite')

    expect(result.cancelled).toBe(false)
    expect(result.warnings).toEqual([])
    expect(deps.history.migrateSceneHistory).not.toHaveBeenCalled()
  })

  it('目录 rename 会同步重写其子资源引用', async () => {
    const scenePath = AbsPath.from('/project/game/scene/start.txt')
    const directoryPath = AbsPath.from('/project/game/background/old')
    const sourceAssets = [
      {
        absolutePath: AbsPath.from('/project/game/background/old/chapter/bg.jpg'),
        extension: '.jpg',
        fileName: 'bg.jpg',
        key: createAssetKey('asset', 'background', RelPath.from('old/chapter/bg.jpg')),
      },
      {
        absolutePath: AbsPath.from('/project/game/background/old/logo.png'),
        extension: '.png',
        fileName: 'logo.png',
        key: createAssetKey('asset', 'background', RelPath.from('old/logo.png')),
      },
    ]
    const sceneRecords = [
      {
        assetKey: sourceAssets[0]!.key,
        fieldKey: '__content__',
        sourceKind: 'scene',
        sourcePath: scenePath,
        statementId: 1,
      },
      {
        assetKey: sourceAssets[1]!.key,
        fieldKey: '__content__',
        sourceKind: 'scene',
        sourcePath: scenePath,
        statementId: 2,
      },
    ] satisfies AssetReferenceRecord[]
    const deps = createDeps({
      editor: {
        applySystemRefactor: vi.fn(() => true),
        peekSceneBuffer: vi.fn(() => undefined),
        peekSceneRevision: vi.fn(() => undefined),
      },
      gameFs: {
        moveFile: vi.fn(),
        readDocumentFile: vi.fn(async () => new TextEncoder().encode('changeBg:old/chapter/bg.jpg;\nchangeBg:old/logo.png;')),
        renameFile: vi.fn(async (sourcePath, newName) => ({
          echoMode: 'watcher' as const,
          newPath: AbsPath.append(AbsPath.parent(sourcePath), newName),
        })),
        writeDocumentFile: vi.fn(),
      },
      fileStore: {
        getItemByPath: vi.fn((path: AbsPath) =>
          path === directoryPath ? { isDir: true } : undefined,
        ),
      },
      resourceIndex: {
        getReferencesTo: vi.fn((key) => {
          if (RelPath.equals(key.relativePath, RelPath.from('old/chapter/bg.jpg'))) {
            return [sceneRecords[0]!]
          }
          if (RelPath.equals(key.relativePath, RelPath.from('old/logo.png'))) {
            return [sceneRecords[1]!]
          }
          return []
        }),
        listByAssetType: vi.fn((assetType: string) => assetType === 'background' ? sourceAssets : []),
        resolveByAbsolutePath: vi.fn(() => undefined),
      },
    })
    const service = createPathOperationService(deps)

    const plan = await service.plan({
      kind: 'rename',
      sourcePath: directoryPath,
      target: { type: 'name', name: 'new' },
    })

    expect(plan.rewrites).toHaveLength(1)
    expect(plan.rewrites[0]).toMatchObject({
      after: 'changeBg:new/chapter/bg.jpg;\nchangeBg:new/logo.png;',
      before: 'changeBg:old/chapter/bg.jpg;\nchangeBg:old/logo.png;',
      filePath: scenePath,
      referenceCount: 2,
    })
    expect(plan.blockedReasons).toEqual([])
  })

  it('目录 rename 遇到非边界前缀资源时不会切出错误引用路径', async () => {
    const scenePath = AbsPath.from('/project/game/scene/start.txt')
    const directoryPath = AbsPath.from('/project/game/background/old')
    const sourceAsset = {
      absolutePath: AbsPath.from('/project/game/background/old/bg.jpg'),
      extension: '.jpg',
      fileName: 'bg.jpg',
      key: createAssetKey('asset', 'background', RelPath.from('oldish/bg.jpg')),
    }
    const referencedRecord = {
      assetKey: sourceAsset.key,
      fieldKey: '__content__',
      sourceKind: 'scene',
      sourcePath: scenePath,
      statementId: 1,
    } satisfies AssetReferenceRecord
    const deps = createDeps({
      gameFs: {
        readDocumentFile: vi.fn(async () => new TextEncoder().encode('changeBg:oldish/bg.jpg;')),
      },
      fileStore: {
        getItemByPath: vi.fn((path: AbsPath) =>
          path === directoryPath ? { isDir: true } : undefined,
        ),
      },
      resourceIndex: {
        getReferencesTo: vi.fn(() => [referencedRecord]),
        listByAssetType: vi.fn((assetType: string) => assetType === 'background' ? [sourceAsset] : []),
        resolveByAbsolutePath: vi.fn(() => undefined),
      },
    })
    const service = createPathOperationService(deps)

    const plan = await service.plan({
      kind: 'rename',
      sourcePath: directoryPath,
      target: { type: 'name', name: 'new' },
    })

    expect(plan.rewrites).toEqual([])
    expect(plan.blockedReasons).toEqual([])
  })

  it('引用索引指向不存在的语句时生成 unsupported-reference 阻断而不是崩溃', async () => {
    const referencedRecord = {
      assetKey: createAssetKey('asset', 'background', RelPath.from('bg.jpg')),
      fieldKey: '__content__',
      sourceKind: 'scene',
      sourcePath: AbsPath.from('/project/game/scene/start.txt'),
      statementId: 99,
    } satisfies AssetReferenceRecord
    const deps = createDeps({
      resourceIndex: {
        getReferencesTo: vi.fn(() => [referencedRecord]),
        listByAssetType: vi.fn(() => []),
        resolveByAbsolutePath: vi.fn(() => ({
          absolutePath: AbsPath.from('/project/game/background/bg.jpg'),
          extension: '.jpg',
          fileName: 'bg.jpg',
          key: createAssetKey('asset', 'background', RelPath.from('bg.jpg')),
        })),
      },
    })
    const service = createPathOperationService(deps)

    const plan = await service.plan({
      kind: 'rename',
      sourcePath: AbsPath.from('/project/game/background/bg.jpg'),
      target: { type: 'name', name: 'renamed.jpg' },
    })

    expect(plan.blockedReasons).toContainEqual(expect.objectContaining({
      kind: 'unsupported-reference',
      filePath: '/project/game/scene/start.txt',
    }))
  })

  it('读取 scene 文本时通过 gameFs 依赖而不是直接读取底层 FS', async () => {
    const readDocumentFile = vi.fn(async () => new TextEncoder().encode('changeBg:bg.jpg;'))
    const deps = createDeps({
      gameFs: {
        readDocumentFile,
      },
      resourceIndex: {
        getReferencesTo: vi.fn(() => [{
          assetKey: createAssetKey('asset', 'background', RelPath.from('bg.jpg')),
          fieldKey: '__content__',
          sourceKind: 'scene',
          sourcePath: AbsPath.from('/project/game/scene/start.txt'),
          statementId: 1,
        } satisfies AssetReferenceRecord]),
        listByAssetType: vi.fn(() => []),
        resolveByAbsolutePath: vi.fn(() => ({
          absolutePath: AbsPath.from('/project/game/background/bg.jpg'),
          extension: '.jpg',
          fileName: 'bg.jpg',
          key: createAssetKey('asset', 'background', RelPath.from('bg.jpg')),
        })),
      },
    })
    const service = createPathOperationService(deps)

    const plan = await service.plan({
      kind: 'rename',
      sourcePath: AbsPath.from('/project/game/background/bg.jpg'),
      target: { type: 'name', name: 'renamed.jpg' },
    })

    expect(plan.rewrites).toHaveLength(1)
    expect(readDocumentFile).toHaveBeenCalledWith('/project/game/scene/start.txt')
  })

  it('编辑器 buffer 回写失败时会回滚已落盘补丁和路径副作用', async () => {
    const metadata = createTextMetadata('changeBg:bg.jpg;')
    const referencedRecord = {
      assetKey: createAssetKey('asset', 'background', RelPath.from('bg.jpg')),
      fieldKey: '__content__',
      sourceKind: 'scene',
      sourcePath: AbsPath.from('/project/game/scene/start.txt'),
      statementId: 1,
    } satisfies AssetReferenceRecord
    const writeDocumentFile = vi.fn()
    const renameFile = vi.fn(async (sourcePath: AbsPath, newName: string) => ({
      echoMode: 'watcher' as const,
      newPath: AbsPath.append(AbsPath.parent(sourcePath), newName),
    }))
    const deps = createDeps({
      editor: {
        applySystemRefactor: vi.fn(() => false),
        peekSceneBuffer: vi.fn(() => ({
          content: 'changeBg:bg.jpg;',
          metadata,
          revision: 'r1',
        })),
        peekSceneRevision: vi.fn(() => 'r1'),
      },
      gameFs: {
        moveFile: vi.fn(),
        renameFile,
        writeDocumentFile,
      },
      resourceIndex: {
        getReferencesTo: vi.fn(() => [referencedRecord]),
        listByAssetType: vi.fn(() => []),
        resolveByAbsolutePath: vi.fn(() => ({
          absolutePath: AbsPath.from('/project/game/background/bg.jpg'),
          extension: '.jpg',
          fileName: 'bg.jpg',
          key: createAssetKey('asset', 'background', RelPath.from('bg.jpg')),
        })),
      },
    })
    const service = createPathOperationService(deps)

    const plan = await service.plan({
      kind: 'rename',
      sourcePath: AbsPath.from('/project/game/background/bg.jpg'),
      target: { type: 'name', name: 'renamed.jpg' },
    })

    await expect(service.apply(plan)).rejects.toMatchObject({ code: 'stale-plan' })

    expect(writeDocumentFile).toHaveBeenCalledTimes(2)
    expect(new TextDecoder().decode(writeDocumentFile.mock.calls[0]?.[1])).toBe('changeBg:renamed.jpg;')
    expect(new TextDecoder().decode(writeDocumentFile.mock.calls[1]?.[1])).toBe('changeBg:bg.jpg;')
    expect(renameFile).toHaveBeenLastCalledWith('/project/game/background/renamed.jpg', 'bg.jpg')
  })

  it('move 回滚唯一目标名时会显式恢复源文件名', async () => {
    const metadata = createTextMetadata('changeBg:bg.jpg;')
    const referencedRecord = {
      assetKey: createAssetKey('asset', 'background', RelPath.from('bg.jpg')),
      fieldKey: '__content__',
      sourceKind: 'scene',
      sourcePath: AbsPath.from('/project/game/scene/start.txt'),
      statementId: 1,
    } satisfies AssetReferenceRecord
    existsMock.mockImplementation(async (path: AbsPath) =>
      path === AbsPath.from('/project/game/background/archive/bg.jpg'),
    )
    const moveFile = vi.fn(async (sourcePath: AbsPath, targetDirectory: AbsPath, targetName?: string) => ({
      echoMode: 'watcher' as const,
      newPath: AbsPath.append(targetDirectory, targetName ?? AbsPath.basename(sourcePath)),
    }))
    const deps = createDeps({
      editor: {
        applySystemRefactor: vi.fn(() => false),
        peekSceneBuffer: vi.fn(() => ({
          content: 'changeBg:bg.jpg;',
          metadata,
          revision: 'r1',
        })),
        peekSceneRevision: vi.fn(() => 'r1'),
      },
      fileStore: {
        getItemByPath: vi.fn((path: AbsPath) => {
          if (path === AbsPath.from('/project/game/background/bg.jpg')) {
            return { isDir: false }
          }
          if (path === AbsPath.from('/project/game/background/archive/bg.jpg')) {
            return { isDir: false }
          }
          return
        }),
      },
      gameFs: {
        moveFile,
        readDocumentFile: vi.fn(async () => new TextEncoder().encode('changeBg:bg.jpg;')),
        writeDocumentFile: vi.fn(),
      },
      resourceIndex: {
        getReferencesTo: vi.fn(() => [referencedRecord]),
        listByAssetType: vi.fn(() => []),
        resolveByAbsolutePath: vi.fn(() => ({
          absolutePath: AbsPath.from('/project/game/background/bg.jpg'),
          extension: '.jpg',
          fileName: 'bg.jpg',
          key: createAssetKey('asset', 'background', RelPath.from('bg.jpg')),
        })),
      },
    })
    const service = createPathOperationService(deps)

    const plan = await service.plan({
      kind: 'move',
      sourcePath: AbsPath.from('/project/game/background/bg.jpg'),
      target: { type: 'directory', directory: AbsPath.from('/project/game/background/archive') },
    })

    await expect(service.apply(plan)).rejects.toMatchObject({ code: 'stale-plan' })

    expect(moveFile).toHaveBeenNthCalledWith(
      1,
      '/project/game/background/bg.jpg',
      '/project/game/background/archive',
      'bg (1).jpg',
    )
    expect(moveFile).toHaveBeenNthCalledWith(
      2,
      '/project/game/background/archive/bg (1).jpg',
      '/project/game/background',
      'bg.jpg',
    )
  })

  it('回滚编辑器 buffer 重写时使用当前 revision', async () => {
    const metadata = createTextMetadata('changeBg:bg.jpg;')
    const referencedRecord = {
      assetKey: createAssetKey('asset', 'background', RelPath.from('bg.jpg')),
      fieldKey: '__content__',
      sourceKind: 'scene',
      sourcePath: AbsPath.from('/project/game/scene/start.txt'),
      statementId: 1,
    } satisfies AssetReferenceRecord
    const applySystemRefactor = vi.fn((
      _path: AbsPath,
      _content: string,
      _metadata: TextMetadata,
      expectedRevision: number | string,
    ) => expectedRevision === 'r1' || expectedRevision === 'r2')
    const deps = createDeps({
      editor: {
        applySystemRefactor,
        peekSceneBuffer: vi.fn(() => ({
          content: 'changeBg:bg.jpg;',
          metadata,
          revision: 'r1',
        })),
        peekSceneRevision: vi.fn()
          .mockReturnValueOnce('r1')
          .mockReturnValueOnce('r2'),
      },
      fileStore: {
        getItemByPath: vi.fn((path: AbsPath) =>
          path === AbsPath.from('/project/game/background/bg.jpg') ? { isDir: false } : undefined,
        ),
      },
      gameManager: {
        refreshRegisteredGameSnapshot: vi.fn(async () => {
          throw new Error('refresh failed')
        }),
      },
      resourceIndex: {
        getReferencesTo: vi.fn(() => [referencedRecord]),
        listByAssetType: vi.fn(() => []),
        resolveByAbsolutePath: vi.fn(() => ({
          absolutePath: AbsPath.from('/project/game/background/bg.jpg'),
          extension: '.jpg',
          fileName: 'bg.jpg',
          key: createAssetKey('asset', 'background', RelPath.from('bg.jpg')),
        })),
      },
    })
    const service = createPathOperationService(deps)

    const plan = await service.plan({
      kind: 'rename',
      sourcePath: AbsPath.from('/project/game/background/bg.jpg'),
      target: { type: 'name', name: 'renamed.jpg' },
    })

    await expect(service.apply(plan)).rejects.toThrow('refresh failed')

    expect(applySystemRefactor).toHaveBeenNthCalledWith(
      2,
      '/project/game/scene/start.txt',
      'changeBg:bg.jpg;',
      metadata,
      'r2',
    )
  })

  it('本地 mutation 失败时不回滚已成功的 FS 副作用，并主动失效路径缓存', async () => {
    const invalidatePathOperationCaches = vi.fn()
    const renameFile = vi.fn(async (sourcePath: AbsPath, newName: string) => ({
      echoMode: 'watcher' as const,
      newPath: AbsPath.append(AbsPath.parent(sourcePath), newName),
    }))
    const deps = createDeps({
      fileStore: {
        applyPathMutation: vi.fn(async () => {
          throw new Error('mutation failed')
        }),
        getItemByPath: vi.fn((path: AbsPath) =>
          path === AbsPath.from('/project/game/background/bg.jpg') ? { isDir: false } : undefined,
        ),
        invalidatePathOperationCaches,
      },
      gameFs: {
        moveFile: vi.fn(),
        renameFile,
        writeDocumentFile: vi.fn(),
      },
    })
    const service = createPathOperationService(deps)

    await expect(service.perform({
      kind: 'rename',
      sourcePath: AbsPath.from('/project/game/background/bg.jpg'),
      target: { type: 'name', name: 'renamed.jpg' },
    })).rejects.toThrow('mutation failed')

    expect(renameFile).toHaveBeenCalledTimes(1)
    expect(invalidatePathOperationCaches).toHaveBeenCalledWith(
      '/project/game/background/bg.jpg',
      '/project/game/background/renamed.jpg',
    )
    expect(deps.fileSystemEvents.emit).toHaveBeenCalledWith({
      type: 'directory:modified',
      path: '/project/game/background',
      source: 'system-refactor',
    })
    expect(deps.pathOperationRegistry.release).toHaveBeenCalledWith(1)
  })

  it('synthetic 通道在 apply 出口释放 pending 记录', async () => {
    const deps = createDeps({
      gameFs: {
        moveFile: vi.fn(),
        renameFile: vi.fn(async (sourcePath, newName) => ({
          echoMode: 'synthetic' as const,
          newPath: AbsPath.append(AbsPath.parent(sourcePath), newName),
        })),
        writeDocumentFile: vi.fn(),
      },
    })
    const service = createPathOperationService(deps)

    await service.perform({
      kind: 'rename',
      sourcePath: AbsPath.from('/project/game/background/bg.jpg'),
      target: { type: 'name', name: 'renamed.jpg' },
    })

    expect(deps.pathOperationRegistry.updateChannel).toHaveBeenCalledWith(1, {
      echoMode: 'synthetic',
      expectedEchoes: 0,
    })
    expect(deps.pathOperationRegistry.markSettled).toHaveBeenCalledWith(1)
    expect(deps.pathOperationRegistry.release).toHaveBeenCalledWith(1)
  })

  it.each([
    {
      firstSourcePath: '/project/game/scene/chapter/start.txt',
      firstTargetDirectory: '/project/game/scene',
      secondSourcePath: '/project/game/scene/start.txt',
      secondTargetDirectory: '/project/game/scene/chapter',
    },
    {
      firstSourcePath: '/project/game/scene/start.txt',
      firstTargetDirectory: '/project/game/scene/chapter',
      secondSourcePath: '/project/game/scene/chapter/start.txt',
      secondTargetDirectory: '/project/game/scene',
    },
  ])('连续反向 move 不会被上一轮 watcher pending 阻断', async ({
    firstSourcePath,
    firstTargetDirectory,
    secondSourcePath,
    secondTargetDirectory,
  }) => {
    const pendingOperations = new Map<number, { blocksConflicts: boolean, sourcePath: AbsPath, targetPath: AbsPath }>()
    let nextPendingId = 1
    const hasOverlap = vi.fn((paths: readonly AbsPath[]) =>
      [...pendingOperations.values()].some(pending =>
        pending.blocksConflicts
        && paths.some(path =>
          path === pending.sourcePath
          || path === pending.targetPath
          || path.startsWith(`${pending.sourcePath}/`)
          || path.startsWith(`${pending.targetPath}/`),
        ),
      ),
    )
    const register = vi.fn(({ sourcePath, targetPath }: { sourcePath: AbsPath, targetPath: AbsPath }) => {
      const id = nextPendingId
      nextPendingId += 1
      pendingOperations.set(id, {
        blocksConflicts: true,
        sourcePath,
        targetPath,
      })
      return id
    })
    const markSettled = vi.fn((id: number) => {
      const pending = pendingOperations.get(id)
      if (!pending) {
        return false
      }

      pending.blocksConflicts = false
      return true
    })
    const filePaths = new Set([
      firstSourcePath,
      '/project/game/scene/chapter',
    ])
    const deps = createDeps({
      fileStore: {
        applyPathMutation: vi.fn((oldPath: AbsPath, newPath: AbsPath) => {
          filePaths.delete(oldPath)
          filePaths.add(newPath)
        }),
        getItemByPath: vi.fn((path: AbsPath) => {
          if (filePaths.has(path)) {
            return { isDir: path === AbsPath.from('/project/game/scene/chapter') }
          }
          return
        }),
      },
      gameFs: {
        moveFile: vi.fn(async (sourcePath, targetDirectory) => ({
          echoMode: 'watcher' as const,
          newPath: AbsPath.append(targetDirectory, AbsPath.basename(sourcePath)),
        })),
      },
      pathOperationRegistry: {
        hasOverlap,
        markSettled,
        register,
      },
    })
    const service = createPathOperationService(deps)

    await service.perform({
      kind: 'move',
      sourcePath: AbsPath.from(firstSourcePath),
      target: { type: 'directory', directory: AbsPath.from(firstTargetDirectory) },
    })
    await service.perform({
      kind: 'move',
      sourcePath: AbsPath.from(secondSourcePath),
      target: { type: 'directory', directory: AbsPath.from(secondTargetDirectory) },
    })

    expect(deps.gameFs.moveFile).toHaveBeenCalledTimes(2)
    expect(markSettled).toHaveBeenCalledTimes(2)
  })
})
