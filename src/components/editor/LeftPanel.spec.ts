import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import { computed, defineComponent, h, nextTick, reactive } from 'vue'

import { createBrowserContainerStub, createBrowserTextStub, renderInBrowser } from '~/__tests__/browser-render'

const {
  collapsePreviewPanelMock,
  expandPreviewPanelMock,
  resizablePanelInitialState,
  usePreferenceStoreMock,
} = vi.hoisted(() => ({
  collapsePreviewPanelMock: vi.fn(),
  expandPreviewPanelMock: vi.fn(),
  resizablePanelInitialState: {
    isCollapsed: false,
  },
  usePreferenceStoreMock: vi.fn(),
}))

vi.mock('~/stores/preference', () => ({
  usePreferenceStore: usePreferenceStoreMock,
}))

vi.mock('~/components/ui/resizable', () => {
  const ResizablePanel = defineComponent({
    name: 'MockResizablePanel',
    props: {
      collapsible: {
        type: Boolean,
        required: false,
      },
    },
    emits: ['collapse', 'expand'],
    setup(props, { emit, expose, slots }) {
      const state = reactive({
        isCollapsed: resizablePanelInitialState.isCollapsed,
      })

      function collapse() {
        state.isCollapsed = true
        if (props.collapsible) {
          collapsePreviewPanelMock()
        }
        emit('collapse')
      }

      function expand() {
        state.isCollapsed = false
        if (props.collapsible) {
          expandPreviewPanelMock()
        }
        emit('expand')
      }

      expose({
        collapse,
        expand,
        isCollapsed: computed(() => state.isCollapsed),
      })

      return () => h('div', slots.default?.({
        isCollapsed: state.isCollapsed,
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
    collapsePreviewPanelMock.mockReset()
    expandPreviewPanelMock.mockReset()
    resizablePanelInitialState.isCollapsed = false
    usePreferenceStoreMock.mockReset()
  })

  it('关闭预览面板时不会渲染 PreviewPanel', async () => {
    usePreferenceStoreMock.mockReturnValue(reactive({
      leftPanelView: 'scene',
      showPreviewPanel: false,
    }))

    renderInBrowser(LeftPanel, {
      global: {
        stubs: globalStubs,
      },
    })

    await expect.element(page.getByText('Preview Panel')).not.toBeInTheDocument()
    await expect.element(page.getByText('Scene Panel')).toBeVisible()
  })

  it('场景模式下会显示预览面板和场景面板', async () => {
    usePreferenceStoreMock.mockReturnValue(reactive({
      leftPanelView: 'scene',
      showPreviewPanel: true,
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
      showPreviewPanel: true,
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

  it('关闭预览偏好时会折叠预览面板实例', async () => {
    const preferenceStore = reactive({
      leftPanelView: 'scene',
      showPreviewPanel: true,
    })
    usePreferenceStoreMock.mockReturnValue(preferenceStore)

    renderInBrowser(LeftPanel, {
      global: {
        stubs: globalStubs,
      },
    })

    preferenceStore.showPreviewPanel = false
    await nextTick()
    await nextTick()

    expect(collapsePreviewPanelMock).toHaveBeenCalledOnce()
  })

  it('初始已折叠且偏好为显示时会展开预览面板实例', async () => {
    resizablePanelInitialState.isCollapsed = true
    usePreferenceStoreMock.mockReturnValue(reactive({
      leftPanelView: 'scene',
      showPreviewPanel: true,
    }))

    renderInBrowser(LeftPanel, {
      global: {
        stubs: globalStubs,
      },
    })

    await nextTick()
    await nextTick()

    expect(expandPreviewPanelMock).toHaveBeenCalledOnce()
  })
})
