import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createTestEngine } from '~/__tests__/factories'
import { AbsPath } from '~/domain/path'
import { MIN_WEBGAL_EDITOR_RUNTIME_VERSION } from '~/services/engine-manager'
import { AppError } from '~/types/errors'

import { useEnginesTabController } from '../useEnginesTabController'

const {
  enginesWhereMock,
  importEngineMock,
  notifyErrorMock,
  notifySuccessMock,
  openDialogMock,
  openPathMock,
  reconcileEngineRecordMock,
} = vi.hoisted(() => ({
  enginesWhereMock: vi.fn(),
  importEngineMock: vi.fn(),
  notifyErrorMock: vi.fn(),
  notifySuccessMock: vi.fn(),
  openDialogMock: vi.fn(),
  openPathMock: vi.fn(),
  reconcileEngineRecordMock: vi.fn(),
}))

vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: openDialogMock,
}))

vi.mock('@tauri-apps/plugin-opener', () => ({
  openPath: openPathMock,
}))

vi.mock('notivue', () => ({
  push: {
    error: notifyErrorMock,
    success: notifySuccessMock,
  },
}))

vi.mock('~/services/engine-manager', async (importOriginal) => {
  const actual = await importOriginal<typeof import('~/services/engine-manager')>()

  return {
    engineManager: {
      importEngine: importEngineMock,
    },
    MIN_WEBGAL_EDITOR_RUNTIME_VERSION: actual.MIN_WEBGAL_EDITOR_RUNTIME_VERSION,
  }
})

vi.mock('~/services/resource-reconcile', () => ({
  resourceReconcile: {
    reconcileEngineRecord: reconcileEngineRecordMock,
  },
}))

vi.mock('~/database/db', () => ({
  db: {
    engines: {
      where: enginesWhereMock,
    },
  },
}))

describe('useEnginesTabController', () => {
  const openDeleteEngineGroupModalMock = vi.fn()
  const openDeleteEngineModalMock = vi.fn()
  const setDefaultEngineIdMock = vi.fn()

  function createController(overrides?: Partial<Parameters<typeof useEnginesTabController>[0]>) {
    return useEnginesTabController({
      activeProgress: new Map<string, number>(),
      openDeleteEngineGroupModal: openDeleteEngineGroupModalMock,
      openDeleteEngineModal: openDeleteEngineModalMock,
      setDefaultEngineId: setDefaultEngineIdMock,
      t: (key: string) => key,
      ...overrides,
    })
  }

  beforeEach(() => {
    vi.resetAllMocks()

    openDialogMock.mockResolvedValue(undefined)
    reconcileEngineRecordMock.mockResolvedValue('available')
    enginesWhereMock.mockReturnValue({
      equals: vi.fn(() => ({ toArray: vi.fn().mockResolvedValue([]) })),
    })
  })

  it('拖入多个目录时提示错误且不会触发导入', async () => {
    const controller = createController()

    await controller.handleDrop(['/a', '/b'])

    expect(importEngineMock).not.toHaveBeenCalled()
    expect(notifyErrorMock).toHaveBeenCalledWith('home.engines.importMultipleFolders')
  })

  it('从选择对话框选中目录后导入引擎', async () => {
    openDialogMock.mockResolvedValue('/engines/selected')

    const controller = createController()

    await controller.selectEngineFolder()

    expect(importEngineMock).toHaveBeenCalledWith('/engines/selected')
    expect(notifySuccessMock).toHaveBeenCalledWith('home.engines.importSuccess')
  })

  it('导入结构错误时提示非法目录', async () => {
    importEngineMock.mockRejectedValue(new AppError('INVALID_STRUCTURE', 'invalid'))
    openDialogMock.mockResolvedValue('/engines/invalid')

    const controller = createController()

    await controller.selectEngineFolder()

    expect(notifyErrorMock).toHaveBeenCalledWith('home.engines.importInvalidFolder')
  })

  it('导入过旧引擎时会把最低运行时版本传给通知文案', async () => {
    importEngineMock.mockRejectedValue(new AppError('ENGINE_EDITOR_INCOMPATIBLE', 'too old', {
      details: {
        issue: 'versionTooOld',
        reason: 'ENGINE_EDITOR_INCOMPATIBLE',
      },
    }))
    openDialogMock.mockResolvedValue('/engines/old')
    const t = vi.fn((key: string, ...args: unknown[]) => {
      const named = args[0] as { version?: unknown } | undefined
      return `${key}:${String(named?.version ?? '')}`
    })

    const controller = createController({ t })

    await controller.selectEngineFolder()

    expect(notifyErrorMock).toHaveBeenCalledWith(
      `home.engines.importVersionTooOld:${MIN_WEBGAL_EDITOR_RUNTIME_VERSION}`,
    )
  })

  it('打开引擎族目录时会跳到名称层目录', async () => {
    const controller = createController()

    await controller.handleOpenGroupFolder({
      engines: [
        {
          engine: createTestEngine({
            path: AbsPath.from('/engines/WebGAL/4.5.0'),
            version: '4.5.0',
          }),
        },
      ],
    })

    expect(openPathMock).toHaveBeenCalledWith('/engines/WebGAL')
  })

  it('会把默认引擎切换委托给调用方', () => {
    const controller = createController()

    controller.handleSetDefaultEngine('WebGAL')

    expect(setDefaultEngineIdMock).toHaveBeenCalledWith('WebGAL')
  })

  it('取消默认引擎时会把空值委托给调用方', () => {
    const controller = createController()

    controller.handleSetDefaultEngine(undefined)

    expect(setDefaultEngineIdMock).toHaveBeenCalledWith(undefined)
  })

  it('会用最新校验结果打开整组删除弹窗', async () => {
    const staleEngine = createTestEngine({
      id: 'engine-stale',
      availability: 'available',
    })
    const missingEngine = createTestEngine({
      id: 'engine-missing',
      availability: 'missing',
    })
    enginesWhereMock.mockReturnValue({
      equals: vi.fn(() => ({ toArray: vi.fn().mockResolvedValue([staleEngine, missingEngine]) })),
    })
    reconcileEngineRecordMock
      .mockResolvedValueOnce('missing')
      .mockResolvedValueOnce('missing')
    const controller = createController()

    await controller.handleDeleteGroup('WebGAL')

    expect(openDeleteEngineGroupModalMock).toHaveBeenCalledWith('WebGAL', {
      allUnavailable: true,
    })
  })

  it('仍有可用版本时不会把整组删除视为只删记录', async () => {
    const availableEngine = createTestEngine({
      id: 'engine-available',
      availability: 'available',
    })
    const missingEngine = createTestEngine({
      id: 'engine-missing',
      availability: 'missing',
    })
    enginesWhereMock.mockReturnValue({
      equals: vi.fn(() => ({ toArray: vi.fn().mockResolvedValue([availableEngine, missingEngine]) })),
    })
    reconcileEngineRecordMock
      .mockResolvedValueOnce('available')
      .mockResolvedValueOnce('missing')
    const controller = createController()

    await controller.handleDeleteGroup('WebGAL')

    expect(openDeleteEngineGroupModalMock).toHaveBeenCalledWith('WebGAL', {
      allUnavailable: false,
    })
  })
})
