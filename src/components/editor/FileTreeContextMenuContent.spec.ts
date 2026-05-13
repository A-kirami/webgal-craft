import { beforeEach, describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'

import {
  createBrowserClickStub,
  createBrowserContainerStub,
  renderInBrowser,
} from '~/__tests__/browser-render'

import FileTreeContextMenuContent from './FileTreeContextMenuContent.vue'

const {
  clearClipboardMock,
  createErrorMock,
  loggerMock,
  pathOperationPerformMock,
  reportErrorMock,
  reportWarningsMock,
  toastMock,
} = vi.hoisted(() => ({
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

const globalStubs = {
  ContextMenuItem: createBrowserClickStub('StubContextMenuItem'),
  ContextMenuSeparator: createBrowserContainerStub('StubContextMenuSeparator', 'hr'),
}

describe('FileTreeContextMenuContent', () => {
  beforeEach(() => {
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

  it('cut 粘贴被取消时不会清空剪贴板，也不会显示成功提示', async () => {
    renderInBrowser(FileTreeContextMenuContent, {
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

    expect(pathOperationPerformMock).toHaveBeenCalledOnce()
    expect(clearClipboardMock).not.toHaveBeenCalled()
    expect(toastMock.success).not.toHaveBeenCalled()
    expect(toastMock.error).not.toHaveBeenCalled()
  })
})
