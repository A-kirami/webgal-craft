import { beforeEach, describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'

import {
  createBrowserCheckboxStub,
  createBrowserClickStub,
  createBrowserContainerStub,
  renderInBrowser,
} from '~/__tests__/browser-render'
import { createTestGame } from '~/__tests__/factories'

import DeleteGameModal from './DeleteGameModal.vue'

const {
  deleteGameMock,
  loggerErrorMock,
  modalOpenMock,
  toastErrorMock,
  toastSuccessMock,
  useModalStoreMock,
} = vi.hoisted(() => ({
  deleteGameMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  modalOpenMock: vi.fn(),
  toastErrorMock: vi.fn(),
  toastSuccessMock: vi.fn(),
  useModalStoreMock: vi.fn(),
}))

function translate(key: string): string {
  switch (key) {
    case 'common.cancel': {
      return '取消'
    }
    case 'common.confirm': {
      return '确认'
    }
    case 'modals.deleteGame.deleteFiles': {
      return '同时删除游戏文件'
    }
    case 'modals.deleteGame.deleteFailed': {
      return '游戏删除失败'
    }
    case 'modals.deleteGame.removeFailed': {
      return '游戏记录移除失败'
    }
    case 'modals.deleteGame.removeTitle': {
      return '移除游戏记录'
    }
    case 'modals.deleteGame.title': {
      return '删除游戏'
    }
    default: {
      return key
    }
  }
}

vi.mock('~/services/game-manager', () => ({
  gameManager: {
    deleteGame: deleteGameMock,
  },
}))

vi.mock('@tauri-apps/plugin-log', () => ({
  attachConsole: vi.fn(),
  debug: vi.fn(),
  error: loggerErrorMock,
  info: vi.fn(),
  warn: vi.fn(),
}))

vi.mock('~/stores/modal', () => ({
  useModalStore: useModalStoreMock,
}))

vi.mock('vue-sonner', () => ({
  toast: {
    error: toastErrorMock,
    success: toastSuccessMock,
  },
}))

vi.mock('vue-i18n', async importOriginal => ({
  ...(await importOriginal<typeof import('vue-i18n')>()),
  useI18n: () => ({
    t: translate,
  }),
}))

const globalStubs = {
  'AlertDialog': createBrowserContainerStub('StubAlertDialog'),
  'AlertDialogAction': createBrowserClickStub('StubAlertDialogAction'),
  'AlertDialogCancel': createBrowserClickStub('StubAlertDialogCancel'),
  'AlertDialogContent': createBrowserContainerStub('StubAlertDialogContent'),
  'AlertDialogDescription': createBrowserContainerStub('StubAlertDialogDescription'),
  'AlertDialogFooter': createBrowserContainerStub('StubAlertDialogFooter'),
  'AlertDialogHeader': createBrowserContainerStub('StubAlertDialogHeader'),
  'AlertDialogTitle': createBrowserContainerStub('StubAlertDialogTitle', 'h2'),
  'Checkbox': createBrowserCheckboxStub('StubCheckbox'),
  'i18n-t': createBrowserContainerStub('MockI18nT', 'span'),
}

function renderDeleteGameModal(updateOpen = vi.fn(), game = createTestGame()) {
  renderInBrowser(DeleteGameModal, {
    props: {
      'open': true,
      game,
      'onUpdate:open': updateOpen,
    },
    global: {
      mocks: {
        $t: translate,
      },
      stubs: globalStubs,
    },
  })

  return {
    game,
    updateOpen,
  }
}

describe('DeleteGameModal', () => {
  beforeEach(() => {
    vi.resetAllMocks()

    deleteGameMock.mockResolvedValue(undefined)
    useModalStoreMock.mockReturnValue({
      open: modalOpenMock,
    })
  })

  it('默认确认会直接删除游戏并关闭模态框', async () => {
    const { game, updateOpen } = renderDeleteGameModal()

    await page.getByRole('button', { name: '确认' }).click()

    expect(deleteGameMock).toHaveBeenCalledWith(game, false)
    expect(toastSuccessMock).not.toHaveBeenCalled()
    expect(updateOpen).toHaveBeenCalledWith(false)
  })

  it('勾选删除文件后会先打开二次确认模态框', async () => {
    const { game } = renderDeleteGameModal()

    await page.getByRole('checkbox').click()
    await page.getByRole('button', { name: '确认' }).click()

    expect(deleteGameMock).not.toHaveBeenCalled()
    expect(modalOpenMock).toHaveBeenCalledWith('DeleteGameConfirmModal', expect.objectContaining({
      game,
      onConfirm: expect.any(Function),
    }))
  })

  it('直接删除失败时记录原因、展示兜底消息且保持模态框打开', async () => {
    deleteGameMock.mockRejectedValueOnce(new Error('permission denied'))
    const { updateOpen } = renderDeleteGameModal()

    await page.getByRole('button', { name: '确认' }).click()

    await vi.waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledWith('游戏删除失败')
    })
    expect(loggerErrorMock).toHaveBeenCalledWith('删除游戏失败: Error: permission denied')
    expect(updateOpen).not.toHaveBeenCalledWith(false)
  })

  it('移除不可用游戏记录失败时展示兜底消息且保持模态框打开', async () => {
    deleteGameMock.mockRejectedValueOnce('unknown failure')
    const { updateOpen } = renderDeleteGameModal(
      vi.fn(),
      createTestGame({ availability: 'missing' }),
    )

    await page.getByRole('button', { name: '确认' }).click()

    await vi.waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledWith('游戏记录移除失败')
    })
    expect(loggerErrorMock).toHaveBeenCalledWith('移除游戏记录失败: unknown failure')
    expect(updateOpen).not.toHaveBeenCalledWith(false)
  })

  it('二次确认删除失败时展示兜底消息并返回失败结果', async () => {
    deleteGameMock.mockRejectedValueOnce('unknown failure')
    const { game } = renderDeleteGameModal()

    await page.getByRole('checkbox').click()
    await page.getByRole('button', { name: '确认' }).click()

    const confirmProps = modalOpenMock.mock.calls[0]?.[1] as {
      onConfirm: () => Promise<boolean>
    }
    await expect(confirmProps.onConfirm()).resolves.toBe(false)
    expect(deleteGameMock).toHaveBeenCalledWith(game, true)
    expect(toastErrorMock).toHaveBeenCalledWith('游戏删除失败')
  })
})
