import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'

import {
  createBrowserActionStub,
  createBrowserClickStub,
  createBrowserContainerStub,
  renderInBrowser,
} from '~/__tests__/browser-render'
import { useCommandPanelStore } from '~/stores/command-panel'

const { modalOpenMock, useModalStoreMock } = vi.hoisted(() => ({
  modalOpenMock: vi.fn(),
  useModalStoreMock: vi.fn(),
}))

vi.mock('~/stores/modal', () => ({
  useModalStore: useModalStoreMock,
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
                groups: 'groups-category',
              },
              confirmDeleteGroup: 'confirm-delete-group',
              editDefaults: 'edit-defaults',
            },
            commands: {
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
    useModalStoreMock.mockReturnValue({
      open: modalOpenMock,
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

  it('渲染分类标签栏', async () => {
    renderCommandPanel()

    const allTab = page.getByRole('button', {
      name: 'all-category',
      exact: true,
    })
    await expect.element(allTab).toBeVisible()

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

  it('点击命令卡片会发出 insertCommand 事件', async () => {
    const onInsertCommand = vi.fn()

    renderInBrowser(CommandPanel, {
      browser: createCommandPanelBrowserOptions(),
      props: {
        onInsertCommand,
      },
      global: {
        stubs: globalStubs,
      },
    })

    await page.getByRole('button', { name: 'dialogue-command' }).click()

    expect(onInsertCommand).toHaveBeenCalledWith(expect.any(Number))
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
