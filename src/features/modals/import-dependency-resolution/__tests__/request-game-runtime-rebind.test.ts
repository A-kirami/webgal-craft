import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createTestEngine, createTestGame } from '~/__tests__/factories'
import { AppError } from '~/types/errors'

const {
  dbEngineGetMock,
  requestImportDependencyResolutionMock,
  switchEngineMock,
} = vi.hoisted(() => ({
  dbEngineGetMock: vi.fn(),
  requestImportDependencyResolutionMock: vi.fn(),
  switchEngineMock: vi.fn(),
}))

vi.mock('~/database/db', () => ({
  db: {
    engines: {
      get: dbEngineGetMock,
    },
  },
}))

vi.mock('~/features/modals/import-dependency-resolution/request-import-dependency-resolution', () => ({
  requestImportDependencyResolution: requestImportDependencyResolutionMock,
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
      version: '4.6.1',
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
    requestImportDependencyResolutionMock.mockResolvedValue({ engineId: 'engine-new' })

    const { requestGameRuntimeRebind } = await import('../request-game-runtime-rebind')
    const rebound = await requestGameRuntimeRebind(game, {
      compatibilityIssue: 'versionTooOld',
      reason: 'incompatible',
    })

    expect(rebound).toBe(true)
    expect(requestImportDependencyResolutionMock).toHaveBeenCalledWith({
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
    requestImportDependencyResolutionMock.mockResolvedValue(undefined)

    const { requestGameRuntimeRebind } = await import('../request-game-runtime-rebind')
    const rebound = await requestGameRuntimeRebind(game)

    expect(rebound).toBe(false)
    expect(switchEngineMock).not.toHaveBeenCalled()
  })

  it('当前引擎记录缺失时不会打开依赖重选', async () => {
    const game = createTestGame({ engineId: 'engine-missing' })
    dbEngineGetMock.mockResolvedValue(undefined)

    const { requestGameRuntimeRebind } = await import('../request-game-runtime-rebind')

    await expect(requestGameRuntimeRebind(game)).rejects.toMatchObject({
      code: 'IO_ERROR',
      details: {
        reason: 'ENGINE_NOT_FOUND',
      },
    } satisfies Partial<AppError>)
    expect(requestImportDependencyResolutionMock).not.toHaveBeenCalled()
    expect(switchEngineMock).not.toHaveBeenCalled()
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
  })

  it('所选引擎记录消失时返回结构化错误', async () => {
    const game = createTestGame({ engineId: 'engine-old' })
    dbEngineGetMock.mockResolvedValueOnce(createTestEngine({ id: 'engine-old' }))
    dbEngineGetMock.mockResolvedValueOnce(undefined)
    requestImportDependencyResolutionMock.mockResolvedValue({ engineId: 'engine-missing' })

    const { requestGameRuntimeRebind } = await import('../request-game-runtime-rebind')

    await expect(requestGameRuntimeRebind(game)).rejects.toMatchObject({
      code: 'IO_ERROR',
      details: {
        reason: 'ENGINE_NOT_FOUND',
      },
    } satisfies Partial<AppError>)
  })
})
