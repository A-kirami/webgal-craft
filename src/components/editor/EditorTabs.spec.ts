import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import { reactive } from 'vue'

import { renderInBrowser } from '~/__tests__/browser-render'
import { AbsPath } from '~/domain/path'

import EditorTabs from './EditorTabs.vue'

import type { Tab } from '~/stores/tabs'

function createPointerEvent(type: string, overrides: PointerEventInit = {}): PointerEvent {
  return new PointerEvent(type, {
    bubbles: true,
    button: 0,
    buttons: type === 'pointerup' || type === 'pointercancel' ? 0 : 1,
    cancelable: true,
    isPrimary: true,
    pointerId: 1,
    pointerType: 'mouse',
    ...overrides,
  })
}

function setRect(element: HTMLElement, rect: DOMRect) {
  Object.defineProperty(element, 'getBoundingClientRect', {
    configurable: true,
    value: () => rect,
  })
}

function createRect(left: number, width: number): DOMRect {
  return {
    bottom: 32,
    height: 32,
    left,
    right: left + width,
    top: 0,
    width,
    x: left,
    y: 0,
    toJSON: () => ({}),
  }
}

function prepareTabRects(paths: readonly string[] = ['/project/a.txt', '/project/b.txt', '/project/c.txt']) {
  const tabElements = paths.map(path => document.querySelector<HTMLElement>(`[data-testid="editor-tab-${CSS.escape(path)}"]`))

  for (const [index, element] of tabElements.entries()) {
    expect(element).not.toBeNull()
    setRect(element!, createRect(index * 100, 100))
  }

  const viewport = tabElements[0]?.closest('[data-reka-scroll-area-viewport]') as HTMLElement | null
  if (viewport) {
    setRect(viewport, createRect(0, 300))
    viewport.scrollLeft = 0
  }

  return tabElements as HTMLElement[]
}

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
      return store.activeTabIndex >= 0 ? store.tabs[store.activeTabIndex] : undefined
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
    findTabIndex: vi.fn((path: AbsPath) => store.tabs.findIndex(tab => tab.path === path)),
    fixPreviewTab: vi.fn((index: number) => {
      if (store.tabs[index]) {
        store.tabs[index].isPreview = false
      }
    }),
    reorderTab: vi.fn((fromIndex: number, toIndex: number) => {
      const [tab] = store.tabs.splice(fromIndex, 1)
      store.tabs.splice(toIndex, 0, tab)
      if (tab?.isPreview) {
        tab.isPreview = false
        store.shouldFocusEditor = true
      }
      if (store.activeTabIndex === fromIndex) {
        store.activeTabIndex = toIndex
      } else if (fromIndex < store.activeTabIndex && toIndex >= store.activeTabIndex) {
        store.activeTabIndex--
      } else if (fromIndex > store.activeTabIndex && toIndex <= store.activeTabIndex) {
        store.activeTabIndex++
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
    useTabsStoreMock.mockReturnValue(createTabsStore([
      {
        activeAt: 1,
        isModified: true,
        isPreview: false,
        name: 'demo.txt',
        path: AbsPath.from('/project/demo.txt'),
      },
    ]))

    renderInBrowser(EditorTabs, {
      global: {},
    })

    await page.getByText('demo.txt').click({ button: 'middle' })

    expect(modalOpenMock).toHaveBeenCalledWith('SaveChangesModal', expect.objectContaining({
      onDontSave: expect.any(Function),
      onSave: expect.any(Function),
      title: expect.any(String),
    }))
  })

  it('双击预览标签会将其固定为普通标签', async () => {
    const tabsStore = createTabsStore([
      {
        activeAt: 1,
        isPreview: true,
        name: 'preview.txt',
        path: AbsPath.from('/project/preview.txt'),
      },
    ])

    useTabsStoreMock.mockReturnValue(tabsStore)

    renderInBrowser(EditorTabs, {
      global: {},
    })

    await page.getByText('preview.txt').click({ clickCount: 2 })

    expect(tabsStore.fixPreviewTab).toHaveBeenCalledWith(0)
    expect(tabsStore.tabs[0].isPreview).toBe(false)
  })

  it('中键关闭未修改标签会直接关闭标签', async () => {
    const tabsStore = createTabsStore([
      {
        activeAt: 1,
        isModified: false,
        isPreview: false,
        name: 'plain.txt',
        path: AbsPath.from('/project/plain.txt'),
      },
    ])

    useTabsStoreMock.mockReturnValue(tabsStore)

    renderInBrowser(EditorTabs, {
      global: {},
    })

    await page.getByText('plain.txt').click({ button: 'middle' })

    expect(tabsStore.closeTab).toHaveBeenCalledWith(0)
    expect(modalOpenMock).not.toHaveBeenCalled()
  })

  it('拖拽标签页会按目标位置重排并保持可点击激活', async () => {
    const tabsStore = createTabsStore([
      {
        activeAt: 1,
        isPreview: false,
        name: 'a.txt',
        path: AbsPath.from('/project/a.txt'),
      },
      {
        activeAt: 2,
        isPreview: false,
        name: 'b.txt',
        path: AbsPath.from('/project/b.txt'),
      },
      {
        activeAt: 3,
        isPreview: false,
        name: 'c.txt',
        path: AbsPath.from('/project/c.txt'),
      },
    ])

    useTabsStoreMock.mockReturnValue(tabsStore)

    renderInBrowser(EditorTabs, {
      global: {},
    })

    const [firstTab] = prepareTabRects()

    firstTab.dispatchEvent(createPointerEvent('pointerdown', { clientX: 10 }))
    globalThis.dispatchEvent(createPointerEvent('pointermove', { clientX: 260 }))
    globalThis.dispatchEvent(createPointerEvent('pointerup', { clientX: 260 }))
    firstTab.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))

    await vi.waitFor(() => {
      expect(tabsStore.reorderTab).toHaveBeenCalledWith(0, 2)
    })

    expect(tabsStore.tabs.map(tab => tab.name)).toEqual(['b.txt', 'c.txt', 'a.txt'])
    expect(tabsStore.activeTab?.name).toBe('a.txt')

    await page.getByText('b.txt').click()

    expect(tabsStore.activateTab).toHaveBeenCalledWith(0)
  })

  it('拖拽预览标签后会将其固化为普通标签', async () => {
    const tabsStore = createTabsStore([
      {
        activeAt: 1,
        isPreview: false,
        name: 'a.txt',
        path: AbsPath.from('/project/a.txt'),
      },
      {
        activeAt: 2,
        isPreview: true,
        name: 'preview.txt',
        path: AbsPath.from('/project/preview.txt'),
      },
      {
        activeAt: 3,
        isPreview: false,
        name: 'c.txt',
        path: AbsPath.from('/project/c.txt'),
      },
    ], 1)

    useTabsStoreMock.mockReturnValue(tabsStore)

    renderInBrowser(EditorTabs, {
      global: {},
    })

    const [, previewTab] = prepareTabRects(['/project/a.txt', '/project/preview.txt', '/project/c.txt'])

    previewTab.dispatchEvent(createPointerEvent('pointerdown', { clientX: 110 }))
    globalThis.dispatchEvent(createPointerEvent('pointermove', { clientX: 10 }))
    globalThis.dispatchEvent(createPointerEvent('pointerup', { clientX: 10 }))

    await vi.waitFor(() => {
      expect(tabsStore.reorderTab).toHaveBeenCalledWith(1, 0)
    })

    expect(tabsStore.tabs.map(tab => [tab.name, tab.isPreview])).toEqual([
      ['preview.txt', false],
      ['a.txt', false],
      ['c.txt', false],
    ])
    expect(tabsStore.shouldFocusEditor).toBe(true)
  })
})
