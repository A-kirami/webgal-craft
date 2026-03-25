/* eslint-disable vue/one-component-per-file */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import { render } from 'vitest-browser-vue'
import { defineComponent, h } from 'vue'

import { createBrowserTestPlugins } from '~/__tests__/browser'
import { useCommandPanelStore } from '~/stores/command-panel'

const { modalOpenMock, useModalStoreMock } = vi.hoisted(() => ({
  modalOpenMock: vi.fn(),
  useModalStoreMock: vi.fn(),
}))

vi.mock('~/stores/modal', () => ({
  useModalStore: useModalStoreMock,
}))

import CommandPanel from './CommandPanel.vue'

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
  CommandPanelCard: defineComponent({
    name: 'StubCommandPanelCard',
    props: {
      title: {
        type: String,
        required: true,
      },
    },
    emits: ['click'],
    setup(props, { emit, slots }) {
      return () => h('div', [
        h('button', {
          type: 'button',
          onClick: () => emit('click'),
        }, props.title),
        h('div', slots.actions?.()),
        h('div', slots.tooltip?.()),
      ])
    },
  }),
  Popover: createStubContainer('StubPopover'),
  PopoverContent: createStubContainer('StubPopoverContent'),
  PopoverTrigger: createStubContainer('StubPopoverTrigger'),
  ScrollArea: createStubContainer('StubScrollArea'),
  ScrollBar: createStubContainer('StubScrollBar'),
  Separator: createStubContainer('StubSeparator'),
  Tooltip: createStubContainer('StubTooltip'),
  TooltipContent: createStubContainer('StubTooltipContent'),
  TooltipProvider: createStubContainer('StubTooltipProvider'),
  TooltipTrigger: createStubContainer('StubTooltipTrigger'),
}

function createCommandPanelPlugins() {
  return createBrowserTestPlugins({
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
  })
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
    const { pinia, plugins } = createCommandPanelPlugins()

    render(CommandPanel, {
      global: {
        plugins,
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

    render(CommandPanel, {
      props: {
        onInsertCommand,
      },
      global: {
        plugins: createCommandPanelPlugins().plugins,
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
