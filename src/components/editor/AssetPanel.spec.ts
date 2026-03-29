import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import { defineComponent, h } from 'vue'

import {
  createBrowserClickStub,
  createBrowserContainerStub,
  createBrowserEmitStub,
  createBrowserInputStub,
  renderInBrowser,
} from '~/__tests__/browser-render'

import AssetPanel from './AssetPanel.vue'

const {
  createFolderInCurrentDirectoryMock,
} = vi.hoisted(() => ({
  createFolderInCurrentDirectoryMock: vi.fn(),
}))

function createAssetViewStub() {
  return defineComponent({
    name: 'StubAssetView',
    setup(_, { expose }) {
      expose({
        createFolderInCurrentDirectory: createFolderInCurrentDirectoryMock,
      })

      return () => h('div', { 'data-testid': 'asset-view-stub' }, 'asset-view')
    },
  })
}

const globalStubs = {
  AssetBreadcrumb: createBrowserContainerStub('StubAssetBreadcrumb'),
  AssetView: createAssetViewStub(),
  Button: createBrowserClickStub('StubButton'),
  DropdownMenu: createBrowserContainerStub('StubDropdownMenu'),
  DropdownMenuContent: createBrowserContainerStub('StubDropdownMenuContent'),
  DropdownMenuItem: createBrowserEmitStub('StubDropdownMenuItem', { eventName: 'select', tag: 'button' }),
  DropdownMenuLabel: createBrowserContainerStub('StubDropdownMenuLabel'),
  DropdownMenuSeparator: createBrowserContainerStub('StubDropdownMenuSeparator'),
  DropdownMenuTrigger: createBrowserContainerStub('StubDropdownMenuTrigger'),
  Input: createBrowserInputStub('StubInput'),
  ScrollArea: createBrowserContainerStub('StubScrollArea'),
  Slider: createBrowserContainerStub('StubSlider'),
  Tabs: createBrowserContainerStub('StubTabs'),
  TabsList: createBrowserContainerStub('StubTabsList'),
  TabsTrigger: createBrowserContainerStub('StubTabsTrigger', 'button'),
  ToggleGroup: createBrowserContainerStub('StubToggleGroup'),
  ToggleGroupItem: createBrowserContainerStub('StubToggleGroupItem', 'button'),
  Tooltip: createBrowserContainerStub('StubTooltip'),
  TooltipContent: createBrowserContainerStub('StubTooltipContent'),
  TooltipProvider: createBrowserContainerStub('StubTooltipProvider'),
  TooltipTrigger: createBrowserContainerStub('StubTooltipTrigger'),
}

describe('AssetPanel', () => {
  beforeEach(() => {
    createFolderInCurrentDirectoryMock.mockReset()
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('搜索右侧的创建菜单会调用当前 AssetView 的新建文件夹入口', async () => {
    renderInBrowser(AssetPanel, {
      global: {
        stubs: globalStubs,
      },
    })

    await page.getByRole('button', { name: 'common.create' }).click()
    await page.getByRole('button', { name: 'edit.fileTree.newFolder' }).click()

    expect(createFolderInCurrentDirectoryMock).toHaveBeenCalledTimes(1)
  })
})
