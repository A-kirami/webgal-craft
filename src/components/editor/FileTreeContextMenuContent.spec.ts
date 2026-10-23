import { beforeEach, describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'

import {
  createBrowserClickStub,
  createBrowserContainerStub,
  renderInBrowser,
} from '~/__tests__/browser-render'

import FileTreeContextMenuContent from './FileTreeContextMenuContent.vue'

const {
  deleteFileMock,
  handleErrorMock,
  isDesktopRuntimeMock,
  preferenceStore,
  modalOpenMock,
  clearClipboardMock,
  createErrorMock,
  loggerMock,
  pathOperationPerformMock,
  reportErrorMock,
  reportWarningsMock,
  toastMock,
} = vi.hoisted(() => ({
  deleteFileMock: vi.fn(),
  handleErrorMock: vi.fn(),
  isDesktopRuntimeMock: vi.fn(),
  preferenceStore: { skipDeleteFileConfirm: false },
  modalOpenMock: vi.fn(),
  clearClipboardMock: vi.fn(),
  createErrorMock: vi.fn((error: unknown) => error),
  loggerMock: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
  pathOperationPerformMock: vi.fn(),
  reportErrorMock: vi.fn(),
  reportWarningsMock: vi.fn(),
  toastMock: {
    error: vi.fn(),
    success: vi.fn(),
  },
}))

vi.mock('vue-sonner', () => ({
  toast: toastMock,
}))

vi.mock('@tauri-apps/plugin-log', () => ({
  logger: loggerMock,
}))

vi.mock('~/composables/usePathOperationFeedback', () => ({
  usePathOperationFeedback: vi.fn(() => ({
    createError: createErrorMock,
    reportError: reportErrorMock,
    reportWarnings: reportWarningsMock,
  })),
}))

vi.mock('~/features/editor/file-tree/useFileClipboard', () => ({
  useFileClipboard: vi.fn(() => ({
    canPaste: true,
    clipboard: [
      {
        isCut: true,
        isDir: false,
        path: '/project/game/background/bg.jpg',
      },
    ],
    clearClipboard: clearClipboardMock,
    operationType: 'cut',
    setClipboard: vi.fn(),
  })),
}))

vi.mock('~/services/game-fs', () => ({
  gameFs: {
    deleteFile: deleteFileMock,
    copyFile: vi.fn(),
  },
}))

vi.mock('~/services/path-operation', () => ({
  pathOperation: {
    perform: pathOperationPerformMock,
  },
}))

vi.mock('~/services/path-operation-confirm', () => ({
  createPathOperationRewriteConfirm: vi.fn(() => vi.fn()),
}))

vi.mock('~/stores/workspace', () => ({
  useWorkspaceStore: vi.fn(() => ({
    CWD: undefined,
  })),
}))

vi.mock(import('~/services/platform/runtime'), () => ({
  isDesktopRuntime: isDesktopRuntimeMock,
}))

vi.mock(import('~/utils/error-handler'), () => ({
  handleError: handleErrorMock,
}))

vi.mock(import('~/stores/preference'), () => ({
  usePreferenceStore: Object.assign(vi.fn().mockReturnValue(preferenceStore), { $id: 'preference' as const }),
}))

vi.mock(import('~/stores/modal'), () => ({
  useModalStore: Object.assign(vi.fn().mockReturnValue({ open: modalOpenMock }), { $id: 'modal' as const }),
}))

const globalStubs = {
  ContextMenuItem: createBrowserClickStub('StubContextMenuItem'),
  ContextMenuSeparator: createBrowserContainerStub('StubContextMenuSeparator', 'hr'),
}

describe('FileTreeContextMenuContent', () => {
  beforeEach(() => {
    deleteFileMock.mockReset().mockResolvedValue(undefined)
    handleErrorMock.mockReset()
    isDesktopRuntimeMock.mockReturnValue(true)
    preferenceStore.skipDeleteFileConfirm = false
    modalOpenMock.mockReset()
    clearClipboardMock.mockReset()
    createErrorMock.mockReset()
    createErrorMock.mockImplementation((error: unknown) => error)
    pathOperationPerformMock.mockReset()
    reportErrorMock.mockReset()
    reportWarningsMock.mockReset()
    toastMock.error.mockReset()
    toastMock.success.mockReset()
    pathOperationPerformMock.mockResolvedValue({
      cancelled: true,
      finalPath: '/project/game/background/bg.jpg',
      plan: undefined,
      warnings: [],
    })
  })

  it.each([true, false])('启用跳过确认后删除时遵循平台限制（桌面端：%s）', async (isDesktop) => {
    isDesktopRuntimeMock.mockReturnValue(isDesktop)
    await renderInBrowser(FileTreeContextMenuContent, {
      props: { item: { name: 'scene.txt', path: '/project/scene.txt' } },
      global: { stubs: globalStubs },
    })
    preferenceStore.skipDeleteFileConfirm = true
    await page.getByText('common.delete').click()

    if (isDesktop) {
      await vi.waitFor(() => {
        expect(deleteFileMock).toHaveBeenCalledWith('/project/scene.txt', false)
      })
      expect(modalOpenMock).not.toHaveBeenCalled()
    } else {
      expect(modalOpenMock).toHaveBeenCalledWith('DeleteFileModal', {
        file: expect.objectContaining({ path: '/project/scene.txt' }),
      })
      expect(deleteFileMock).not.toHaveBeenCalled()
    }
  })

  it('跳过确认后删除失败会显示错误提示', async () => {
    preferenceStore.skipDeleteFileConfirm = true
    const error = new Error('delete failed')
    deleteFileMock.mockRejectedValueOnce(error)
    await renderInBrowser(FileTreeContextMenuContent, {
      props: { item: { name: 'scene.txt', path: '/project/scene.txt' } },
      global: { stubs: globalStubs },
    })
    await page.getByText('common.delete').click()

    await vi.waitFor(() => {
      expect(handleErrorMock).toHaveBeenCalledWith(error, { context: 'edit.fileTree.deleteFailed' })
    })
    expect(modalOpenMock).not.toHaveBeenCalled()
  })

  it('未启用跳过确认时右键删除仍打开确认弹窗', async () => {
    await renderInBrowser(FileTreeContextMenuContent, {
      props: { item: { name: 'scene.txt', path: '/project/scene.txt' } },
      global: { stubs: globalStubs },
    })
    await page.getByText('common.delete').click()

    expect(modalOpenMock).toHaveBeenCalledWith('DeleteFileModal', {
      file: { name: 'scene.txt', path: '/project/scene.txt' },
    })
    expect(deleteFileMock).not.toHaveBeenCalled()
  })

  it('cut 粘贴被取消时不会清空剪贴板，也不会显示成功提示', async () => {
    await renderInBrowser(FileTreeContextMenuContent, {
      props: {
        item: {
          isDir: true,
          name: 'background',
          path: '/project/game/background',
        },
      },
      global: {
        stubs: globalStubs,
      },
    })

    await page.getByText('edit.fileTree.paste').click()

    await vi.waitFor(() => {
      expect(pathOperationPerformMock).toHaveBeenCalledOnce()
    })
    expect(clearClipboardMock).not.toHaveBeenCalled()
    expect(toastMock.success).not.toHaveBeenCalled()
    expect(toastMock.error).not.toHaveBeenCalled()
  })

  it('根目录打开文件夹操作可按目录状态禁用', async () => {
    await renderInBrowser(FileTreeContextMenuContent, {
      props: {
        isRoot: true,
        item: {
          isDir: true,
          name: 'background',
          path: '/project/game/background',
        },
        revealInExplorerDisabled: true,
      },
      global: {
        stubs: globalStubs,
      },
    })

    const openFolderItem = page.getByText('edit.fileTree.revealInExplorer')
    await expect.element(openFolderItem).toBeDisabled()
  })

  it('受保护入口文件会保留但禁用剪切、重命名和删除', async () => {
    await renderInBrowser(FileTreeContextMenuContent, {
      props: {
        item: {
          name: 'start.txt',
          path: '/games/demo/game/scene/start.txt',
        },
        onRename: vi.fn(),
        operationDisabled: true,
      },
      global: {
        stubs: globalStubs,
      },
    })

    await expect.element(page.getByText('edit.fileTree.cut')).toBeDisabled()
    await expect.element(page.getByText('edit.fileTree.rename')).toBeDisabled()
    await expect.element(page.getByText('common.delete')).toBeDisabled()
  })
})
