import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useHomeResourceImportActions } from '~/features/home/shared/useHomeResourceImportActions'
import { AppError } from '~/types/errors'

const {
  importResourceMock,
  toastErrorMock,
  toastInfoMock,
  toastSuccessMock,
  openPathMock,
  selectResourceMock,
} = vi.hoisted(() => ({
  importResourceMock: vi.fn(),
  toastErrorMock: vi.fn(),
  toastInfoMock: vi.fn(),
  toastSuccessMock: vi.fn(),
  openPathMock: vi.fn(),
  selectResourceMock: vi.fn(),
}))

vi.mock('@tauri-apps/plugin-opener', () => ({
  openPath: openPathMock,
}))

vi.mock('vue-sonner', () => ({
  toast: {
    error: toastErrorMock,
    info: toastInfoMock,
    success: toastSuccessMock,
  },
}))

function createActions() {
  return useHomeResourceImportActions({
    activeProgress: new Map<string, number>([['resource-1', 55]]),
    importResource: importResourceMock,
    selectResource: selectResourceMock,
    messages: {
      invalidFolder: t => t('home.engines.importInvalidFolder'),
      multipleFolders: t => t('home.engines.importMultipleFolders'),
      selectFolderTitle: t => t('common.dialogs.selectEngineFolder'),
      unsupportedLegacyEngine: t => t('home.engines.importUnsupportedLegacyEngine'),
      unknownError: t => t('home.engines.importUnknownError'),
    },
    t: (key: string) => key,
  })
}

describe('useHomeResourceImportActions', () => {
  beforeEach(() => {
    vi.resetAllMocks()

    importResourceMock.mockResolvedValue(undefined)
    selectResourceMock.mockResolvedValue(undefined)
  })

  it('选择目录导入成功时保持静默', async () => {
    const actions = createActions()

    await actions.selectFolder()

    expect(selectResourceMock).toHaveBeenCalledOnce()
    expect(importResourceMock).not.toHaveBeenCalled()
    expect(toastSuccessMock).not.toHaveBeenCalled()
    expect(toastInfoMock).not.toHaveBeenCalled()
    expect(toastErrorMock).not.toHaveBeenCalled()
  })

  it('拖入多个目录时只提示错误且不会触发导入', async () => {
    const actions = createActions()

    await actions.handleDrop(['/engines/one', '/engines/two'])

    expect(importResourceMock).not.toHaveBeenCalled()
    expect(toastErrorMock).toHaveBeenCalledWith('home.engines.importMultipleFolders')
  })

  it('导入结构错误时会提示无效目录', async () => {
    selectResourceMock.mockRejectedValue(new AppError('INVALID_STRUCTURE', 'invalid'))
    const actions = createActions()

    await actions.selectFolder()

    expect(toastErrorMock).toHaveBeenCalledWith('home.engines.importInvalidFolder')
  })

  it('旧版引擎导入错误时会提示用户改走项目导入', async () => {
    selectResourceMock.mockRejectedValue(new AppError('INVALID_MANIFEST', 'legacy', {
      details: { reason: 'LEGACY_ENGINE' },
    }))
    const actions = createActions()

    await actions.selectFolder()

    expect(toastErrorMock).toHaveBeenCalledWith('home.engines.importUnsupportedLegacyEngine')
  })

  it('导入被用户取消时保持静默', async () => {
    selectResourceMock.mockRejectedValue(new AppError('IO_ERROR', 'cancelled', {
      details: { reason: 'IMPORT_CANCELLED' },
    }))
    const actions = createActions()

    await actions.selectFolder()

    expect(toastErrorMock).not.toHaveBeenCalled()
    expect(toastInfoMock).not.toHaveBeenCalled()
    expect(toastSuccessMock).not.toHaveBeenCalled()
  })

  it('能够暴露统一的进度读取与目录打开能力', async () => {
    const actions = createActions()

    expect(actions.hasProgress({ id: 'resource-1' })).toBe(true)
    expect(actions.getProgress({ id: 'resource-1' })).toBe(55)

    await actions.handleOpenFolder({ path: '/engines/default' })

    expect(openPathMock).toHaveBeenCalledWith('/engines/default')
  })
})
