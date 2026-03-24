import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import { render } from 'vitest-browser-vue'
import { defineComponent, h } from 'vue'

import { createBrowserTestI18n } from '~/__tests__/browser'

import DeleteGameModal from './DeleteGameModal.vue'

import type { Game } from '~/database/model'

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

const globalStubs = {
  'i18n-t': defineComponent({
    name: 'MockI18nT',
    setup(_, { slots }) {
      return () => h('span', slots.default?.())
    },
  }),
}

function createGame(): Game {
  return {
    id: 'game-1',
    path: '/games/demo',
    createdAt: 0,
    lastModified: 0,
    status: 'created',
    metadata: {
      name: 'Demo Game',
      icon: '',
      cover: '',
    },
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
    const updateOpen = vi.fn()
    const game = createGame()

    render(DeleteGameModal, {
      props: {
        'open': true,
        game,
        'onUpdate:open': updateOpen,
      },
      global: {
        plugins: [createBrowserTestI18n()],
        stubs: globalStubs,
      },
    })

    await page.getByRole('button', { name: 'common.confirm' }).click()

    expect(deleteGameMock).toHaveBeenCalledWith(game, false)
    expect(notifySuccessMock).toHaveBeenCalledWith('modals.deleteGame.deleteSuccess')
    expect(updateOpen).toHaveBeenCalledWith(false)
  })

  it('勾选删除文件后会先打开二次确认模态框', async () => {
    const updateOpen = vi.fn()
    const game = createGame()

    render(DeleteGameModal, {
      props: {
        'open': true,
        game,
        'onUpdate:open': updateOpen,
      },
      global: {
        plugins: [createBrowserTestI18n()],
        stubs: globalStubs,
      },
    })

    await page.getByRole('checkbox').click()
    await page.getByRole('button', { name: 'common.confirm' }).click()

    expect(deleteGameMock).not.toHaveBeenCalled()
    expect(modalOpenMock).toHaveBeenCalledWith('DeleteGameConfirmModal', expect.objectContaining({
      game,
      onConfirm: expect.any(Function),
    }))
  })
})
