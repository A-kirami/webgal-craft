import { describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'

import {
  createBrowserClickStub,
  createBrowserContainerStub,
  createBrowserEmitStub,
  renderInBrowser,
} from '~/__tests__/browser-render'

import FilePickerToolbar from './FilePickerToolbar.vue'

const globalStubs = {
  Button: createBrowserClickStub('StubButton'),
  DropdownMenu: createBrowserContainerStub('StubDropdownMenu'),
  DropdownMenuCheckboxItem: createBrowserContainerStub('StubDropdownMenuCheckboxItem'),
  DropdownMenuContent: createBrowserContainerStub('StubDropdownMenuContent'),
  DropdownMenuLabel: createBrowserContainerStub('StubDropdownMenuLabel'),
  DropdownMenuRadioGroup: createBrowserContainerStub('StubDropdownMenuRadioGroup'),
  DropdownMenuRadioItem: createBrowserContainerStub('StubDropdownMenuRadioItem'),
  DropdownMenuSeparator: createBrowserContainerStub('StubDropdownMenuSeparator', 'hr'),
  DropdownMenuSub: createBrowserContainerStub('StubDropdownMenuSub'),
  DropdownMenuSubContent: createBrowserContainerStub('StubDropdownMenuSubContent'),
  DropdownMenuSubTrigger: createBrowserContainerStub('StubDropdownMenuSubTrigger'),
  DropdownMenuTrigger: createBrowserContainerStub('StubDropdownMenuTrigger'),
  PathBreadcrumb: createBrowserEmitStub('StubPathBreadcrumb', {
    eventName: 'navigate',
    payload: 'images/bg',
    text: 'Breadcrumb',
  }),
}

describe('FilePickerToolbar', () => {
  it('点击视图切换按钮时会更新 viewMode', async () => {
    const onUpdateViewMode = vi.fn()

    renderInBrowser(FilePickerToolbar, {
      props: {
        currentDir: 'images',
        onUpdateViewMode,
        rootPath: '/assets',
        showRecentHistory: true,
        showSupportedOnly: true,
        sortBy: 'name',
        sortOrder: 'asc',
        viewMode: 'grid',
        zoomLevel: 'medium',
      },
      global: {
        stubs: globalStubs,
      },
    })

    await page.getByRole('button', { name: 'common.view.grid' }).click()

    expect(onUpdateViewMode).toHaveBeenCalledWith('list')
  })

  it('面包屑导航时会发出 navigate 事件', async () => {
    const onNavigate = vi.fn()

    renderInBrowser(FilePickerToolbar, {
      props: {
        currentDir: 'images',
        onNavigate,
        rootPath: '/assets',
        showRecentHistory: true,
        showSupportedOnly: true,
        sortBy: 'name',
        sortOrder: 'asc',
        viewMode: 'grid',
        zoomLevel: 'medium',
      },
      global: {
        stubs: globalStubs,
      },
    })

    await page.getByRole('button', { name: 'Breadcrumb' }).click()

    expect(onNavigate).toHaveBeenCalledWith('images/bg')
  })
})
