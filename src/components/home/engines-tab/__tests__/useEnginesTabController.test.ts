import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AppError } from '~/types/errors'

import { useEnginesTabController } from '../useEnginesTabController'

const {
  importEngineMock,
  notifyErrorMock,
  notifySuccessMock,
  openDialogMock,
  openPathMock,
} = vi.hoisted(() => ({
  importEngineMock: vi.fn(),
  notifyErrorMock: vi.fn(),
  notifySuccessMock: vi.fn(),
  openDialogMock: vi.fn(),
  openPathMock: vi.fn(),
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

describe('useEnginesTabController', () => {
  beforeEach(() => {
    importEngineMock.mockReset()
    notifyErrorMock.mockReset()
    notifySuccessMock.mockReset()
    openDialogMock.mockReset()
    openPathMock.mockReset()
    openDialogMock.mockResolvedValue(undefined)
  })

  it('拖入多个目录时提示错误且不会触发导入', async () => {
    const openDeleteEngineModalMock = vi.fn()

    const controller = useEnginesTabController({
      activeProgress: new Map<string, number>(),
      openDeleteEngineModal: openDeleteEngineModalMock,
      t: (key: string) => key,
    })

    await controller.handleDrop(['/a', '/b'])

    expect(importEngineMock).not.toHaveBeenCalled()
    expect(notifyErrorMock).toHaveBeenCalledWith('home.engines.importMultipleFolders')
  })

  it('从选择对话框返回数组时使用首个目录导入', async () => {
    const openDeleteEngineModalMock = vi.fn()
    openDialogMock.mockResolvedValue(['/engines/first', '/engines/second'])

    const controller = useEnginesTabController({
      activeProgress: new Map<string, number>(),
      openDeleteEngineModal: openDeleteEngineModalMock,
      t: (key: string) => key,
    })

    await controller.selectEngineFolder()

    expect(importEngineMock).toHaveBeenCalledWith('/engines/first')
    expect(notifySuccessMock).toHaveBeenCalledWith('home.engines.importSuccess')
  })

  it('导入结构错误时提示非法目录', async () => {
    const openDeleteEngineModalMock = vi.fn()
    importEngineMock.mockRejectedValue(new AppError('INVALID_STRUCTURE', 'invalid'))
    openDialogMock.mockResolvedValue('/engines/invalid')

    const controller = useEnginesTabController({
      activeProgress: new Map<string, number>(),
      openDeleteEngineModal: openDeleteEngineModalMock,
      t: (key: string) => key,
    })

    await controller.selectEngineFolder()

    expect(notifyErrorMock).toHaveBeenCalledWith('home.engines.importInvalidFolder')
  })
})
