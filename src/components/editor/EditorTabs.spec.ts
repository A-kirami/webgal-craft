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
  useEditorDiagnosticsStoreMock,
  useModalStoreMock,
  useTabsStoreMock,
} = vi.hoisted(() => ({
  modalOpenMock: vi.fn(),
  saveFileMock: vi.fn(),
  useEditorStoreMock: vi.fn(),
  useEditorDiagnosticsStoreMock: vi.fn(),
  useModalStoreMock: vi.fn(),
  useTabsStoreMock: vi.fn(),
}))

vi.mock('~/stores/editor', () => ({
  useEditorStore: useEditorStoreMock,
}))

vi.mock('~/stores/editor-diagnostics', () => ({
  useEditorDiagnosticsStore: useEditorDiagnosticsStoreMock,
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
    useEditorDiagnosticsStoreMock.mockReset()
    useModalStoreMock.mockReset()
    useTabsStoreMock.mockReset()

    useEditorStoreMock.mockReturnValue({
      saveFile: saveFileMock,
    })
    useEditorDiagnosticsStoreMock.mockReturnValue({
      getHighestSeverity: vi.fn(() => undefined),
    })
    useModalStoreMock.mockReturnValue({
      open: modalOpenMock,
    })
  })

  it('按文档最高问题等级只给标签名称着色', async () => {
    useTabsStoreMock.mockReturnValue(createTabsStore([
      {
        activeAt: 1,
        isPreview: false,
        name: 'warning.txt',
        path: AbsPath.from('/project/warning.txt'),
      },
      {
        activeAt: 2,
        isPreview: false,
        name: 'error.txt',
        path: AbsPath.from('/project/error.txt'),
      },
      {
        activeAt: 3,
        isPreview: false,
        name: 'clean.txt',
        path: AbsPath.from('/project/clean.txt'),
      },
    ]))
    useEditorDiagnosticsStoreMock.mockReturnValue({
      getHighestSeverity: (path: AbsPath) => {
        if (path.endsWith('/warning.txt')) {
          return 'warning'
        }
        if (path.endsWith('/error.txt')) {
          return 'error'
        }
      },
    })

    renderInBrowser(EditorTabs, { global: {} })

    const warning = page.getByText('warning.txt').element().closest('[data-diagnostic-severity]')
    const error = page.getByText('error.txt').element().closest('[data-diagnostic-severity]')
    const clean = page.getByText('clean.txt').element().closest('[data-diagnostic-severity]')

    expect(warning).toHaveAttribute('data-diagnostic-severity', 'warning')
    expect(warning).toHaveClass('text-yellow-700')
    expect(error).toHaveAttribute('data-diagnostic-severity', 'error')
    expect(error).toHaveClass('text-destructive')
    expect(clean).toBeNull()

    const warningTab = document.querySelector<HTMLElement>('[data-testid="editor-tab-/project/warning.txt"]')
    const errorTab = document.querySelector<HTMLElement>('[data-testid="editor-tab-/project/error.txt"]')
    expect(warningTab?.querySelector('.lucide-file-text')).not.toHaveClass('text-yellow-700')
    expect(errorTab?.querySelector('.lucide-file-text')).not.toHaveClass('text-destructive')
    expect(errorTab?.querySelector('.lucide-x')).not.toHaveClass('text-destructive')
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

  it('同名标签会显示足以区分文件的父目录提示', () => {
    useTabsStoreMock.mockReturnValue(createTabsStore([
      {
        activeAt: 1,
        isPreview: false,
        name: 'scene.txt',
        path: AbsPath.from('/project/scenes/scene.txt'),
      },
      {
        activeAt: 2,
        isPreview: false,
        name: 'scene.txt',
        path: AbsPath.from('/project/assets/scene.txt'),
      },
      {
        activeAt: 3,
        isPreview: false,
        name: 'other.txt',
        path: AbsPath.from('/project/other.txt'),
      },
    ]))

    renderInBrowser(EditorTabs, { global: {} })

    const scenesTab = document.querySelector<HTMLElement>('[data-testid="editor-tab-/project/scenes/scene.txt"]')
    const assetsTab = document.querySelector<HTMLElement>('[data-testid="editor-tab-/project/assets/scene.txt"]')
    const otherTab = document.querySelector<HTMLElement>('[data-testid="editor-tab-/project/other.txt"]')

    const scenesPathHint = scenesTab?.querySelector('[data-editor-tab-path-hint]')
    const assetsPathHint = assetsTab?.querySelector('[data-editor-tab-path-hint]')

    expect(scenesTab?.querySelector('.text-13px')).toBeTruthy()
    expect(scenesPathHint).toHaveTextContent('.../scenes')
    expect(scenesPathHint).toHaveClass('text-[11.7px]')
    expect(assetsPathHint).toHaveTextContent('.../assets')
    expect(assetsPathHint).toHaveClass('text-[11.7px]')
    expect(otherTab?.querySelector('[data-editor-tab-path-hint]')).toBeNull()
  })

  it('根目录文档使用归一化的当前目录提示', () => {
    useTabsStoreMock.mockReturnValue(createTabsStore([
      {
        activeAt: 1,
        isPreview: false,
        name: 'test.txt',
        path: AbsPath.from('/test.txt'),
      },
      {
        activeAt: 2,
        isPreview: false,
        name: 'test.txt',
        path: AbsPath.from('/x/test.txt'),
      },
    ]))

    renderInBrowser(EditorTabs, { global: {} })

    const rootTab = document.querySelector<HTMLElement>('[data-testid="editor-tab-/test.txt"]')
    const nestedTab = document.querySelector<HTMLElement>('[data-testid="editor-tab-/x/test.txt"]')

    expect(rootTab?.querySelector('[data-editor-tab-path-hint]')).toHaveTextContent('./')
    expect(nestedTab?.querySelector('[data-editor-tab-path-hint]')).toHaveTextContent('.../x')
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
