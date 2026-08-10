import { describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'

import {
  createBrowserClickStub,
  createBrowserContainerStub,
  renderInBrowser,
} from '~/__tests__/browser-render'

import EditorTabContextMenu from './EditorTabContextMenu.vue'

const globalStubs = {
  ContextMenu: createBrowserContainerStub('StubContextMenu'),
  ContextMenuContent: createBrowserContainerStub('StubContextMenuContent'),
  ContextMenuItem: createBrowserClickStub('StubContextMenuItem'),
  ContextMenuSeparator: createBrowserContainerStub('StubContextMenuSeparator', 'hr'),
  ContextMenuTrigger: createBrowserContainerStub('StubContextMenuTrigger'),
}

describe('EditorTabContextMenu', () => {
  it('会展示全部操作并发出对应动作', async () => {
    const onAction = vi.fn()

    renderInBrowser(EditorTabContextMenu, {
      props: {
        canCloseOthers: true,
        canCloseRight: true,
        canCloseSaved: true,
        canViewHistory: true,
        onAction,
      },
      global: {
        stubs: globalStubs,
      },
    })

    const actions = [
      ['edit.editorTabs.close', 'close'],
      ['edit.editorTabs.closeOthers', 'closeOthers'],
      ['edit.editorTabs.closeSaved', 'closeSaved'],
      ['edit.editorTabs.closeAll', 'closeAll'],
      ['edit.editorTabs.closeRight', 'closeRight'],
      ['edit.editorTabs.viewHistory', 'viewHistory'],
      ['edit.editorTabs.revealInExplorer', 'revealInExplorer'],
    ] as const

    for (const [label, action] of actions) {
      // eslint-disable-next-line no-await-in-loop -- 按菜单顺序逐项点击，验证每个 action 的映射。
      await page.getByRole('button', { name: label, exact: true }).click()
      expect(onAction).toHaveBeenLastCalledWith(action)
    }
  })

  it('没有对应标签时会禁用相对关闭操作，并隐藏历史版本入口', async () => {
    renderInBrowser(EditorTabContextMenu, {
      props: {
        canCloseOthers: false,
        canCloseRight: false,
        canCloseSaved: false,
        canViewHistory: false,
      },
      global: {
        stubs: globalStubs,
      },
    })

    await expect.element(page.getByText('edit.editorTabs.closeOthers')).toBeDisabled()
    await expect.element(page.getByText('edit.editorTabs.closeSaved')).toBeDisabled()
    await expect.element(page.getByText('edit.editorTabs.closeRight')).toBeDisabled()
    expect(page.getByText('edit.editorTabs.viewHistory').query()).toBeNull()
  })
})
