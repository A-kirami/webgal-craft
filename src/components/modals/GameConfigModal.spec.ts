import { beforeEach, describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import { defineComponent, h, reactive } from 'vue'

import { createBrowserClickStub, createBrowserContainerStub, renderInBrowser } from '~/__tests__/browser-render'

import GameConfigModal from './GameConfigModal.vue'

import type { PropType } from 'vue'

const {
  getConfigMock,
  notifySuccessMock,
  setConfigMock,
  useWorkspaceStoreMock,
} = vi.hoisted(() => ({
  getConfigMock: vi.fn(),
  notifySuccessMock: vi.fn(),
  setConfigMock: vi.fn(),
  useWorkspaceStoreMock: vi.fn(),
}))

vi.mock('@tauri-apps/api/path', async () => {
  const actual = await vi.importActual<typeof import('@tauri-apps/api/path')>('@tauri-apps/api/path')

  return {
    ...actual,
    join: async (...parts: string[]) => parts.join('/'),
  }
})

vi.mock('~/services/config-manager', () => ({
  configManager: {
    getConfig: getConfigMock,
    setConfig: setConfigMock,
  },
}))

vi.mock('~/stores/workspace', () => ({
  useWorkspaceStore: useWorkspaceStoreMock,
}))

vi.mock('notivue', () => ({
  push: {
    success: notifySuccessMock,
  },
}))

const workspaceStoreState = reactive({
  currentGame: {
    id: 'game-1',
    path: '/games/demo',
  },
  currentGameServeUrl: 'http://127.0.0.1:8899/game/demo/',
  refreshCurrentGameSnapshot: vi.fn().mockResolvedValue(undefined),
})

const globalStubs = {
  Button: createBrowserClickStub('StubButton'),
  CoverImagePicker: defineComponent({
    name: 'StubCoverImagePicker',
    props: {
      modelValue: {
        type: String,
        default: '',
      },
    },
    emits: ['update:modelValue'],
    setup(props, { emit }) {
      return () => h('div', [
        h('output', { 'data-testid': 'cover-picker-value' }, props.modelValue),
        h('button', {
          type: 'button',
          onClick: () => emit('update:modelValue', 'cover-next.webp'),
        }, 'change-cover'),
      ])
    },
  }),
  Dialog: defineComponent({
    name: 'StubDialog',
    props: {
      open: {
        type: Boolean,
        default: false,
      },
    },
    emits: ['update:open'],
    setup(props, { emit, slots }) {
      return () => h('div', { 'data-open': String(props.open) }, [
        h('button', {
          'type': 'button',
          'data-testid': 'dialog-close-request',
          'onClick': () => emit('update:open', false),
        }, 'request-close'),
        ...(slots.default?.() ?? []),
      ])
    },
  }),
  DialogContent: createBrowserContainerStub('StubDialogContent', 'section'),
  DialogDescription: createBrowserContainerStub('StubDialogDescription'),
  DialogFooter: createBrowserContainerStub('StubDialogFooter'),
  DialogHeader: createBrowserContainerStub('StubDialogHeader'),
  DialogTitle: createBrowserContainerStub('StubDialogTitle'),
  Loader2: createBrowserContainerStub('StubLoader2'),
  SaveChangesModal: defineComponent({
    name: 'StubSaveChangesModal',
    props: {
      open: {
        type: Boolean,
        default: false,
      },
      onDontSave: {
        type: Function as PropType<(() => void | Promise<void>) | undefined>,
        default: undefined,
      },
      onSave: {
        type: Function as PropType<(() => void | Promise<void>) | undefined>,
        default: undefined,
      },
    },
    setup(props) {
      return () => {
        if (!props.open) {
          return
        }

        return h('div', { 'data-testid': 'save-changes-modal' }, [
          h('button', {
            'type': 'button',
            'data-testid': 'save-changes-confirm-save',
            'onClick': () => props.onSave?.(),
          }, 'confirm-save'),
          h('button', {
            'type': 'button',
            'data-testid': 'save-changes-confirm-dont-save',
            'onClick': () => props.onDontSave?.(),
          }, 'confirm-dont-save'),
        ])
      }
    },
  }),
  ScrollArea: createBrowserContainerStub('StubScrollArea'),
  StartupImagesPicker: defineComponent({
    name: 'StubStartupImagesPicker',
    props: {
      modelValue: {
        type: Array as PropType<string[]>,
        default: () => [],
      },
    },
    emits: ['update:modelValue'],
    setup(props, { emit }) {
      return () => h('div', [
        h('output', { 'data-testid': 'startup-picker-value' }, props.modelValue.join('|')),
        h('button', {
          type: 'button',
          onClick: () => emit('update:modelValue', ['enter-next.webp', 'logo-next.webp']),
        }, 'change-startup'),
      ])
    },
  }),
}

describe('GameConfigModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getConfigMock.mockResolvedValue({
      titleImg: 'cover.webp',
      gameLogo: 'opening.webp|enter.webp|',
    })
    useWorkspaceStoreMock.mockReturnValue(workspaceStoreState)
  })

  it('打开时会读取配置并把封面图与启动图分发给对应控件', async () => {
    renderInBrowser(GameConfigModal, {
      browser: {
        i18nMode: 'lite',
      },
      props: {
        'open': true,
        'onUpdate:open': vi.fn(),
      },
      global: {
        stubs: globalStubs,
      },
    })

    await expect.element(page.getByTestId('game-config-modal-content')).toBeVisible()
    await expect.element(page.getByTestId('game-config-modal-scroll-area')).toBeVisible()
    await expect.element(page.getByTestId('cover-picker-value')).toHaveTextContent('cover.webp')
    await expect.element(page.getByTestId('startup-picker-value')).toHaveTextContent('opening.webp|enter.webp')
    expect(getConfigMock).toHaveBeenCalledWith('/games/demo')
  })

  it('底部只保留保存按钮，不再渲染取消按钮', async () => {
    renderInBrowser(GameConfigModal, {
      browser: {
        i18nMode: 'lite',
      },
      props: {
        'open': true,
        'onUpdate:open': vi.fn(),
      },
      global: {
        stubs: globalStubs,
      },
    })

    await expect.element(page.getByTestId('cover-picker-value')).toHaveTextContent('cover.webp')
    await expect.element(page.getByRole('button', { name: 'common.save' })).toBeVisible()
    await expect.element(page.getByRole('button', { name: 'common.cancel' })).not.toBeInTheDocument()
  })

  it('有修改时请求关闭并选择不保存后，才真正关闭弹窗', async () => {
    const updateOpen = vi.fn()

    renderInBrowser(GameConfigModal, {
      browser: {
        i18nMode: 'lite',
      },
      props: {
        'open': true,
        'onUpdate:open': updateOpen,
      },
      global: {
        stubs: globalStubs,
      },
    })

    await expect.element(page.getByTestId('cover-picker-value')).toHaveTextContent('cover.webp')

    await page.getByRole('button', { name: 'change-cover' }).click()
    await page.getByTestId('dialog-close-request').click()

    await expect.element(page.getByTestId('save-changes-modal')).toBeVisible()
    expect(updateOpen).not.toHaveBeenCalled()

    await page.getByTestId('save-changes-confirm-dont-save').click()

    await vi.waitFor(() => {
      expect(updateOpen).toHaveBeenCalledWith(false)
    })
  })

  it('保存时会序列化启动图并刷新当前游戏快照', async () => {
    const updateOpen = vi.fn()

    renderInBrowser(GameConfigModal, {
      browser: {
        i18nMode: 'lite',
      },
      props: {
        'open': true,
        'onUpdate:open': updateOpen,
      },
      global: {
        stubs: globalStubs,
      },
    })

    await expect.element(page.getByTestId('cover-picker-value')).toHaveTextContent('cover.webp')

    await page.getByRole('button', { name: 'change-cover' }).click()
    await page.getByRole('button', { name: 'change-startup' }).click()
    await page.getByRole('button', { name: 'common.save' }).click()

    expect(setConfigMock).toHaveBeenCalledWith('/games/demo', {
      titleImg: 'cover-next.webp',
      gameLogo: 'enter-next.webp|logo-next.webp|',
    })
    expect(workspaceStoreState.refreshCurrentGameSnapshot).toHaveBeenCalled()
    expect(notifySuccessMock).toHaveBeenCalledWith('common.saved')
    expect(updateOpen).toHaveBeenCalledWith(false)
  })
})
