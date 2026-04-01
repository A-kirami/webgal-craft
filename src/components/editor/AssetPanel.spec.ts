import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import { defineComponent, h, reactive } from 'vue'

import {
  createBrowserClickStub,
  createBrowserContainerStub,
  createBrowserEmitStub,
  createBrowserInputStub,
  renderInBrowser,
} from '~/__tests__/browser-render'

import AssetPanel from './AssetPanel.vue'

const {
  createFileInCurrentDirectoryMock,
  createFolderInCurrentDirectoryMock,
  usePreferenceStoreMock,
} = vi.hoisted(() => ({
  createFileInCurrentDirectoryMock: vi.fn(),
  createFolderInCurrentDirectoryMock: vi.fn(),
  usePreferenceStoreMock: vi.fn(),
}))

function createAssetViewStub() {
  return defineComponent({
    name: 'StubAssetView',
    setup(_, { expose }) {
      expose({
        createFileInCurrentDirectory: createFileInCurrentDirectoryMock,
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

vi.mock('~/stores/preference', () => ({
  usePreferenceStore: usePreferenceStoreMock,
}))

describe('AssetPanel', () => {
  beforeEach(() => {
    createFileInCurrentDirectoryMock.mockReset()
    createFolderInCurrentDirectoryMock.mockReset()
    usePreferenceStoreMock.mockReset()
    usePreferenceStoreMock.mockReturnValue(reactive({
      assetSortBy: 'name',
      assetSortOrder: 'asc',
      assetTab: 'background',
      assetViewMode: 'grid',
      assetZoom: [100],
    }))
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

  it('animation 标签页的创建菜单会显示并调用新建文件入口', async () => {
    usePreferenceStoreMock.mockReturnValue(reactive({
      assetSortBy: 'name',
      assetSortOrder: 'asc',
      assetTab: 'animation',
      assetViewMode: 'grid',
      assetZoom: [100],
    }))

    renderInBrowser(AssetPanel, {
      global: {
        stubs: globalStubs,
      },
    })

    await page.getByRole('button', { name: 'common.create' }).click()
    await page.getByRole('button', { name: 'edit.fileTree.newFile' }).click()

    expect(createFileInCurrentDirectoryMock).toHaveBeenCalledTimes(1)
  })

  it('background 标签页的创建菜单不会显示新建文件入口', async () => {
    renderInBrowser(AssetPanel, {
      global: {
        stubs: globalStubs,
      },
    })

    await page.getByRole('button', { name: 'common.create' }).click()

    await expect.element(page.getByRole('button', { name: 'edit.fileTree.newFile' })).not.toBeInTheDocument()
    await expect.element(page.getByRole('button', { name: 'edit.fileTree.newFolder' })).toBeVisible()
  })
})
