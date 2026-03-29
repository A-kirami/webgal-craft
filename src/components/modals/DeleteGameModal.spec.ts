import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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
  modalOpenMock,
  notifySuccessMock,
  useModalStoreMock,
} = vi.hoisted(() => ({
  deleteGameMock: vi.fn(),
  modalOpenMock: vi.fn(),
  notifySuccessMock: vi.fn(),
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
    case 'modals.deleteGame.deleteSuccess': {
      return '游戏删除成功'
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

vi.mock('~/stores/modal', () => ({
  useModalStore: useModalStoreMock,
}))

vi.mock('notivue', () => ({
  push: {
    success: notifySuccessMock,
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

function renderDeleteGameModal(updateOpen = vi.fn()) {
  const game = createTestGame()

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
  afterEach(() => {
    vi.clearAllMocks()
  })

  beforeEach(() => {
    deleteGameMock.mockReset()
    modalOpenMock.mockReset()
    notifySuccessMock.mockReset()
    useModalStoreMock.mockReturnValue({
      open: modalOpenMock,
    })
  })

  it('默认确认会直接删除游戏并关闭模态框', async () => {
    const { game, updateOpen } = renderDeleteGameModal()

    await page.getByRole('button', { name: '确认' }).click()

    expect(deleteGameMock).toHaveBeenCalledWith(game, false)
    expect(notifySuccessMock).toHaveBeenCalledWith('游戏删除成功')
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
})
