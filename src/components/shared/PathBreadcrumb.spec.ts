import { describe, expect, it } from 'vitest'
import { page } from 'vitest/browser'
import { defineComponent, h } from 'vue'

import {
  createBrowserContainerStub,
  renderInBrowser,
} from '~/__tests__/browser-render'

import PathBreadcrumb from './PathBreadcrumb.vue'

const globalStubs = {
  Breadcrumb: createBrowserContainerStub('StubBreadcrumb'),
  BreadcrumbItem: createBrowserContainerStub('StubBreadcrumbItem'),
  BreadcrumbLink: createBrowserContainerStub('StubBreadcrumbLink', 'span'),
  BreadcrumbList: createBrowserContainerStub('StubBreadcrumbList'),
  BreadcrumbPage: createBrowserContainerStub('StubBreadcrumbPage', 'span'),
  BreadcrumbSeparator: createBrowserContainerStub('StubBreadcrumbSeparator', 'span'),
  DropdownMenu: createBrowserContainerStub('StubDropdownMenu'),
  DropdownMenuContent: createBrowserContainerStub('StubDropdownMenuContent'),
  DropdownMenuItem: createBrowserContainerStub('StubDropdownMenuItem', 'button'),
  DropdownMenuTrigger: createBrowserContainerStub('StubDropdownMenuTrigger', 'span'),
}

const TestHarness = defineComponent({
  name: 'PathBreadcrumbTestHarness',
  setup() {
    return () => h('div', [
      h(PathBreadcrumb, {
        currentPath: '',
        rootPath: '',
      }),
      h('div', { 'data-testid': 'sentinel' }, 'ok'),
    ])
  },
})

describe('PathBreadcrumb', () => {
  it('rootPath 为空时不会抛错', async () => {
    renderInBrowser(TestHarness, {
      global: {
        stubs: globalStubs,
      },
    })

    await expect.element(page.getByTestId('sentinel')).toBeVisible()
  })
})
