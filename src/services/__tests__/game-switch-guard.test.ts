import '~/__tests__/setup'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createTestEngine, createTestGame } from '~/__tests__/factories'
import { AbsPath } from '~/domain/path'
import { engineSwitch } from '~/services/engine-switch'
import { templateSwitch } from '~/services/template-switch'

import type { ProjectConfig } from '~/types/project-config'

const {
  assertEngineEditorCompatibleMock,
  cleanTemplateUpperMock,
  dbEngineGetMock,
  dbGameUpdateMock,
  dbTemplateFilterFirstMock,
  isEngineUsableMock,
  isTemplateDirtyMock,
  readProjectConfigMock,
  refetchTemplatesMock,
  refreshRegisteredGameSnapshotMock,
  refreshTemplateOverlayMock,
  syncIfCurrentGameMock,
  updateSiteEngineMock,
  updateSiteTemplateMock,
  writeProjectConfigMock,
} = vi.hoisted(() => ({
  assertEngineEditorCompatibleMock: vi.fn(),
  cleanTemplateUpperMock: vi.fn(),
  dbEngineGetMock: vi.fn(),
  dbGameUpdateMock: vi.fn(),
  dbTemplateFilterFirstMock: vi.fn(),
  isEngineUsableMock: vi.fn(),
  isTemplateDirtyMock: vi.fn(),
  readProjectConfigMock: vi.fn(),
  refetchTemplatesMock: vi.fn(),
  refreshRegisteredGameSnapshotMock: vi.fn(),
  refreshTemplateOverlayMock: vi.fn(),
  syncIfCurrentGameMock: vi.fn(),
  updateSiteEngineMock: vi.fn(),
  updateSiteTemplateMock: vi.fn(),
  writeProjectConfigMock: vi.fn(),
}))

vi.mock('@tauri-apps/plugin-log', () => ({
  debug: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  attachConsole: vi.fn(),
}))

vi.mock('~/commands/project-config', () => ({
  projectConfigCmds: {
    readProjectConfig: readProjectConfigMock,
    writeProjectConfig: writeProjectConfigMock,
  },
}))

vi.mock('~/commands/server', () => ({
  serverCmds: {
    updateSiteEngine: updateSiteEngineMock,
    updateSiteTemplate: updateSiteTemplateMock,
  },
}))

vi.mock('~/commands/vfs', () => ({
  vfsCmds: {
    cleanTemplateUpper: cleanTemplateUpperMock,
    isTemplateDirty: isTemplateDirtyMock,
  },
}))

vi.mock('~/database/db', () => ({
  db: {
    engines: { get: dbEngineGetMock },
    games: { update: dbGameUpdateMock },
    templates: {
      filter: () => ({
        first: dbTemplateFilterFirstMock,
      }),
    },
  },
}))

vi.mock('~/services/debug-commander', () => ({
  debugCommander: {
    refetchTemplates: refetchTemplatesMock,
  },
}))

vi.mock('~/services/engine-manager', () => ({
  assertEngineEditorCompatible: assertEngineEditorCompatibleMock,
  isEngineUsable: isEngineUsableMock,
}))

vi.mock('~/services/game-manager', () => ({
  gameManager: {
    refreshRegisteredGameSnapshot: refreshRegisteredGameSnapshotMock,
  },
}))

vi.mock('~/stores/editor', () => ({
  useEditorStore: () => ({
    hasUnsavedDocumentsUnder: () => false,
  }),
}))

vi.mock('~/stores/file', () => ({
  useFileStore: () => ({
    refreshTemplateOverlay: refreshTemplateOverlayMock,
  }),
}))

vi.mock('~/stores/preview-session', () => ({
  usePreviewSessionStore: () => ({
    syncIfCurrentGame: syncIfCurrentGameMock,
  }),
}))

vi.mock('~/stores/tabs', () => ({
  useTabsStore: () => ({
    tabs: [],
    closeTab: vi.fn(),
    findTabIndex: () => -1,
  }),
}))

const OLD_CONFIG: ProjectConfig = {
  version: 1,
  engine: { id: 'open-webgal.webgal', version: '4.5.0' },
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

/**
 * 引擎切换与模板切换改写的都是同一份 project.wgcp 与模板 upper，
 * 守卫必须跨这两个服务生效，而不是各自一把锁。
 */
describe('引擎切换与模板切换的互斥守卫', () => {
  const binding = { kind: 'standalone', name: 'Custom' } as const
  const gamePath = AbsPath.from('/games/demo')

  function createSwitchFixture() {
    dbEngineGetMock.mockResolvedValue(
      createTestEngine({ id: 'engine-old', path: AbsPath.from('/engines/old') }),
    )

    return {
      game: createTestGame({ id: 'game-1', engineId: 'engine-old', path: gamePath }),
      newEngine: createTestEngine({
        id: 'engine-new',
        engineId: 'open-webgal.webgal',
        path: AbsPath.from('/engines/new'),
        version: '4.6.0',
      }),
    }
  }

  beforeEach(() => {
    vi.resetAllMocks()

    cleanTemplateUpperMock.mockResolvedValue(undefined)
    dbGameUpdateMock.mockResolvedValue(undefined)
    dbTemplateFilterFirstMock.mockResolvedValue(undefined)
    isEngineUsableMock.mockReturnValue(true)
    isTemplateDirtyMock.mockResolvedValue(false)
    readProjectConfigMock.mockResolvedValue(OLD_CONFIG)
    refetchTemplatesMock.mockResolvedValue(undefined)
    refreshRegisteredGameSnapshotMock.mockResolvedValue(undefined)
    refreshTemplateOverlayMock.mockResolvedValue(undefined)
    syncIfCurrentGameMock.mockResolvedValue(undefined)
    updateSiteEngineMock.mockResolvedValue(undefined)
    updateSiteTemplateMock.mockResolvedValue(undefined)
    writeProjectConfigMock.mockResolvedValue(undefined)
  })

  it('引擎切换进行中时，同一游戏的模板切换被拒绝且不产生任何写入', async () => {
    const { game, newEngine } = createSwitchFixture()
    const readConfig = createDeferred<ProjectConfig>()
    readProjectConfigMock.mockReturnValueOnce(readConfig.promise)

    const switching = engineSwitch.switchEngine(game, newEngine)

    await expect(templateSwitch.switchTemplate(game, binding)).rejects.toMatchObject({
      code: 'IO_ERROR',
      details: { reason: 'GAME_SWITCH_IN_FLIGHT' },
    })
    expect(writeProjectConfigMock).not.toHaveBeenCalled()
    expect(dbGameUpdateMock).not.toHaveBeenCalled()
    expect(cleanTemplateUpperMock).not.toHaveBeenCalled()
    expect(updateSiteTemplateMock).not.toHaveBeenCalled()

    readConfig.resolve(OLD_CONFIG)
    await expect(switching).resolves.toBeUndefined()

    // 引擎切换结束后守卫释放，同一游戏可以继续切换模板
    await expect(templateSwitch.switchTemplate(game, binding)).resolves.toBeUndefined()
    expect(writeProjectConfigMock).toHaveBeenLastCalledWith(gamePath, {
      ...OLD_CONFIG,
      template: binding,
    })
  })

  it('模板切换进行中时，同一游戏的再次切换模板与切换引擎都被拒绝', async () => {
    const { game, newEngine } = createSwitchFixture()
    const readConfig = createDeferred<ProjectConfig>()
    readProjectConfigMock.mockReturnValueOnce(readConfig.promise)

    const switching = templateSwitch.switchTemplate(game, binding)

    await expect(templateSwitch.switchTemplate(game, binding)).rejects.toMatchObject({
      details: { reason: 'GAME_SWITCH_IN_FLIGHT' },
    })
    await expect(engineSwitch.switchEngine(game, newEngine)).rejects.toMatchObject({
      details: { reason: 'GAME_SWITCH_IN_FLIGHT' },
    })
    expect(writeProjectConfigMock).not.toHaveBeenCalled()
    expect(dbGameUpdateMock).not.toHaveBeenCalled()
    expect(cleanTemplateUpperMock).not.toHaveBeenCalled()
    expect(updateSiteEngineMock).not.toHaveBeenCalled()

    readConfig.resolve(OLD_CONFIG)
    await expect(switching).resolves.toBeUndefined()
    expect(writeProjectConfigMock).toHaveBeenCalledWith(gamePath, {
      ...OLD_CONFIG,
      template: binding,
    })
  })

  it('引擎切换失败回滚后守卫会释放，同一游戏仍可切换模板', async () => {
    const { game, newEngine } = createSwitchFixture()
    dbGameUpdateMock.mockRejectedValueOnce(new Error('db down'))

    await expect(engineSwitch.switchEngine(game, newEngine)).rejects.toThrow('db down')

    await expect(templateSwitch.switchTemplate(game, binding)).resolves.toBeUndefined()
    expect(writeProjectConfigMock).toHaveBeenLastCalledWith(gamePath, {
      ...OLD_CONFIG,
      template: binding,
    })
  })
})
