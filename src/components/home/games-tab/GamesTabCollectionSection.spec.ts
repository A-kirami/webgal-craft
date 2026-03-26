import { afterEach, describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import { ref } from 'vue'

import { createBrowserClickStub, createBrowserContainerStub, renderInBrowser } from '~/__tests__/browser-render'
import { createTestGame } from '~/__tests__/factories'

import GamesTabCollectionSection from './GamesTabCollectionSection.vue'

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

const globalStubs = {
  Button: createBrowserClickStub('StubButton'),
  Card: createBrowserContainerStub('StubCard'),
  CardContent: createBrowserContainerStub('StubCardContent'),
  ContextMenu: createBrowserContainerStub('StubContextMenu'),
  ContextMenuContent: createBrowserContainerStub('StubContextMenuContent'),
  ContextMenuItem: createBrowserClickStub('StubContextMenuItem'),
  ContextMenuTrigger: createBrowserContainerStub('StubContextMenuTrigger'),
  Progress: createBrowserContainerStub('StubProgress'),
  Thumbnail: createBrowserContainerStub('StubThumbnail', 'img'),
  Tooltip: createBrowserContainerStub('StubTooltip'),
  TooltipContent: createBrowserContainerStub('StubTooltipContent'),
  TooltipProvider: createBrowserContainerStub('StubTooltipProvider'),
  TooltipTrigger: createBrowserContainerStub('StubTooltipTrigger'),
}

describe('GamesTabCollectionSection', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('列表视图中处理中的游戏会显示创建中状态', async () => {
    renderInBrowser(GamesTabCollectionSection, {
      browser: {
        i18nMode: 'lite',
      },
      props: {
        games: [createTestGame()],
        getGameProgress: () => 50,
        hasGameProgress: () => true,
        viewMode: 'list',
      },
      global: {
        stubs: globalStubs,
      },
    })

    await expect.element(page.getByText('home.games.creating')).toBeVisible()
    await expect.element(page.getByText('home.games.modifiedAt')).not.toBeInTheDocument()
  })

  it('网格视图中处理中的游戏不会显示删除操作', async () => {
    renderInBrowser(GamesTabCollectionSection, {
      browser: {
        i18nMode: 'lite',
      },
      props: {
        games: [createTestGame()],
        getGameProgress: () => 50,
        hasGameProgress: () => true,
        viewMode: 'grid',
      },
      global: {
        stubs: globalStubs,
      },
    })

    await expect.element(page.getByRole('button', { name: 'home.games.deleteGame' })).not.toBeInTheDocument()
  })

  it('导入入口使用按钮语义并会触发 importClick', async () => {
    const onImportClick = vi.fn()

    renderInBrowser(GamesTabCollectionSection, {
      browser: {
        i18nMode: 'lite',
      },
      props: {
        games: [createTestGame()],
        getGameProgress: () => 0,
        hasGameProgress: () => false,
        onImportClick,
        viewMode: 'grid',
      },
      global: {
        stubs: globalStubs,
      },
    })

    await page.getByRole('button', { name: 'home.games.importGame home.games.importGameHint' }).click()

    expect(onImportClick).toHaveBeenCalledTimes(1)
  })

  it('列表视图中的导入入口也使用按钮语义并会触发 importClick', async () => {
    const onImportClick = vi.fn()

    renderInBrowser(GamesTabCollectionSection, {
      browser: {
        i18nMode: 'lite',
      },
      props: {
        games: [createTestGame()],
        getGameProgress: () => 0,
        hasGameProgress: () => false,
        onImportClick,
        viewMode: 'list',
      },
      global: {
        stubs: globalStubs,
      },
    })

    await page.getByRole('button', { name: 'home.games.importGame home.games.importGameHint' }).click()

    expect(onImportClick).toHaveBeenCalledTimes(1)
  })
})
