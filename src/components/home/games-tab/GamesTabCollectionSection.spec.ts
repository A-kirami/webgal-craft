import { afterEach, describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import { defineComponent, h, ref } from 'vue'

import { createBrowserClickStub, createBrowserContainerStub, renderInBrowser } from '~/__tests__/browser-render'
import { createTestGame } from '~/__tests__/factories'

import GamesTabCollectionSection from './GamesTabCollectionSection.vue'

import type { PropType } from 'vue'
import type { Game } from '~/database/model'

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

interface ThumbnailStubValue {
  width: number
  height: number
  resizeMode?: 'contain' | 'cover'
}

function createAssetImageStub() {
  return defineComponent({
    name: 'StubAssetImage',
    props: {
      alt: {
        type: String,
        default: undefined,
      },
      path: {
        type: String,
        default: undefined,
      },
      cacheVersion: {
        type: Number,
        default: undefined,
      },
      thumbnail: {
        type: Object as PropType<ThumbnailStubValue | undefined>,
        default: undefined,
      },
    },
    setup(props, { attrs }) {
      return () => h('img', {
        ...attrs,
        'alt': props.alt,
        'data-path': props.path,
        'data-cache-version': props.cacheVersion === undefined ? undefined : String(props.cacheVersion),
        'data-thumbnail': props.thumbnail === undefined ? undefined : JSON.stringify(props.thumbnail),
      })
    },
  })
}

const globalStubs = {
  AssetImage: createAssetImageStub(),
  Button: createBrowserClickStub('StubButton'),
  Card: createBrowserContainerStub('StubCard'),
  CardContent: createBrowserContainerStub('StubCardContent'),
  ContextMenu: createBrowserContainerStub('StubContextMenu'),
  ContextMenuContent: createBrowserContainerStub('StubContextMenuContent'),
  ContextMenuItem: createBrowserClickStub('StubContextMenuItem'),
  ContextMenuTrigger: createBrowserContainerStub('StubContextMenuTrigger'),
  Progress: createBrowserContainerStub('StubProgress'),
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
        resolveGameServeUrl: () => 'http://127.0.0.1:8899/game/demo/',
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
        resolveGameServeUrl: () => 'http://127.0.0.1:8899/game/demo/',
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
        resolveGameServeUrl: () => 'http://127.0.0.1:8899/game/demo/',
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
        resolveGameServeUrl: () => 'http://127.0.0.1:8899/game/demo/',
        viewMode: 'list',
      },
      global: {
        stubs: globalStubs,
      },
    })

    await page.getByRole('button', { name: 'home.games.importGame home.games.importGameHint' }).click()

    expect(onImportClick).toHaveBeenCalledTimes(1)
  })

  it('会为网格视图中的封面和图标传入固定缩略图尺寸', async () => {
    renderInBrowser(GamesTabCollectionSection, {
      browser: {
        i18nMode: 'lite',
      },
      props: {
        games: [createTestGame()],
        getGameProgress: () => 0,
        hasGameProgress: () => false,
        resolveGameServeUrl: () => 'http://127.0.0.1:8899/game/demo/',
        viewMode: 'grid',
      },
      global: {
        stubs: globalStubs,
      },
    })

    const coverImage = await page.getByAltText('home.games.gameCover').element()
    const iconImage = await page.getByAltText('home.games.gameIcon').element()

    expect(coverImage.dataset.thumbnail).toBe(JSON.stringify({ width: 640, height: 360, resizeMode: 'cover' }))
    expect(iconImage.dataset.thumbnail).toBe(JSON.stringify({ width: 64, height: 64, resizeMode: 'contain' }))
  })

  it('会为列表视图中的封面传入固定缩略图尺寸', async () => {
    renderInBrowser(GamesTabCollectionSection, {
      browser: {
        i18nMode: 'lite',
      },
      props: {
        games: [createTestGame()],
        getGameProgress: () => 0,
        hasGameProgress: () => false,
        resolveGameServeUrl: () => 'http://127.0.0.1:8899/game/demo/',
        viewMode: 'list',
      },
      global: {
        stubs: globalStubs,
      },
    })

    const coverImage = await page.getByAltText('home.games.gameCover').element()
    expect(coverImage.dataset.thumbnail).toBe(JSON.stringify({ width: 80, height: 80, resizeMode: 'cover' }))
  })

  it('封面和图标会使用资源级 cacheVersion，而不是复用游戏级 lastModified', async () => {
    const game = createTestGame({
      lastModified: 999,
    }) as Game & {
      previewAssets: {
        cover: { path: string, cacheVersion: number }
        icon: { path: string, cacheVersion: number }
      }
    }

    game.previewAssets = {
      cover: {
        path: '/games/demo/cover-from-preview.png',
        cacheVersion: 111,
      },
      icon: {
        path: '/games/demo/icon-from-preview.png',
        cacheVersion: 222,
      },
    }

    renderInBrowser(GamesTabCollectionSection, {
      browser: {
        i18nMode: 'lite',
      },
      props: {
        games: [game],
        getGameProgress: () => 0,
        hasGameProgress: () => false,
        resolveGameServeUrl: () => 'http://127.0.0.1:8899/game/demo/',
        viewMode: 'grid',
      },
      global: {
        stubs: globalStubs,
      },
    })

    const coverImage = await page.getByAltText('home.games.gameCover').element()
    const iconImage = await page.getByAltText('home.games.gameIcon').element()

    expect(coverImage.dataset.path).toBe('/games/demo/cover-from-preview.png')
    expect(iconImage.dataset.path).toBe('/games/demo/icon-from-preview.png')
    expect(coverImage.dataset.cacheVersion).toBe('111')
    expect(iconImage.dataset.cacheVersion).toBe('222')
  })
})
