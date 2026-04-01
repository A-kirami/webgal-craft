import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useHomeResourceImportActions } from '~/features/home/shared/useHomeResourceImportActions'
import { AppError } from '~/types/errors'

const {
  importResourceMock,
  notifyErrorMock,
  notifySuccessMock,
  openDialogMock,
  openPathMock,
} = vi.hoisted(() => ({
  importResourceMock: vi.fn(),
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

function createActions() {
  return useHomeResourceImportActions({
    activeProgress: new Map<string, number>([['resource-1', 55]]),
    importResource: importResourceMock,
    messages: {
      invalidFolder: t => t('home.engines.importInvalidFolder'),
      multipleFolders: t => t('home.engines.importMultipleFolders'),
      selectFolderTitle: t => t('common.dialogs.selectEngineFolder'),
      success: t => t('home.engines.importSuccess'),
      unknownError: t => t('home.engines.importUnknownError'),
    },
    t: (key: string) => key,
  })
}

describe('useHomeResourceImportActions', () => {
  beforeEach(() => {
    importResourceMock.mockReset()
    notifyErrorMock.mockReset()
    notifySuccessMock.mockReset()
    openDialogMock.mockReset()
    openPathMock.mockReset()
    importResourceMock.mockResolvedValue(undefined)
    openDialogMock.mockResolvedValue(undefined)
  })

  it('选择目录后会导入并提示成功', async () => {
    openDialogMock.mockResolvedValue('/engines/selected')
    const actions = createActions()

    await actions.selectFolder()

    expect(openDialogMock).toHaveBeenCalledWith(expect.objectContaining({
      directory: true,
      multiple: false,
      title: 'common.dialogs.selectEngineFolder',
    }))
    expect(importResourceMock).toHaveBeenCalledWith('/engines/selected')
    expect(notifySuccessMock).toHaveBeenCalledWith('home.engines.importSuccess')
  })

  it('拖入多个目录时只提示错误且不会触发导入', async () => {
    const actions = createActions()

    await actions.handleDrop(['/engines/one', '/engines/two'])

    expect(importResourceMock).not.toHaveBeenCalled()
    expect(notifyErrorMock).toHaveBeenCalledWith('home.engines.importMultipleFolders')
  })

  it('导入结构错误时会提示无效目录', async () => {
    openDialogMock.mockResolvedValue('/engines/invalid')
    importResourceMock.mockRejectedValue(new AppError('INVALID_STRUCTURE', 'invalid'))
    const actions = createActions()

    await actions.selectFolder()

    expect(notifyErrorMock).toHaveBeenCalledWith('home.engines.importInvalidFolder')
  })

  it('能够暴露统一的进度读取与目录打开能力', async () => {
    const actions = createActions()

    expect(actions.hasProgress({ id: 'resource-1' })).toBe(true)
    expect(actions.getProgress({ id: 'resource-1' })).toBe(55)

    await actions.handleOpenFolder({ path: '/engines/default' })

    expect(openPathMock).toHaveBeenCalledWith('/engines/default')
  })
})
