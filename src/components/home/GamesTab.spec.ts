import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import { defineComponent, h, reactive, ref } from 'vue'

import { createBrowserClickStub, renderInBrowser } from '~/__tests__/browser-render'
import { createTestEngine, createTestGame } from '~/__tests__/factories'
import { AppError } from '~/types/errors'

import GamesTab from './GamesTab.vue'

import type { Engine, Game } from '~/database/model'

const {
  importGameMock,
  modalOpenMock,
  notifyErrorMock,
  notifySuccessMock,
  notifyWarningMock,
  openDialogMock,
  openPathMock,
  routerPushMock,
  useModalStoreMock,
  usePreferenceStoreMock,
  useResourceStoreMock,
  useRouterMock,
  useWorkspaceStoreMock,
} = vi.hoisted(() => ({
  importGameMock: vi.fn(),
  modalOpenMock: vi.fn(),
  notifyErrorMock: vi.fn(),
  notifySuccessMock: vi.fn(),
  notifyWarningMock: vi.fn(),
  openDialogMock: vi.fn(),
  openPathMock: vi.fn(),
  routerPushMock: vi.fn(),
  useModalStoreMock: vi.fn(),
  usePreferenceStoreMock: vi.fn(),
  useResourceStoreMock: vi.fn(),
  useRouterMock: vi.fn(),
  useWorkspaceStoreMock: vi.fn(),
}))

function translate(key: string): string {
  switch (key) {
    case 'home.engines.goToInstall': {
      return '前往安装'
    }
    case 'home.engines.later': {
      return '稍后'
    }
    case 'home.engines.noEngineContent': {
      return '需要先安装游戏引擎，才能创建游戏'
    }
    case 'home.engines.noEngineTitle': {
      return '没有找到可用的游戏引擎'
    }
    case 'home.games.createNewGame': {
      return '创建新游戏'
    }
    case 'home.games.importCreating': {
      return '游戏正在创建中，请等待创建完成'
    }
    case 'home.games.importInvalidFolder': {
      return '这不是一个有效的游戏文件夹'
    }
    case 'home.games.noGames': {
      return '暂无游戏'
    }
    case 'home.games.noGamesDesc': {
      return '拖入游戏文件夹或新建游戏'
    }
    case 'home.games.dropGameFolder': {
      return '拖放游戏文件夹到这里'
    }
    case 'common.or': {
      return '或'
    }
    default: {
      return key
    }
  }
}

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
    warning: notifyWarningMock,
  },
}))

vi.mock('vue-router', () => ({
  useRouter: useRouterMock,
}))

vi.mock('vue-i18n', async importOriginal => ({
  ...(await importOriginal<typeof import('vue-i18n')>()),
  useI18n: () => ({
    t: translate,
  }),
}))

vi.mock('~/composables/useTauriDropZone', () => ({
  useTauriDropZone: () => ({
    files: ref<string[] | undefined>(undefined),
    isOverDropZone: ref(false),
  }),
}))

vi.mock('~/plugins/dayjs', () => ({
  default: () => ({
    fromNow: () => 'just now',
  }),
}))

vi.mock('~/services/game-manager', () => ({
  gameManager: {
    importGame: importGameMock,
  },
}))

vi.mock('~/stores/modal', () => ({
  useModalStore: useModalStoreMock,
}))

vi.mock('~/stores/preference', () => ({
  usePreferenceStore: usePreferenceStoreMock,
}))

vi.mock('~/stores/resource', () => ({
  useResourceStore: useResourceStoreMock,
}))

vi.mock('~/stores/workspace', () => ({
  useWorkspaceStore: useWorkspaceStoreMock,
}))

const globalStubs = {
  Button: createBrowserClickStub('StubButton'),
  GamesTabCollectionSection: defineComponent({
    name: 'StubGamesTabCollectionSection',
    props: {
      games: {
        type: Array,
        required: true,
      },
    },
    emits: ['deleteGame', 'drop', 'gameClick', 'importClick', 'openFolder'],
    setup(props, { emit }) {
      return () => h('div', [
        ...(props.games as Game[]).map(game => h('article', { key: game.id }, [
          h('h3', {
            onClick: () => emit('gameClick', game),
          }, game.metadata.name),
          h('button', {
            type: 'button',
            onClick: () => emit('openFolder', game),
          }, '打开文件夹'),
          h('button', {
            type: 'button',
            onClick: () => emit('deleteGame', game),
          }, '删除游戏'),
        ])),
        h('h3', {
          onClick: () => emit('importClick'),
        }, '导入游戏'),
      ])
    },
  }),
}

function createResourceStore(options: {
  activeProgress?: Map<string, number>
  engines?: Engine[]
  games?: Game[]
} = {}) {
  const activeProgress = options.activeProgress ?? new Map<string, number>()
  const games = options.games ?? []
  const engines = options.engines ?? []

  return reactive({
    activeProgress,
    engines,
    filteredGames: games,
    games,
    getProgress(id: string) {
      return activeProgress.get(id)
    },
  })
}

describe('GamesTab', () => {
  beforeEach(() => {
    importGameMock.mockReset()
    modalOpenMock.mockReset()
    notifyErrorMock.mockReset()
    notifySuccessMock.mockReset()
    notifyWarningMock.mockReset()
    openDialogMock.mockReset()
    openPathMock.mockReset()
    routerPushMock.mockReset()
    useModalStoreMock.mockReset()
    usePreferenceStoreMock.mockReset()
    useResourceStoreMock.mockReset()
    useRouterMock.mockReset()
    useWorkspaceStoreMock.mockReset()

    openDialogMock.mockResolvedValue(undefined)
    importGameMock.mockResolvedValue(undefined)
    useModalStoreMock.mockReturnValue({
      open: modalOpenMock,
    })
    usePreferenceStoreMock.mockReturnValue(reactive({
      viewMode: 'list' as const,
    }))
    useRouterMock.mockReturnValue({
      push: routerPushMock,
    })
    useWorkspaceStoreMock.mockReturnValue(reactive({
      activeTab: 'recent' as const,
    }))
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  function renderGamesTab() {
    renderInBrowser(GamesTab, {
      global: {
        mocks: {
          $t: translate,
        },
        stubs: globalStubs,
      },
    })
  }

  it('空状态下点击创建按钮会打开创建游戏模态框', async () => {
    useResourceStoreMock.mockReturnValue(createResourceStore({
      engines: [createTestEngine()],
      games: [],
    }))

    renderGamesTab()

    await page.getByRole('button', { name: '创建新游戏' }).click()

    expect(modalOpenMock).toHaveBeenCalledWith('CreateGameModal')
  })

  it('没有引擎时点击创建按钮会打开引导安装弹窗并可切到引擎标签', async () => {
    const workspaceStore = reactive({
      activeTab: 'recent' as 'recent' | 'engines',
    })

    useWorkspaceStoreMock.mockReturnValue(workspaceStore)
    useResourceStoreMock.mockReturnValue(createResourceStore({
      engines: [],
      games: [],
    }))

    renderGamesTab()

    await page.getByRole('button', { name: '创建新游戏' }).click()

    expect(modalOpenMock).toHaveBeenCalledWith('AlertModal', expect.objectContaining({
      confirmText: '前往安装',
      content: '需要先安装游戏引擎，才能创建游戏',
      title: '没有找到可用的游戏引擎',
    }))

    const alertOptions = modalOpenMock.mock.calls[0]?.[1] as { onConfirm?: () => void } | undefined
    alertOptions?.onConfirm?.()

    expect(workspaceStore.activeTab).toBe('engines')
  })

  it('列表视图操作按钮会打开文件夹并触发删除模态框', async () => {
    const game = createTestGame()

    useResourceStoreMock.mockReturnValue(createResourceStore({
      engines: [createTestEngine()],
      games: [game],
    }))

    renderGamesTab()

    await page.getByRole('button', { name: '打开文件夹' }).click()
    await page.getByRole('button', { name: '删除游戏' }).click()

    expect(openPathMock).toHaveBeenCalledWith('/games/demo')
    expect(modalOpenMock).toHaveBeenCalledWith('DeleteGameModal', { game })
  })

  it('游戏创建中时点击卡片会提示等待而不是跳转编辑器', async () => {
    const game = createTestGame()
    const activeProgress = new Map<string, number>([['game-1', 50]])

    useResourceStoreMock.mockReturnValue(createResourceStore({
      activeProgress,
      engines: [createTestEngine()],
      games: [game],
    }))

    renderGamesTab()

    await page.getByRole('heading', { name: 'Demo Game' }).click()

    expect(notifyWarningMock).toHaveBeenCalledWith('游戏正在创建中，请等待创建完成')
    expect(routerPushMock).not.toHaveBeenCalled()
  })

  it('导入游戏失败时会根据错误类型显示对应通知', async () => {
    useResourceStoreMock.mockReturnValue(createResourceStore({
      engines: [createTestEngine()],
      games: [createTestGame()],
    }))
    openDialogMock.mockResolvedValue('/games/import-target')
    importGameMock.mockRejectedValue(new AppError('INVALID_STRUCTURE', 'invalid'))

    renderGamesTab()

    await page.getByRole('heading', { name: '导入游戏' }).click()

    await vi.waitFor(() => {
      expect(importGameMock).toHaveBeenCalledWith('/games/import-target')
      expect(notifyErrorMock).toHaveBeenCalledWith('这不是一个有效的游戏文件夹')
    })
  })
})
