/* eslint-disable vue/one-component-per-file, vue/require-default-prop */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import { render } from 'vitest-browser-vue'
import { defineComponent, h } from 'vue'

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

function createStubContainer(name: string, tag: string = 'div') {
  return defineComponent({
    name,
    setup(_, { attrs, slots }) {
      return () => h(tag, attrs, slots.default?.())
    },
  })
}

function createStubButton(name: string) {
  return defineComponent({
    name,
    emits: ['click'],
    setup(_, { attrs, emit, slots }) {
      return () => h('button', {
        ...attrs,
        type: 'button',
        onClick: (event: MouseEvent) => emit('click', event),
      }, slots.default?.())
    },
  })
}

const globalStubs = {
  'AlertDialog': createStubContainer('StubAlertDialog'),
  'AlertDialogAction': createStubButton('StubAlertDialogAction'),
  'AlertDialogCancel': createStubButton('StubAlertDialogCancel'),
  'AlertDialogContent': createStubContainer('StubAlertDialogContent'),
  'AlertDialogDescription': createStubContainer('StubAlertDialogDescription'),
  'AlertDialogFooter': createStubContainer('StubAlertDialogFooter'),
  'AlertDialogHeader': createStubContainer('StubAlertDialogHeader'),
  'AlertDialogTitle': createStubContainer('StubAlertDialogTitle', 'h2'),
  'Checkbox': defineComponent({
    name: 'StubCheckbox',
    props: {
      id: {
        type: String,
        required: false,
      },
      modelValue: Boolean,
    },
    emits: ['update:modelValue'],
    setup(props, { attrs, emit }) {
      return () => h('input', {
        ...attrs,
        checked: props.modelValue,
        id: props.id,
        type: 'checkbox',
        onChange: (event: Event) => emit('update:modelValue', (event.target as HTMLInputElement).checked),
      })
    },
  }),
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

function renderDeleteGameModal(game: Game, updateOpen = vi.fn()) {
  render(DeleteGameModal, {
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
    const game = createGame()
    const { updateOpen } = renderDeleteGameModal(game)

    await page.getByRole('button', { name: '确认' }).click()

    expect(deleteGameMock).toHaveBeenCalledWith(game, false)
    expect(notifySuccessMock).toHaveBeenCalledWith('游戏删除成功')
    expect(updateOpen).toHaveBeenCalledWith(false)
  })

  it('勾选删除文件后会先打开二次确认模态框', async () => {
    const game = createGame()
    renderDeleteGameModal(game)

    await page.getByRole('checkbox').click()
    await page.getByRole('button', { name: '确认' }).click()

    expect(deleteGameMock).not.toHaveBeenCalled()
    expect(modalOpenMock).toHaveBeenCalledWith('DeleteGameConfirmModal', expect.objectContaining({
      game,
      onConfirm: expect.any(Function),
    }))
  })
})
