import '~/__tests__/setup'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createTestEngine, createTestGame } from '~/__tests__/factories'
import { engineSwitch } from '~/services/engine-switch'
import { AppError } from '~/types/errors'

import type { ProjectConfig } from '~/types/project-config'

const {
  cleanTemplateUpperMock,
  dbEngineGetMock,
  dbGameUpdateMock,
  evaluateTemplateStrategyMock,
  notifyTemplateChangedMock,
  readProjectConfigMock,
  refreshIfCurrentGameMock,
  refreshRegisteredGameSnapshotMock,
  resolveTemplatePathMock,
  syncIfCurrentGameMock,
  updateSiteEngineMock,
  updateSiteTemplateMock,
  writeProjectConfigMock,
} = vi.hoisted(() => ({
  cleanTemplateUpperMock: vi.fn(),
  dbEngineGetMock: vi.fn(),
  dbGameUpdateMock: vi.fn(),
  evaluateTemplateStrategyMock: vi.fn(),
  notifyTemplateChangedMock: vi.fn(),
  readProjectConfigMock: vi.fn(),
  refreshIfCurrentGameMock: vi.fn(),
  refreshRegisteredGameSnapshotMock: vi.fn(),
  resolveTemplatePathMock: vi.fn(),
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
  },
}))

vi.mock('~/database/db', () => ({
  db: {
    engines: { get: dbEngineGetMock },
    games: { update: dbGameUpdateMock },
  },
}))

vi.mock('~/services/game-manager', () => ({
  gameManager: {
    refreshRegisteredGameSnapshot: refreshRegisteredGameSnapshotMock,
  },
}))

vi.mock('~/services/template-switch', () => ({
  templateSwitch: {
    evaluateTemplateStrategy: evaluateTemplateStrategyMock,
    resolveTemplatePath: resolveTemplatePathMock,
    notifyTemplateChanged: notifyTemplateChangedMock,
  },
}))

vi.mock('~/stores/preview-session', () => ({
  usePreviewSessionStore: () => ({
    refreshIfCurrentGame: refreshIfCurrentGameMock,
    syncIfCurrentGame: syncIfCurrentGameMock,
  }),
}))

const OLD_CONFIG: ProjectConfig = {
  version: 1,
  engine: { id: 'open-webgal.webgal', version: '4.5.0' },
}

describe('engineSwitch.switchEngine', () => {
  beforeEach(() => {
    cleanTemplateUpperMock.mockReset()
    dbEngineGetMock.mockReset()
    dbGameUpdateMock.mockReset()
    evaluateTemplateStrategyMock.mockReset()
    notifyTemplateChangedMock.mockReset()
    readProjectConfigMock.mockReset()
    refreshIfCurrentGameMock.mockReset()
    refreshRegisteredGameSnapshotMock.mockReset()
    resolveTemplatePathMock.mockReset()
    syncIfCurrentGameMock.mockReset()
    updateSiteEngineMock.mockReset()
    updateSiteTemplateMock.mockReset()
    writeProjectConfigMock.mockReset()

    readProjectConfigMock.mockResolvedValue(OLD_CONFIG)
    evaluateTemplateStrategyMock.mockResolvedValue('clean')
    resolveTemplatePathMock.mockResolvedValue('/engines/old/game/template')
    refreshRegisteredGameSnapshotMock.mockResolvedValue(undefined)
    notifyTemplateChangedMock.mockResolvedValue(undefined)
    cleanTemplateUpperMock.mockResolvedValue(undefined)
    updateSiteEngineMock.mockResolvedValue(undefined)
    updateSiteTemplateMock.mockResolvedValue(undefined)
    writeProjectConfigMock.mockResolvedValue(undefined)
    dbGameUpdateMock.mockResolvedValue(undefined)
  })

  it('在自带引擎项目上拒绝切换', async () => {
    const game = createTestGame({ engineId: undefined })
    const newEngine = createTestEngine({ id: 'engine-new', path: '/engines/new' })

    await expect(engineSwitch.switchEngine(game, newEngine)).rejects.toBeInstanceOf(AppError)
    expect(writeProjectConfigMock).not.toHaveBeenCalled()
  })

  it('在旧引擎记录缺失时直接拒绝，不产生任何副作用', async () => {
    dbEngineGetMock.mockResolvedValue(undefined)
    const game = createTestGame({ id: 'game-1', engineId: 'engine-old', path: '/games/demo' })
    const newEngine = createTestEngine({ id: 'engine-new', path: '/engines/new' })

    await expect(engineSwitch.switchEngine(game, newEngine)).rejects.toThrowError(/当前引擎记录缺失/)
    expect(readProjectConfigMock).not.toHaveBeenCalled()
    expect(writeProjectConfigMock).not.toHaveBeenCalled()
    expect(dbGameUpdateMock).not.toHaveBeenCalled()
    expect(updateSiteEngineMock).not.toHaveBeenCalled()
  })

  it('clean 模板时按顺序更新 config / DB / site，并刷新预览', async () => {
    const oldEngine = createTestEngine({ id: 'engine-old', path: '/engines/old' })
    const newEngine = createTestEngine({
      id: 'engine-new',
      path: '/engines/new',
      engineId: 'open-webgal.webgal',
      version: '4.6.0',
    })
    dbEngineGetMock.mockResolvedValue(oldEngine)
    resolveTemplatePathMock
      .mockResolvedValueOnce('/engines/old/game/template')
      .mockResolvedValueOnce('/engines/new/game/template')

    const game = createTestGame({ id: 'game-1', engineId: 'engine-old', path: '/games/demo' })

    await engineSwitch.switchEngine(game, newEngine)

    expect(writeProjectConfigMock).toHaveBeenCalledWith('/games/demo', expect.objectContaining({
      engine: { id: 'open-webgal.webgal', version: '4.6.0' },
    }))
    expect(dbGameUpdateMock).toHaveBeenCalledWith('game-1', { engineId: 'engine-new' })
    expect(updateSiteEngineMock).toHaveBeenCalledWith('/games/demo', '/engines/new')
    expect(updateSiteTemplateMock).toHaveBeenCalledWith('/games/demo', '/engines/new/game/template')
    expect(cleanTemplateUpperMock).not.toHaveBeenCalled()
    expect(refreshIfCurrentGameMock).not.toHaveBeenCalled()
    expect(syncIfCurrentGameMock).toHaveBeenCalledWith({
      engineId: 'engine-new',
      path: '/games/demo',
    })
  })

  it('dirty 模板缺少决策时拒绝，不产生副作用', async () => {
    const oldEngine = createTestEngine({ id: 'engine-old', path: '/engines/old' })
    dbEngineGetMock.mockResolvedValue(oldEngine)
    evaluateTemplateStrategyMock.mockResolvedValue('dirty')
    const game = createTestGame({ id: 'game-1', engineId: 'engine-old', path: '/games/demo' })
    const newEngine = createTestEngine({ id: 'engine-new', path: '/engines/new' })

    await expect(engineSwitch.switchEngine(game, newEngine)).rejects.toMatchObject({
      details: { reason: 'TEMPLATE_DIRTY_NEEDS_DECISION' },
    })
    expect(writeProjectConfigMock).not.toHaveBeenCalled()
    expect(dbGameUpdateMock).not.toHaveBeenCalled()
  })

  it('discard 决策会清理模板 upper 并切换到新引擎模板', async () => {
    const oldEngine = createTestEngine({ id: 'engine-old', path: '/engines/old' })
    const newEngine = createTestEngine({ id: 'engine-new', path: '/engines/new' })
    dbEngineGetMock.mockResolvedValue(oldEngine)
    evaluateTemplateStrategyMock.mockResolvedValue('dirty')
    resolveTemplatePathMock
      .mockResolvedValueOnce('/engines/old/game/template')
      .mockResolvedValueOnce('/engines/new/game/template')

    const game = createTestGame({ id: 'game-1', engineId: 'engine-old', path: '/games/demo' })

    await engineSwitch.switchEngine(game, newEngine, { templateDecision: 'discard' })

    expect(cleanTemplateUpperMock).toHaveBeenCalledWith('/games/demo')
    expect(updateSiteTemplateMock).toHaveBeenCalledWith('/games/demo', '/engines/new/game/template')
  })

  describe('回滚', () => {
    function setupBaseSwitch() {
      const oldEngine = createTestEngine({ id: 'engine-old', path: '/engines/old' })
      const newEngine = createTestEngine({
        id: 'engine-new',
        path: '/engines/new',
        engineId: 'open-webgal.webgal',
        version: '4.6.0',
      })
      dbEngineGetMock.mockResolvedValue(oldEngine)
      resolveTemplatePathMock
        .mockResolvedValueOnce('/engines/old/game/template')
        .mockResolvedValueOnce('/engines/new/game/template')
      const game = createTestGame({ id: 'game-1', engineId: 'engine-old', path: '/games/demo' })

      return { game, newEngine }
    }

    it('步骤 1（写 config）失败时不更新 DB / site', async () => {
      const { game, newEngine } = setupBaseSwitch()
      writeProjectConfigMock.mockRejectedValueOnce(new Error('boom'))

      await expect(engineSwitch.switchEngine(game, newEngine)).rejects.toThrow('boom')
      expect(dbGameUpdateMock).not.toHaveBeenCalled()
      expect(updateSiteEngineMock).not.toHaveBeenCalled()
    })

    it('步骤 2（DB 更新）失败时回滚 config', async () => {
      const { game, newEngine } = setupBaseSwitch()
      dbGameUpdateMock.mockRejectedValueOnce(new Error('db down'))

      await expect(engineSwitch.switchEngine(game, newEngine)).rejects.toThrow('db down')

      expect(writeProjectConfigMock).toHaveBeenCalledTimes(2)
      expect(writeProjectConfigMock).toHaveBeenLastCalledWith('/games/demo', OLD_CONFIG)
      expect(updateSiteEngineMock).not.toHaveBeenCalled()
    })

    it('步骤 3（updateSiteEngine）失败时回滚 DB 与 config', async () => {
      const { game, newEngine } = setupBaseSwitch()
      updateSiteEngineMock.mockRejectedValueOnce(new Error('site down'))

      await expect(engineSwitch.switchEngine(game, newEngine)).rejects.toThrow('site down')

      expect(dbGameUpdateMock).toHaveBeenNthCalledWith(1, 'game-1', { engineId: 'engine-new' })
      expect(dbGameUpdateMock).toHaveBeenNthCalledWith(2, 'game-1', { engineId: 'engine-old' })
      expect(writeProjectConfigMock).toHaveBeenLastCalledWith('/games/demo', OLD_CONFIG)
    })

    it('步骤 4（updateSiteTemplate）失败时回滚 site engine_path 与 DB / config，且不清理模板', async () => {
      const { game, newEngine } = setupBaseSwitch()
      evaluateTemplateStrategyMock.mockResolvedValue('dirty')
      updateSiteTemplateMock.mockRejectedValueOnce(new Error('template fail'))

      await expect(
        engineSwitch.switchEngine(game, newEngine, { templateDecision: 'discard' }),
      ).rejects.toThrow('template fail')

      // updateSiteTemplate 抛错时 siteTemplateUpdated 仍为 false，不需要再次回滚 template_path
      expect(updateSiteTemplateMock).toHaveBeenCalledTimes(1)
      expect(updateSiteEngineMock).toHaveBeenNthCalledWith(1, '/games/demo', '/engines/new')
      expect(updateSiteEngineMock).toHaveBeenNthCalledWith(2, '/games/demo', '/engines/old')
      expect(writeProjectConfigMock).toHaveBeenLastCalledWith('/games/demo', OLD_CONFIG)
      // 模板清理是不可逆操作，必须排在所有可回滚步骤之后；此处不应被触发
      expect(cleanTemplateUpperMock).not.toHaveBeenCalled()
    })

    it('步骤 5（cleanTemplateUpper）失败时不会回滚此前已提交的切换步骤', async () => {
      const { game, newEngine } = setupBaseSwitch()
      evaluateTemplateStrategyMock.mockResolvedValue('dirty')
      cleanTemplateUpperMock.mockRejectedValueOnce(new Error('clean failed'))

      await expect(
        engineSwitch.switchEngine(game, newEngine, { templateDecision: 'discard' }),
      ).rejects.toThrow('clean failed')

      expect(writeProjectConfigMock).toHaveBeenCalledTimes(1)
      expect(dbGameUpdateMock).toHaveBeenCalledTimes(1)
      expect(updateSiteEngineMock).toHaveBeenCalledTimes(1)
      expect(updateSiteTemplateMock).toHaveBeenCalledTimes(1)
    })

    it('SITE_NOT_REGISTERED 不会冒泡，正常完成切换', async () => {
      const { game, newEngine } = setupBaseSwitch()
      updateSiteEngineMock.mockRejectedValueOnce(new AppError('SITE_NOT_REGISTERED', 'no site'))

      await expect(engineSwitch.switchEngine(game, newEngine)).resolves.toBeUndefined()
      expect(dbGameUpdateMock).toHaveBeenCalledTimes(1)
    })
  })
})
