import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createTestEngine } from '~/__tests__/factories'
import { AppError } from '~/types/errors'

import { useEnginesTabController } from '../useEnginesTabController'

const {
  dirnameMock,
  importEngineMock,
  notifyErrorMock,
  notifySuccessMock,
  openDialogMock,
  openPathMock,
} = vi.hoisted(() => ({
  dirnameMock: vi.fn(async (path: string) => path.replace(/[/\\][^/\\]+$/, '')),
  importEngineMock: vi.fn(),
  notifyErrorMock: vi.fn(),
  notifySuccessMock: vi.fn(),
  openDialogMock: vi.fn(),
  openPathMock: vi.fn(),
}))

vi.mock('@tauri-apps/api/path', () => ({
  dirname: dirnameMock,
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

vi.mock('~/services/engine-manager', () => ({
  engineManager: {
    importEngine: importEngineMock,
  },
}))

describe('useEnginesTabController 行为', () => {
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

  it('打开引擎族目录时会跳到名称层目录', async () => {
    const controller = createController()

    await controller.handleOpenGroupFolder({
      engines: [
        {
          engine: createTestEngine({
            path: '/engines/WebGAL/4.5.0',
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

  it('会把整组删除委托给调用方', () => {
    const controller = createController()

    controller.handleDeleteGroup('WebGAL')

    expect(openDeleteEngineGroupModalMock).toHaveBeenCalledWith('WebGAL')
  })
})
