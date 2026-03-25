/* eslint-disable vue/one-component-per-file, vue/require-default-prop */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import { render } from 'vitest-browser-vue'
import { defineComponent, h, ref } from 'vue'

import { createBrowserLiteI18n } from '~/__tests__/browser'

import GamesTabCollectionSection from './GamesTabCollectionSection.vue'

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

function createStubContainer(name: string, tag: string = 'div') {
  return defineComponent({
    name,
    setup(_, { attrs, slots }) {
      return () => h(tag, attrs, slots.default?.())
    },
  })
}

const globalStubs = {
  Button: createStubButton('StubButton'),
  Card: createStubContainer('StubCard'),
  CardContent: createStubContainer('StubCardContent'),
  ContextMenu: createStubContainer('StubContextMenu'),
  ContextMenuContent: createStubContainer('StubContextMenuContent'),
  ContextMenuItem: createStubButton('StubContextMenuItem'),
  ContextMenuTrigger: createStubContainer('StubContextMenuTrigger'),
  Progress: createStubContainer('StubProgress'),
  Thumbnail: defineComponent({
    name: 'StubThumbnail',
    props: {
      alt: {
        type: String,
        required: false,
      },
    },
    setup(props, { attrs }) {
      return () => h('img', {
        ...attrs,
        alt: props.alt,
      })
    },
  }),
  Tooltip: createStubContainer('StubTooltip'),
  TooltipContent: createStubContainer('StubTooltipContent'),
  TooltipProvider: createStubContainer('StubTooltipProvider'),
  TooltipTrigger: createStubContainer('StubTooltipTrigger'),
}

function createGame(overrides: Partial<Game> = {}): Game {
  return {
    id: 'game-1',
    path: '/games/demo',
    createdAt: 0,
    lastModified: 0,
    status: 'created',
    metadata: {
      cover: '/games/demo/cover.png',
      icon: '/games/demo/icon.png',
      name: 'Demo Game',
    },
    ...overrides,
  }
}

describe('GamesTabCollectionSection', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('列表视图中处理中的游戏会显示创建中状态', async () => {
    render(GamesTabCollectionSection, {
      props: {
        games: [createGame()],
        getGameProgress: () => 50,
        hasGameProgress: () => true,
        viewMode: 'list',
      },
      global: {
        plugins: [createBrowserLiteI18n()],
        stubs: globalStubs,
      },
    })

    await expect.element(page.getByText('home.games.creating')).toBeVisible()
    await expect.element(page.getByText('home.games.modifiedAt')).not.toBeInTheDocument()
  })

  it('网格视图中处理中的游戏不会显示删除操作', async () => {
    render(GamesTabCollectionSection, {
      props: {
        games: [createGame()],
        getGameProgress: () => 50,
        hasGameProgress: () => true,
        viewMode: 'grid',
      },
      global: {
        plugins: [createBrowserLiteI18n()],
        stubs: globalStubs,
      },
    })

    await expect.element(page.getByRole('button', { name: 'home.games.deleteGame' })).not.toBeInTheDocument()
  })
})
