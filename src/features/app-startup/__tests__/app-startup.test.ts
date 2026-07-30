import { describe, expect, it, vi } from 'vitest'

import { AbsPath } from '~/domain/path'

import { runAppStartup } from '../app-startup'

import type { RunAppStartupOptions } from '../app-startup'

vi.mock('@tauri-apps/plugin-log', () => ({
  error: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
}))

function createStartupOptions(overrides: Partial<RunAppStartupOptions> = {}): RunAppStartupOptions {
  return {
    appUpdateController: {
      checkForUpdate: vi.fn(),
    },
    engineManager: {
      validateAllEngines: vi.fn(async () => ({
        failed: 0,
        failures: [],
        total: 0,
      })),
    },
    generalSettingsStore: {
      openLastProject: false,
    },
    resourceReconcile: {
      reconcileAllGames: vi.fn(async () => ({
        failed: 0,
        failures: [],
        total: 0,
      })),
    },
    resolveMissingStorageSavePaths: vi.fn(async () => ({})),
    recoverManagedImportSessions: vi.fn(() => Promise.resolve()),
    router: {
      currentRoute: {
        value: {
          path: '/',
        },
      },
      push: vi.fn(),
    },
    storageSettingsStore: {
      $patch: vi.fn(),
      engineSavePath: '',
      exportSavePath: '',
      gameSavePath: '',
      templateSavePath: '',
    },
    templateManager: {
      validateAllTemplates: vi.fn(async () => ({
        failed: 0,
        failures: [],
        total: 0,
      })),
    },
    t: vi.fn((key: string) => key),
    ...overrides,
  }
}

describe('runAppStartup', () => {
  it('初始化默认存储路径失败时会中止启动并抛出原始错误', async () => {
    const error = new Error('document dir unavailable')
    const checkForUpdate = vi.fn()
    const validateAllEngines = vi.fn()

    await expect(runAppStartup(createStartupOptions({
      appUpdateController: {
        checkForUpdate,
      },
      engineManager: {
        validateAllEngines,
      },
      resolveMissingStorageSavePaths: vi.fn(async () => {
        throw error
      }),
    }))).rejects.toThrow(error)

    expect(validateAllEngines).not.toHaveBeenCalled()
    expect(checkForUpdate).not.toHaveBeenCalled()
  })

  it('存在缺失存储路径时会写回默认值', async () => {
    const patch = vi.fn()

    await runAppStartup(createStartupOptions({
      resolveMissingStorageSavePaths: vi.fn(async () => ({
        gameSavePath: '/games',
        templateSavePath: '/templates',
      })),
      storageSettingsStore: {
        $patch: patch,
        engineSavePath: '',
        exportSavePath: '',
        gameSavePath: '',
        templateSavePath: '',
      },
    }))

    expect(patch).toHaveBeenCalledWith({
      gameSavePath: '/games',
      templateSavePath: '/templates',
    })
  })

  it('启动校验失败或返回异常摘要时仍会完成后续启动流程', async () => {
    const checkForUpdate = vi.fn()
    const validateAllEngines = vi.fn(async () => {
      throw new Error('engine manifest missing')
    })
    const reconcileAllGames = vi.fn(async () => ({
      failed: 2,
      failures: [
        { error: 'Error: manifest missing', path: AbsPath.from('/games/first') },
        { error: 'Error: permission denied', path: AbsPath.from('/games/second') },
      ],
      total: 3,
    }))
    const validateAllTemplates = vi.fn(async () => ({
      failed: 0,
      failures: [],
      total: 1,
    }))

    await runAppStartup(createStartupOptions({
      appUpdateController: {
        checkForUpdate,
      },
      engineManager: {
        validateAllEngines,
      },
      resourceReconcile: {
        reconcileAllGames,
      },
      templateManager: {
        validateAllTemplates,
      },
    }))

    expect(validateAllEngines).toHaveBeenCalledTimes(1)
    expect(reconcileAllGames).toHaveBeenCalledTimes(1)
    expect(validateAllTemplates).toHaveBeenCalledTimes(1)
    expect(checkForUpdate).toHaveBeenCalledWith('startup')
  })
})
