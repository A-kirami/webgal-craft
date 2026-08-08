import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { nextTick, shallowRef } from 'vue'
import { commandType } from 'webgal-parser/src/interface/sceneInterface'

import {
  createBrowserActionStub,
  createBrowserClickStub,
  createBrowserContainerStub,
  renderInBrowser,
} from '~/__tests__/browser-render'
import { LATEST_ENGINE_RUNTIME_CAPABILITIES } from '~/domain/engine/runtime-capabilities'
import { useCommandPanelStore } from '~/stores/command-panel'

const { dragSourcePropsMock, lastDragSourceOptions, modalOpenMock, useDragSessionMock, useDragSourceMock, useModalStoreMock, useResourceStoreMock } = vi.hoisted(() => ({
  dragSourcePropsMock: vi.fn(() => ({
    onClickCapture: vi.fn(),
    onPointerdown: vi.fn(),
  })),
  lastDragSourceOptions: {
    value: undefined as undefined | {
      getData: (element: HTMLElement) => unknown
    },
  },
  modalOpenMock: vi.fn(),
  useDragSessionMock: vi.fn(),
  useDragSourceMock: vi.fn((options) => {
    lastDragSourceOptions.value = options
    return {
      sourceProps: dragSourcePropsMock,
    }
  }),
  useModalStoreMock: vi.fn(),
  useResourceStoreMock: vi.fn(),
}))

vi.mock('~/stores/modal', () => ({
  useModalStore: useModalStoreMock,
}))

vi.mock('~/stores/resource', () => ({
  useResourceStore: useResourceStoreMock,
}))

vi.mock('~/composables/useDragSession', () => ({
  useDragSession: useDragSessionMock,
}))

vi.mock('~/composables/useDragTransfer', () => ({
  useDragSource: useDragSourceMock,
}))

import CommandPanel from './CommandPanel.vue'

const globalStubs = {
  Button: createBrowserClickStub('StubButton'),
  CommandPanelCard: createBrowserActionStub('StubCommandPanelCard', {
    eventName: 'click',
    namedSlots: ['actions', 'tooltip'],
    props: {
      title: {
        type: String,
        required: true,
      },
    },
    text: props => String(props.title),
  }),
  Popover: createBrowserContainerStub('StubPopover'),
  PopoverContent: createBrowserContainerStub('StubPopoverContent'),
  PopoverTrigger: createBrowserContainerStub('StubPopoverTrigger'),
  ScrollArea: createBrowserContainerStub('StubScrollArea'),
  ScrollBar: createBrowserContainerStub('StubScrollBar'),
  Separator: createBrowserContainerStub('StubSeparator'),
  Tooltip: createBrowserContainerStub('StubTooltip'),
  TooltipContent: createBrowserContainerStub('StubTooltipContent'),
  TooltipProvider: createBrowserContainerStub('StubTooltipProvider'),
  TooltipTrigger: createBrowserContainerStub('StubTooltipTrigger'),
}

function createCommandPanelBrowserOptions() {
  return {
    i18nMode: 'lite',
    messages: {
      'zh-Hans': {
        common: {
          cancel: 'cancel-action',
          delete: 'delete-action',
          edit: 'edit-action',
        },
        edit: {
          visualEditor: {
            commandPanel: {
              categories: {
                all: 'all-category',
                favorites: 'favorites-category',
                perform: 'perform-category',
                groups: 'groups-category',
              },
              addFavorite: '将此语句加入常用',
              removeFavorite: '将此语句移出常用',
              emptyFavorites: 'no-favorite-commands',
              confirmDeleteGroup: 'confirm-delete-group',
              editDefaults: 'edit-defaults',
            },
            commands: {
              filmMode: 'film-mode-command',
              say: 'dialogue-command',
            },
          },
        },
      },
    },
    pinia: true,
  } as const
}

describe('CommandPanel', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  beforeEach(() => {
    modalOpenMock.mockReset()
    dragSourcePropsMock.mockClear()
    lastDragSourceOptions.value = undefined
    useDragSessionMock.mockReset()
    useDragSourceMock.mockClear()
    useDragSessionMock.mockReturnValue({
      state: shallowRef({
        currentDropTarget: undefined,
        currentPosition: undefined,
        isActive: false,
        mode: undefined,
        payload: undefined,
        startPosition: undefined,
        transferOperation: 'move',
      }),
    })
    useModalStoreMock.mockReturnValue({
      open: modalOpenMock,
    })
    useResourceStoreMock.mockReturnValue({
      currentEngineRuntimeCapabilities: LATEST_ENGINE_RUNTIME_CAPABILITIES,
    })
  })

  function renderCommandPanel() {
    const { pinia } = renderInBrowser(CommandPanel, {
      browser: createCommandPanelBrowserOptions(),
      global: {
        stubs: globalStubs,
      },
    })

    if (!pinia) {
      throw new TypeError('expected browser test pinia')
    }

    return { pinia }
  }

  function getFavoriteButton(commandName: string, actionName: string): HTMLButtonElement {
    const commandCard = [...document.querySelectorAll<HTMLButtonElement>('button')]
      .find(button => button.textContent?.trim() === commandName)
      ?.parentElement
    const favoriteButton = [...commandCard?.querySelectorAll<HTMLButtonElement>('button') ?? []]
      .find(button => button.getAttribute('aria-label') === actionName)
    if (!favoriteButton) {
      throw new TypeError(`expected favorite button for ${commandName}`)
    }
    return favoriteButton
  }

  it('渲染分类标签栏', async () => {
    renderCommandPanel()

    const allTab = page.getByRole('button', {
      name: 'all-category',
      exact: true,
    })
    await expect.element(allTab).toBeVisible()

    const favoritesTab = page.getByRole('button', {
      name: 'favorites-category',
      exact: true,
    })
    await expect.element(favoritesTab).toBeVisible()
    await expect.element(favoritesTab).toHaveAttribute('aria-pressed', 'false')
    await favoritesTab.click()
    await expect.element(favoritesTab).toHaveAttribute('aria-pressed', 'true')

    const groupsTab = page.getByRole('button', {
      name: 'groups-category',
      exact: true,
    })
    await expect.element(groupsTab).toBeVisible()
  })

  it('点击分类标签切换视图', async () => {
    const { pinia } = renderCommandPanel()

    // 默认 activeCategory 为 'all'
    const store = useCommandPanelStore(pinia)
    expect(store.activeCategory).toBe('all')

    const groupsTab = page.getByRole('button', {
      name: 'groups-category',
      exact: true,
    })
    await groupsTab.click()

    expect(store.activeCategory).toBe('groups')
  })

  it('可以跨分类添加、取消并重新添加常用命令', async () => {
    const { pinia } = renderCommandPanel()
    const store = useCommandPanelStore(pinia)

    const addDialogueFavorite = getFavoriteButton('dialogue-command', '将此语句加入常用')
    expect(addDialogueFavorite).toHaveAttribute('aria-pressed', 'false')

    await userEvent.click(addDialogueFavorite)
    await userEvent.click(getFavoriteButton('film-mode-command', '将此语句加入常用'))
    expect(store.isFavorite(commandType.say)).toBe(true)
    expect(store.isFavorite(commandType.filmMode)).toBe(true)
    expect(addDialogueFavorite).toHaveAttribute('aria-label', '将此语句移出常用')
    expect(addDialogueFavorite).toHaveAttribute('aria-pressed', 'true')

    await page.getByRole('button', { name: 'favorites-category', exact: true }).click()
    await expect.element(page.getByRole('button', { name: 'dialogue-command', exact: true })).toBeVisible()
    await expect.element(page.getByRole('button', { name: 'film-mode-command', exact: true })).toBeVisible()

    await userEvent.click(getFavoriteButton('dialogue-command', '将此语句移出常用'))
    expect(store.isFavorite(commandType.say)).toBe(false)

    await page.getByRole('button', { name: 'perform-category', exact: true }).click()
    await userEvent.click(getFavoriteButton('dialogue-command', '将此语句加入常用'))
    await page.getByRole('button', { name: 'favorites-category', exact: true }).click()

    expect(store.isFavorite(commandType.say)).toBe(true)
    expect(store.isFavorite(commandType.filmMode)).toBe(true)
    await expect.element(page.getByRole('button', { name: 'dialogue-command', exact: true })).toBeVisible()
    await expect.element(page.getByRole('button', { name: 'film-mode-command', exact: true })).toBeVisible()
  })

  it('常用列表为空或只包含失效项时显示稳定空状态', async () => {
    const { pinia } = renderCommandPanel()
    const store = useCommandPanelStore(pinia)
    store.favoriteCommandIds = ['removed-command']
    store.setActiveCategory('favorites')
    await nextTick()

    const emptyState = page.getByRole('status')
    await expect.element(emptyState).toBeVisible()
    await expect.element(emptyState).toHaveTextContent('no-favorite-commands')
  })

  it('从常用分类点击命令卡片会发出 insertCommand 事件', async () => {
    const onInsertCommand = vi.fn()

    const { pinia } = renderInBrowser(CommandPanel, {
      browser: createCommandPanelBrowserOptions(),
      props: {
        onInsertCommand,
      },
      global: {
        stubs: globalStubs,
      },
    })
    if (!pinia) {
      throw new TypeError('expected browser test pinia')
    }
    const store = useCommandPanelStore(pinia)
    store.toggleFavorite(commandType.say)
    store.setActiveCategory('favorites')
    await nextTick()

    await page.getByRole('button', { name: 'dialogue-command', exact: true }).click()

    expect(onInsertCommand).toHaveBeenCalledWith(commandType.say)
  })

  it('命令卡片拖拽会使用当前用户默认值生成 payload', () => {
    const { pinia } = renderCommandPanel()
    const store = useCommandPanelStore(pinia)
    store.saveDefault(commandType.say, 'say:custom;')
    const getData = lastDragSourceOptions.value?.getData

    const element = document.createElement('div')
    element.dataset.commandPanelDragKind = 'command'
    element.dataset.commandPanelCommandType = String(commandType.say)
    element.dataset.commandPanelDragLabel = 'dialogue-command'

    expect(getData?.(element)).toEqual({
      label: 'dialogue-command',
      rawTexts: ['say:custom;'],
      source: 'command-panel',
      type: 'command-panel-statement',
    })
  })

  it('语句组卡片拖拽会生成语句组 payload', () => {
    const { pinia } = renderCommandPanel()
    const store = useCommandPanelStore(pinia)
    const group = store.saveGroup({
      name: 'My Group',
      rawTexts: ['say:hello;', 'bgm:theme.ogg;'],
    })
    const getData = lastDragSourceOptions.value?.getData

    const element = document.createElement('div')
    element.dataset.commandPanelDragKind = 'group'
    element.dataset.commandPanelGroupId = group.id
    element.dataset.commandPanelDragLabel = group.name

    expect(getData?.(element)).toEqual({
      label: 'My Group',
      rawTexts: ['say:hello;', 'bgm:theme.ogg;'],
      source: 'command-panel',
      type: 'command-panel-statement',
    })
  })

  it('点击命令默认值按钮会打开默认值模态框', async () => {
    renderCommandPanel()

    await page.getByTitle('edit-defaults').first().click()

    expect(modalOpenMock).toHaveBeenCalledWith('CommandDefaultsModal', expect.objectContaining({
      type: expect.any(Number),
    }))
  })

  it('在语句组视图删除组后会更新 store', async () => {
    const { pinia } = renderCommandPanel()
    const store = useCommandPanelStore(pinia)

    const group = store.saveGroup({
      name: 'My Group',
      rawTexts: ['say:hello', 'changeBg:bg.jpg'],
    })
    store.setActiveCategory('groups')

    await page.getByTitle('delete-action').click()
    await page.getByRole('button', { name: 'delete-action', exact: true }).nth(1).click()

    expect(store.groups.find(item => item.id === group.id)).toBeUndefined()
  })
})
