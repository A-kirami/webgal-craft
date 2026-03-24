/* eslint-disable vue/one-component-per-file */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import { render } from 'vitest-browser-vue'
import { defineComponent, h, reactive } from 'vue'
import { createI18n } from 'vue-i18n'

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

function createTestI18n() {
  return createI18n({
    legacy: false,
    locale: 'en',
    missingWarn: false,
    fallbackWarn: false,
    missing: (_locale, key) => key,
  })
}

const globalStubs = {
  AssetPanel: defineComponent({
    name: 'StubAssetPanel',
    setup() {
      return () => h('div', 'Asset Panel')
    },
  }),
  PreviewPanel: defineComponent({
    name: 'StubPreviewPanel',
    setup() {
      return () => h('div', 'Preview Panel')
    },
  }),
  ResizableHandle: defineComponent({
    name: 'StubResizableHandle',
    setup() {
      return () => h('div', 'Resize Handle')
    },
  }),
  ResizablePanelGroup: defineComponent({
    name: 'StubResizablePanelGroup',
    setup(_, { slots }) {
      return () => h('div', slots.default?.())
    },
  }),
  ScenePanel: defineComponent({
    name: 'StubScenePanel',
    setup() {
      return () => h('div', 'Scene Panel')
    },
  }),
  Tabs: defineComponent({
    name: 'StubTabs',
    props: {
      modelValue: {
        default: undefined,
        type: String,
        required: false,
      },
    },
    setup(_, { slots }) {
      return () => h('div', slots.default?.())
    },
  }),
  TabsList: defineComponent({
    name: 'StubTabsList',
    setup(_, { slots }) {
      return () => h('div', slots.default?.())
    },
  }),
  TabsTrigger: defineComponent({
    name: 'StubTabsTrigger',
    props: {
      value: {
        default: undefined,
        type: String,
        required: false,
      },
    },
    setup(props, { slots }) {
      return () => h('button', {
        'type': 'button',
        'data-value': props.value,
      }, slots.default?.())
    },
  }),
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

    render(LeftPanel, {
      global: {
        plugins: [createTestI18n()],
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

    render(LeftPanel, {
      global: {
        plugins: [createTestI18n()],
        stubs: globalStubs,
      },
    })

    await expect.element(page.getByText('Preview Panel')).toBeVisible()
    await expect.element(page.getByText('Asset Panel')).toBeVisible()
    await expect.element(page.getByText('Scene Panel')).not.toBeVisible()
  })
})
