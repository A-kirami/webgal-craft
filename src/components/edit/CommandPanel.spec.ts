import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import { render } from 'vitest-browser-vue'

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
    const { pinia, plugins } = createBrowserTestPlugins({ pinia: true })

    render(CommandPanel, {
      global: {
        plugins,
      },
    })

    if (!pinia) {
      throw new TypeError('expected browser test pinia')
    }

    return { pinia }
  }

  it('渲染分类标签栏', async () => {
    renderCommandPanel()

    // "全部" 标签应始终存在
    const allTab = page.getByRole('button', {
      name: 'edit.visualEditor.commandPanel.categories.all',
    })
    await expect.element(allTab).toBeVisible()

    // 语句组标签
    const groupsTab = page.getByRole('button', {
      name: 'edit.visualEditor.commandPanel.categories.groups',
    })
    await expect.element(groupsTab).toBeVisible()
  })

  it('点击分类标签切换视图', async () => {
    const { pinia } = renderCommandPanel()

    // 默认 activeCategory 为 'all'
    const store = useCommandPanelStore(pinia)
    expect(store.activeCategory).toBe('all')

    // 点击 "语句组" 标签
    const groupsTab = page.getByRole('button', {
      name: 'edit.visualEditor.commandPanel.categories.groups',
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
        plugins: createBrowserTestPlugins({ pinia: true }).plugins,
      },
    })

    await page.getByRole('button', { name: 'edit.visualEditor.commands.say' }).click()

    expect(onInsertCommand).toHaveBeenCalledWith(expect.any(Number))
  })

  it('点击命令默认值按钮会打开默认值模态框', async () => {
    renderCommandPanel()

    await page.getByTitle('edit.visualEditor.commandPanel.editDefaults').first().click()

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

    await page.getByTitle('common.delete').click()
    await page.getByText('common.delete').click()

    expect(store.groups.find(item => item.id === group.id)).toBeUndefined()
  })
})
