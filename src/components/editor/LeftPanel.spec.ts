import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import { defineComponent, h, reactive } from 'vue'

import { createBrowserContainerStub, createBrowserTextStub, renderInBrowser } from '~/__tests__/browser-render'

const {
  usePreferenceStoreMock,
} = vi.hoisted(() => ({
  usePreferenceStoreMock: vi.fn(),
}))

vi.mock('~/stores/preference', () => ({
  usePreferenceStore: usePreferenceStoreMock,
}))

vi.mock('~/components/ui/resizable', () => {
  const ResizablePanel = defineComponent({
    name: 'MockResizablePanel',
    setup(_, { slots }) {
      return () => h('div', slots.default?.({
        isCollapsed: false,
      }))
    },
  })

  return {
    ResizablePanel,
  }
})

import LeftPanel from './LeftPanel.vue'

const globalStubs = {
  AssetPanel: createBrowserTextStub('StubAssetPanel', 'Asset Panel'),
  PreviewPanel: createBrowserTextStub('StubPreviewPanel', 'Preview Panel'),
  ResizableHandle: createBrowserTextStub('StubResizableHandle', 'Resize Handle'),
  ResizablePanelGroup: createBrowserContainerStub('StubResizablePanelGroup'),
  ScenePanel: createBrowserTextStub('StubScenePanel', 'Scene Panel'),
  Tabs: createBrowserContainerStub('StubTabs'),
  TabsList: createBrowserContainerStub('StubTabsList'),
  TabsTrigger: createBrowserContainerStub('StubTabsTrigger', 'button'),
}

describe('LeftPanel', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  beforeEach(() => {
    usePreferenceStoreMock.mockReset()
  })

  it('场景模式下会显示预览面板和场景面板', async () => {
    usePreferenceStoreMock.mockReturnValue(reactive({
      leftPanelView: 'scene',
    }))

    renderInBrowser(LeftPanel, {
      global: {
        stubs: globalStubs,
      },
    })

    await expect.element(page.getByText('Preview Panel')).toBeVisible()
    await expect.element(page.getByText('Scene Panel')).toBeVisible()
    await expect.element(page.getByText('Asset Panel')).not.toBeVisible()
  })

  it('资源模式下会显示资源面板而不是场景面板', async () => {
    usePreferenceStoreMock.mockReturnValue(reactive({
      leftPanelView: 'resource',
    }))

    renderInBrowser(LeftPanel, {
      global: {
        stubs: globalStubs,
      },
    })

    await expect.element(page.getByText('Preview Panel')).toBeVisible()
    await expect.element(page.getByText('Asset Panel')).toBeVisible()
    await expect.element(page.getByText('Scene Panel')).not.toBeVisible()
  })
})
