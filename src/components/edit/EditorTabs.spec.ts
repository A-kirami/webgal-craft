import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import { render } from 'vitest-browser-vue'
import { reactive } from 'vue'

import { createBrowserTestI18n } from '~/__tests__/browser'

import EditorTabs from './EditorTabs.vue'

import type { Tab } from '~/stores/tabs'

const {
  modalOpenMock,
  saveFileMock,
  useEditorStoreMock,
  useModalStoreMock,
  useTabsStoreMock,
} = vi.hoisted(() => ({
  modalOpenMock: vi.fn(),
  saveFileMock: vi.fn(),
  useEditorStoreMock: vi.fn(),
  useModalStoreMock: vi.fn(),
  useTabsStoreMock: vi.fn(),
}))

vi.mock('~/stores/editor', () => ({
  useEditorStore: useEditorStoreMock,
}))

vi.mock('~/stores/modal', () => ({
  useModalStore: useModalStoreMock,
}))

vi.mock('~/stores/tabs', () => ({
  useTabsStore: useTabsStoreMock,
}))

function createTabsStore(tabs: Tab[], activeTabIndex: number = 0) {
  const store = reactive({
    tabs,
    activeTabIndex,
    shouldFocusEditor: false,
    get activeTab() {
      return this.activeTabIndex >= 0 ? this.tabs[this.activeTabIndex] : undefined
    },
    activateTab: vi.fn((index: number) => {
      store.activeTabIndex = index
    }),
    closeTab: vi.fn((index: number) => {
      store.tabs.splice(index, 1)
      if (store.activeTabIndex >= store.tabs.length) {
        store.activeTabIndex = store.tabs.length - 1
      }
    }),
    findTabIndex: vi.fn((path: string) => store.tabs.findIndex(tab => tab.path === path)),
    fixPreviewTab: vi.fn((index: number) => {
      if (store.tabs[index]) {
        store.tabs[index].isPreview = false
      }
    }),
  })

  return store
}

describe('EditorTabs', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  beforeEach(() => {
    modalOpenMock.mockReset()
    saveFileMock.mockReset()
    useEditorStoreMock.mockReset()
    useModalStoreMock.mockReset()
    useTabsStoreMock.mockReset()

    useEditorStoreMock.mockReturnValue({
      saveFile: saveFileMock,
    })
    useModalStoreMock.mockReturnValue({
      open: modalOpenMock,
    })
  })

  it('中键关闭已修改标签时会先打开保存确认模态框', async () => {
    const tabsStore = createTabsStore([
      {
        activeAt: 1,
        isModified: true,
        isPreview: false,
        name: 'demo.txt',
        path: '/project/demo.txt',
      },
    ])
    useTabsStoreMock.mockReturnValue(tabsStore)

    render(EditorTabs, {
      global: {
        plugins: [createBrowserTestI18n()],
      },
    })

    await page.getByText('demo.txt').click({ button: 'middle' })

    expect(tabsStore.closeTab).not.toHaveBeenCalled()
    expect(modalOpenMock).toHaveBeenCalledWith('SaveChangesModal', expect.objectContaining({
      onDontSave: expect.any(Function),
      onSave: expect.any(Function),
      title: 'modals.saveChanges.title',
    }))
  })

  it('双击预览标签会将其固定为普通标签', async () => {
    const tabsStore = createTabsStore([
      {
        activeAt: 1,
        isPreview: true,
        name: 'preview.txt',
        path: '/project/preview.txt',
      },
    ])

    useTabsStoreMock.mockReturnValue(tabsStore)

    render(EditorTabs, {
      global: {
        plugins: [createBrowserTestI18n()],
      },
    })

    await page.getByText('preview.txt').click({ clickCount: 2 })

    expect(tabsStore.fixPreviewTab).toHaveBeenCalledWith(0)
    expect(tabsStore.tabs[0].isPreview).toBe(false)
  })

  it('中键点击未修改标签会直接关闭标签', async () => {
    const tabsStore = createTabsStore([
      {
        activeAt: 1,
        isModified: false,
        isPreview: false,
        name: 'plain.txt',
        path: '/project/plain.txt',
      },
    ])

    useTabsStoreMock.mockReturnValue(tabsStore)

    render(EditorTabs, {
      global: {
        plugins: [createBrowserTestI18n()],
      },
    })

    await page.getByText('plain.txt').click({ button: 'middle' })

    expect(tabsStore.closeTab).toHaveBeenCalledWith(0)
    expect(modalOpenMock).not.toHaveBeenCalled()
  })
})
