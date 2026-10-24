import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createTestEngine, createTestGame } from '~/__tests__/factories'
import { AppError } from '~/types/errors'

const {
  dbEngineGetMock,
  readProjectConfigMock,
  requestGameDependencyResolutionMock,
  switchEngineMock,
} = vi.hoisted(() => ({
  dbEngineGetMock: vi.fn(),
  readProjectConfigMock: vi.fn(),
  requestGameDependencyResolutionMock: vi.fn(),
  switchEngineMock: vi.fn(),
}))

vi.mock('~/commands/project-config', () => ({
  projectConfigCmds: {
    readProjectConfig: readProjectConfigMock,
  },
}))

vi.mock('~/database/db', () => ({
  db: {
    engines: {
      get: dbEngineGetMock,
    },
  },
}))

vi.mock('~/features/modals/game-dependency-resolution/request-game-dependency-resolution', () => ({
  requestGameDependencyResolution: requestGameDependencyResolutionMock,
}))

vi.mock('~/services/engine-switch', () => ({
  engineSwitch: {
    switchEngine: switchEngineMock,
  },
}))

describe('requestGameRuntimeRebind', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    switchEngineMock.mockResolvedValue(undefined)
  })

  it('会使用 GameDependencyResolutionModal 的请求入口选择兼容引擎并执行重绑', async () => {
    const currentEngine = createTestEngine({
      id: 'engine-old',
      engineId: 'open-webgal.webgal',
      version: '4.5.0',
    })
    const selectedEngine = createTestEngine({
      id: 'engine-new',
      engineId: 'open-webgal.webgal',
      version: '4.6.2',
    })
    const game = createTestGame({
      engineId: 'engine-old',
      metadata: { name: ' Demo Game ' },
    })

    dbEngineGetMock.mockImplementation(async (engineId: string) => {
      if (engineId === 'engine-old') {
        return currentEngine
      }
      if (engineId === 'engine-new') {
        return selectedEngine
      }
      return
    })
    requestGameDependencyResolutionMock.mockResolvedValue({ engineId: 'engine-new' })

    const { requestGameRuntimeRebind } = await import('../request-game-runtime-rebind')
    const rebound = await requestGameRuntimeRebind(game, {
      compatibilityIssue: 'versionTooOld',
      reason: 'incompatible',
    })

    expect(rebound).toBe(true)
    expect(requestGameDependencyResolutionMock).toHaveBeenCalledWith({
      gameName: 'Demo Game',
      purpose: 'runtimeRebind',
      source: 'configured',
      engine: {
        compatibilityIssue: 'versionTooOld',
        current: {
          id: 'open-webgal.webgal',
          version: '4.5.0',
        },
        reason: 'incompatible',
      },
    })
    expect(switchEngineMock).toHaveBeenCalledWith(game, selectedEngine, { templateDecision: 'keep' })
  })

  it('用户取消依赖重选时不会执行重绑', async () => {
    const game = createTestGame({ engineId: 'engine-old' })
    dbEngineGetMock.mockResolvedValue(createTestEngine({ id: 'engine-old' }))
    requestGameDependencyResolutionMock.mockResolvedValue(undefined)

    const { requestGameRuntimeRebind } = await import('../request-game-runtime-rebind')
    const rebound = await requestGameRuntimeRebind(game)

    expect(rebound).toBe(false)
    expect(switchEngineMock).not.toHaveBeenCalled()
  })

  it('当前引擎记录缺失时按项目配置的逻辑引用打开依赖重选并完成重绑', async () => {
    const selectedEngine = createTestEngine({ id: 'engine-new' })
    const game = createTestGame({ engineId: 'engine-missing' })
    dbEngineGetMock.mockResolvedValue(undefined)
    readProjectConfigMock.mockResolvedValue({
      version: 1,
      engine: {
        id: 'open-webgal.webgal',
        version: '4.5.0',
      },
    })
    requestGameDependencyResolutionMock.mockImplementation(async () => {
      // 重绑流程在用户选定后再取一次所选引擎记录
      dbEngineGetMock.mockResolvedValue(selectedEngine)
      return { engineId: 'engine-new' }
    })

    const { requestGameRuntimeRebind } = await import('../request-game-runtime-rebind')
    const rebound = await requestGameRuntimeRebind(game)

    expect(rebound).toBe(true)
    expect(requestGameDependencyResolutionMock).toHaveBeenCalledWith({
      gameName: 'Demo Game',
      purpose: 'runtimeRebind',
      source: 'configured',
      engine: {
        current: {
          id: 'open-webgal.webgal',
          version: '4.5.0',
        },
        reason: 'missing',
      },
    })
    expect(switchEngineMock).toHaveBeenCalledWith(game, selectedEngine, { templateDecision: 'keep' })
  })

  it('项目配置也读不出引擎引用时仍打开依赖重选，只是不展示当前引擎', async () => {
    const game = createTestGame({ engineId: 'engine-missing' })
    dbEngineGetMock.mockResolvedValue(undefined)
    readProjectConfigMock.mockRejectedValue(new Error('项目配置损坏'))
    requestGameDependencyResolutionMock.mockResolvedValue(undefined)

    const { requestGameRuntimeRebind } = await import('../request-game-runtime-rebind')
    const rebound = await requestGameRuntimeRebind(game)

    expect(rebound).toBe(false)
    expect(requestGameDependencyResolutionMock).toHaveBeenCalledWith({
      gameName: 'Demo Game',
      purpose: 'runtimeRebind',
      source: 'configured',
      engine: {
        reason: 'missing',
      },
    })
  })

  it('会把运行时错误 issue 映射为依赖重选原因', async () => {
    const { resolveRuntimeRebindIssue } = await import('../request-game-runtime-rebind')

    expect(resolveRuntimeRebindIssue('versionTooOld')).toEqual({
      compatibilityIssue: 'versionTooOld',
      reason: 'incompatible',
    })
    expect(resolveRuntimeRebindIssue('unavailable')).toEqual({
      reason: 'unavailable',
    })
    expect(resolveRuntimeRebindIssue('missing')).toEqual({
      reason: 'missing',
    })
  })

  it('只有可以靠重选运行时修复的错误才进入重绑流程', async () => {
    const { isRuntimeRebindRequired } = await import('../request-game-runtime-rebind')

    expect(isRuntimeRebindRequired(new AppError('ENGINE_EDITOR_INCOMPATIBLE', '引擎不可用'))).toBe(true)
    expect(isRuntimeRebindRequired(new AppError('IO_ERROR', '引擎不存在', {
      details: { issue: 'missing', reason: 'ENGINE_NOT_FOUND' },
    }))).toBe(true)
    expect(isRuntimeRebindRequired(new AppError('IO_ERROR', '磁盘满了'))).toBe(false)
    expect(isRuntimeRebindRequired(new Error('boom'))).toBe(false)
  })

  it('所选引擎记录消失时返回结构化错误', async () => {
    const game = createTestGame({ engineId: 'engine-old' })
    dbEngineGetMock.mockResolvedValueOnce(createTestEngine({ id: 'engine-old' }))
    dbEngineGetMock.mockResolvedValueOnce(undefined)
    requestGameDependencyResolutionMock.mockResolvedValue({ engineId: 'engine-missing' })

    const { requestGameRuntimeRebind } = await import('../request-game-runtime-rebind')

    await expect(requestGameRuntimeRebind(game)).rejects.toMatchObject({
      code: 'IO_ERROR',
      details: {
        reason: 'ENGINE_NOT_FOUND',
      },
    } satisfies Partial<AppError>)
  })
})
