import { beforeEach, describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'

import {
  createBrowserCheckboxStub,
  createBrowserClickStub,
  createBrowserContainerStub,
  renderInBrowser,
} from '~/__tests__/browser-render'

import DeleteFileModal from './DeleteFileModal.vue'

const {
  deleteFileMock,
  handleErrorMock,
  isDesktopRuntimeMock,
  usePreferenceStoreMock,
} = vi.hoisted(() => ({
  deleteFileMock: vi.fn(),
  handleErrorMock: vi.fn(),
  isDesktopRuntimeMock: vi.fn(),
  usePreferenceStoreMock: vi.fn(),
}))

vi.mock('~/services/game-fs', () => ({
  gameFs: {
    deleteFile: deleteFileMock,
  },
}))

vi.mock('~/services/platform/runtime', () => ({
  isDesktopRuntime: isDesktopRuntimeMock,
}))

vi.mock('~/stores/preference', () => ({
  usePreferenceStore: usePreferenceStoreMock,
}))

vi.mock('~/utils/error-handler', () => ({
  handleError: handleErrorMock,
}))

const globalStubs = {
  AlertDialog: createBrowserContainerStub('StubAlertDialog'),
  AlertDialogAction: createBrowserClickStub('StubAlertDialogAction'),
  AlertDialogCancel: createBrowserClickStub('StubAlertDialogCancel'),
  AlertDialogContent: createBrowserContainerStub('StubAlertDialogContent'),
  AlertDialogDescription: createBrowserContainerStub('StubAlertDialogDescription'),
  AlertDialogFooter: createBrowserContainerStub('StubAlertDialogFooter'),
  AlertDialogHeader: createBrowserContainerStub('StubAlertDialogHeader'),
  AlertDialogTitle: createBrowserContainerStub('StubAlertDialogTitle', 'h2'),
  Checkbox: createBrowserCheckboxStub('StubCheckbox'),
}

function renderDeleteFileModal(options: {
  onConfirm?: () => void | Promise<void>
  updateOpen?: (value: boolean) => void
} = {}) {
  const updateOpen = options.updateOpen ?? vi.fn()

  renderInBrowser(DeleteFileModal, {
    props: {
      'open': true,
      'file': {
        path: '/games/demo/game/scene/start.txt',
        name: 'start.txt',
      },
      'onConfirm': options.onConfirm,
      'onUpdate:open': updateOpen,
    },
    browser: {
      i18nMode: 'lite',
    },
    global: {
      stubs: globalStubs,
    },
  })

  return { updateOpen }
}

describe('DeleteFileModal', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    deleteFileMock.mockResolvedValue(undefined)
    isDesktopRuntimeMock.mockReturnValue(true)
    usePreferenceStoreMock.mockReturnValue({
      skipDeleteFileConfirm: false,
    })
  })

  it('桌面端仍将文件移到回收站并允许记录跳过确认偏好', async () => {
    const preferenceStore = { skipDeleteFileConfirm: false }
    usePreferenceStoreMock.mockReturnValue(preferenceStore)
    renderDeleteFileModal()

    await page.getByRole('checkbox').click()
    await page.getByRole('button', { name: 'common.moveToTrash' }).click()

    expect(deleteFileMock).toHaveBeenCalledWith('/games/demo/game/scene/start.txt', false)
    expect(preferenceStore.skipDeleteFileConfirm).toBe(true)
  })

  it('Android 端要求确认永久删除且不提供跳过确认', async () => {
    isDesktopRuntimeMock.mockReturnValue(false)
    renderDeleteFileModal()

    await expect.element(page.getByText('modals.deleteFile.permanentDescription')).toBeInTheDocument()
    await expect.element(page.getByRole('checkbox')).not.toBeInTheDocument()
    await page.getByRole('button', { name: 'common.delete' }).click()

    expect(deleteFileMock).toHaveBeenCalledWith('/games/demo/game/scene/start.txt', true)
  })

  it('删除失败时不会关闭模态框或执行确认回调', async () => {
    const error = new Error('delete failed')
    const onConfirm = vi.fn()
    const { updateOpen } = renderDeleteFileModal({ onConfirm })
    deleteFileMock.mockRejectedValueOnce(error)

    await page.getByRole('button', { name: 'common.moveToTrash' }).click()

    await vi.waitFor(() => {
      expect(handleErrorMock).toHaveBeenCalledWith(error, { context: 'edit.fileTree.deleteFailed' })
    })
    expect(onConfirm).not.toHaveBeenCalled()
    expect(updateOpen).not.toHaveBeenCalledWith(false)
  })

  it('删除成功但刷新回调失败时仍会关闭模态框并单独报告刷新错误', async () => {
    const error = new Error('refresh failed')
    const onConfirm = vi.fn().mockRejectedValueOnce(error)
    const { updateOpen } = renderDeleteFileModal({ onConfirm })

    await page.getByRole('button', { name: 'common.moveToTrash' }).click()

    await vi.waitFor(() => {
      expect(onConfirm).toHaveBeenCalledTimes(1)
      expect(handleErrorMock).toHaveBeenCalledWith(error, { context: 'edit.fileTree.refreshFailed' })
    })
    expect(updateOpen).toHaveBeenCalledWith(false)
  })
})
