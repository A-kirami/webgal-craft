import { createPinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import { computed, defineComponent, h, nextTick, reactive, vShow, withDirectives } from 'vue'

import { createBrowserContainerStub, renderInBrowser } from '~/__tests__/browser-render'
import { useShortcutContextRegistry } from '~/features/editor/shortcut/shortcut-context-registry'

import VisualEditorScene from './VisualEditorScene.vue'

import type { StatementEntry } from '~/domain/script/sentence'
import type { SceneVisualProjectionState } from '~/stores/editor'

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

function createVerticalRect(top: number, height: number = 48): DOMRect {
  return {
    bottom: top + height,
    height,
    left: 0,
    right: 320,
    top,
    width: 320,
    x: 0,
    y: top,
    toJSON: () => ({}),
  }
}

function createStatementEntry(id: number, rawText: string): StatementEntry {
  return {
    id,
    rawText,
    parsed: undefined,
    parseError: false,
  }
}

const {
  handleCollapsedUpdateMock,
  handlePlayToMock,
  handleSelectMock,
  handleStatementDeleteMock,
  handleStatementUpdateMock,
  measureRowElementMock,
  reorderStatementsMock,
  statementSortVirtualAdapterMock,
  useEditSettingsStoreMock,
  usePreferenceStoreMock,
  useEditorStoreMock,
  useTabsStoreMock,
  useVisualEditorSceneRuntimeMock,
} = vi.hoisted(() => ({
  handleCollapsedUpdateMock: vi.fn(),
  handlePlayToMock: vi.fn(),
  handleSelectMock: vi.fn(),
  handleStatementDeleteMock: vi.fn(),
  handleStatementUpdateMock: vi.fn(),
  measureRowElementMock: vi.fn(),
  reorderStatementsMock: vi.fn(),
  statementSortVirtualAdapterMock: {
    getEstimatedItemSize: vi.fn(() => 48),
    getItemCount: vi.fn(() => 2),
    getScrollOffset: vi.fn(() => 0),
    getVisibleItems: vi.fn(() => [
      { index: 0, size: 48, start: 0 },
      { index: 1, size: 48, start: 48 },
    ]),
    invalidate: vi.fn(),
  },
  useEditSettingsStoreMock: vi.fn(),
  useEditorStoreMock: vi.fn(),
  usePreferenceStoreMock: vi.fn(),
  useTabsStoreMock: vi.fn(),
  useVisualEditorSceneRuntimeMock: vi.fn(),
}))

vi.mock('~/stores/edit-settings', () => ({
  useEditSettingsStore: useEditSettingsStoreMock,
}))

vi.mock('~/stores/preference', () => ({
  usePreferenceStore: usePreferenceStoreMock,
}))

vi.mock('~/stores/editor', () => ({
  isEditableEditor: (state: { projection?: string }) => 'projection' in state,
  useEditorStore: useEditorStoreMock,
}))

vi.mock('~/stores/tabs', () => ({
  useTabsStore: useTabsStoreMock,
}))

vi.mock('~/features/editor/visual-editor/useVisualEditorSceneRuntime', () => ({
  useVisualEditorSceneRuntime: useVisualEditorSceneRuntimeMock,
}))

const globalStubs = {
  ScrollArea: createBrowserContainerStub('StubScrollArea'),
  VisualEditorStatementCard: defineComponent({
    name: 'StubVisualEditorStatementCard',
    props: {
      collapsed: Boolean,
      entry: {
        type: Object,
        required: true,
      },
      index: Number,
      playToDisabled: Boolean,
      previousSpeaker: String,
      readonly: Boolean,
      selected: Boolean,
    },
    emits: ['delete', 'play-to', 'select', 'update', 'update:collapsed'],
    setup(props, { emit }) {
      return () => h('div', [
        h('div', {
          'aria-label': String(props.entry.rawText),
          'aria-selected': props.selected,
          'role': 'option',
          'tabindex': props.selected ? 0 : -1,
        }, [
          h('div', {
            'data-statement-drag-handle': '',
          }),
        ]),
        h('button', {
          type: 'button',
          onClick: () => emit('select', props.entry.id),
        }, `${props.entry.rawText}`),
        h('button', {
          disabled: props.playToDisabled,
          type: 'button',
          onClick: () => emit('play-to', props.entry.id),
        }, `play-${props.entry.id}`),
        h('button', {
          type: 'button',
          onClick: () => emit('delete', props.entry.id),
        }, `delete-${props.entry.id}`),
      ])
    },
  }),
}

function createSceneState(): SceneVisualProjectionState {
  return {
    isDirty: false,
    kind: 'scene',
    path: '/project/scene.txt',
    statements: [
      createStatementEntry(1, 'say:hello'),
      createStatementEntry(2, 'say:world'),
    ],
  } as SceneVisualProjectionState
}

describe('VisualEditorScene', () => {
  afterEach(() => {
    vi.clearAllMocks()
    document.body.innerHTML = ''
  })

  beforeEach(() => {
    handleCollapsedUpdateMock.mockReset()
    handlePlayToMock.mockReset()
    handleSelectMock.mockReset()
    handleStatementDeleteMock.mockReset()
    handleStatementUpdateMock.mockReset()
    measureRowElementMock.mockReset()
    reorderStatementsMock.mockReset()
    statementSortVirtualAdapterMock.getEstimatedItemSize.mockReturnValue(48)
    statementSortVirtualAdapterMock.getItemCount.mockReturnValue(2)
    statementSortVirtualAdapterMock.getScrollOffset.mockReturnValue(0)
    statementSortVirtualAdapterMock.getVisibleItems.mockReturnValue([
      { index: 0, size: 48, start: 0 },
      { index: 1, size: 48, start: 48 },
    ])
    statementSortVirtualAdapterMock.invalidate.mockReset()
    useEditSettingsStoreMock.mockReset()
    useEditorStoreMock.mockReset()
    usePreferenceStoreMock.mockReset()
    useTabsStoreMock.mockReset()
    useVisualEditorSceneRuntimeMock.mockReset()

    useEditSettingsStoreMock.mockReturnValue(reactive({
      collapseStatementsOnSidebarOpen: true,
    }))
    useEditorStoreMock.mockReturnValue(reactive({
      currentState: {
        kind: 'scene',
        path: '/project/scene.txt',
        projection: 'visual',
      },
    }))
    usePreferenceStoreMock.mockReturnValue(reactive({
      showSidebar: true,
    }))
    useTabsStoreMock.mockReturnValue(reactive({
      activeTab: {
        path: '/project/scene.txt',
      },
      shouldFocusEditor: false,
    }))
    useVisualEditorSceneRuntimeMock.mockReturnValue({
      handleCollapsedUpdate: handleCollapsedUpdateMock,
      handlePlayTo: handlePlayToMock,
      handleSelect: handleSelectMock,
      handleStatementDelete: handleStatementDeleteMock,
      handleStatementUpdate: handleStatementUpdateMock,
      isPositioning: computed(() => false),
      isStatementCollapsed: (statementId: number) => statementId === 2,
      measureRowElement: measureRowElementMock,
      previousSpeakers: computed(() => ['', 'Alice']),
      reorderStatements: reorderStatementsMock,
      selectedStatementId: 2,
      statementSortVirtualAdapter: statementSortVirtualAdapterMock,
      totalSize: 120,
      virtualRows: [
        { index: 0, key: 0, start: 0 },
        { index: 1, key: 1, start: 48 },
      ],
    })
  })

  it('会渲染可视化语句列表和卡片内容', async () => {
    renderInBrowser(VisualEditorScene, {
      props: {
        state: createSceneState(),
      },
      global: {
        plugins: [createPinia()],
        stubs: globalStubs,
      },
    })

    await expect.element(page.getByRole('listbox')).toBeVisible()
    await expect.element(page.getByText('say:hello')).toBeVisible()
    await expect.element(page.getByText('say:world')).toBeVisible()
  })

  it('卡片事件会转发到 runtime 处理函数', async () => {
    renderInBrowser(VisualEditorScene, {
      props: {
        state: createSceneState(),
      },
      global: {
        plugins: [createPinia()],
        stubs: globalStubs,
      },
    })

    await page.getByRole('button', { name: 'say:hello' }).click()
    await page.getByRole('button', { name: 'play-2' }).click()
    await page.getByRole('button', { name: 'delete-2' }).click()

    expect(handleSelectMock).toHaveBeenCalledWith(1)
    expect(handlePlayToMock).toHaveBeenCalledWith(2)
    expect(handleStatementDeleteMock).toHaveBeenCalledWith(2)
  })

  it('dirty 场景会禁用播放入口', async () => {
    const state = createSceneState()
    state.isDirty = true

    renderInBrowser(VisualEditorScene, {
      props: {
        state,
      },
      global: {
        plugins: [createPinia()],
        stubs: globalStubs,
      },
    })

    await expect.element(page.getByRole('button', { name: 'play-2' })).toHaveAttribute('disabled')
    expect(handlePlayToMock).not.toHaveBeenCalled()
  })

  it('语句列表项会暴露排序索引和拖拽手柄', async () => {
    const state = createSceneState()
    state.statements.push(createStatementEntry(3, 'say:again'))
    statementSortVirtualAdapterMock.getEstimatedItemSize.mockReturnValue(100)
    statementSortVirtualAdapterMock.getItemCount.mockReturnValue(3)
    statementSortVirtualAdapterMock.getVisibleItems.mockReturnValue([
      { index: 0, size: 100, start: 0 },
      { index: 1, size: 100, start: 100 },
      { index: 2, size: 100, start: 200 },
    ])
    useVisualEditorSceneRuntimeMock.mockReturnValue({
      handleCollapsedUpdate: handleCollapsedUpdateMock,
      handlePlayTo: handlePlayToMock,
      handleSelect: handleSelectMock,
      handleStatementDelete: handleStatementDeleteMock,
      handleStatementUpdate: handleStatementUpdateMock,
      isPositioning: computed(() => false),
      isStatementCollapsed: () => false,
      measureRowElement: measureRowElementMock,
      previousSpeakers: computed(() => ['', 'Alice', 'Bob']),
      reorderStatements: reorderStatementsMock,
      selectedStatementId: 1,
      statementSortVirtualAdapter: statementSortVirtualAdapterMock,
      totalSize: 300,
      virtualRows: [
        { index: 0, key: 1, start: 0 },
        { index: 1, key: 2, start: 100 },
        { index: 2, key: 3, start: 200 },
      ],
    })

    renderInBrowser(VisualEditorScene, {
      props: {
        state,
      },
      global: {
        plugins: [createPinia()],
        stubs: globalStubs,
      },
    })

    const firstItem = document.querySelector<HTMLElement>('[data-drag-index="0"]')
    expect(firstItem).not.toBeNull()
    expect(firstItem!.dataset.dragIndex).toBe('0')
    expect(firstItem!.querySelector('[data-statement-drag-handle]')).not.toBeNull()
  })

  it('拖拽语句手柄会提交语句重排', async () => {
    renderInBrowser(VisualEditorScene, {
      props: {
        state: createSceneState(),
      },
      global: {
        plugins: [createPinia()],
        stubs: globalStubs,
      },
    })
    await nextTick()

    const listbox = document.querySelector<HTMLElement>('[role="listbox"]')
    const firstItem = document.querySelector<HTMLElement>('[data-drag-index="0"]')
    const secondItem = document.querySelector<HTMLElement>('[data-drag-index="1"]')
    const handle = firstItem?.querySelector<HTMLElement>('[data-statement-drag-handle]')

    expect(listbox).not.toBeNull()
    expect(firstItem).not.toBeNull()
    expect(secondItem).not.toBeNull()
    expect(handle).not.toBeNull()

    setRect(listbox!, createVerticalRect(0, 96))
    setRect(firstItem!, createVerticalRect(0))
    setRect(secondItem!, createVerticalRect(48))

    handle!.dispatchEvent(createPointerEvent('pointerdown', { clientX: 8, clientY: 8 }))
    globalThis.dispatchEvent(createPointerEvent('pointermove', { clientX: 8, clientY: 90 }))
    globalThis.dispatchEvent(createPointerEvent('pointerup', { clientX: 8, clientY: 90 }))

    await vi.waitFor(() => {
      expect(reorderStatementsMock).toHaveBeenCalledWith(0, 1, { restoreSelectionPresentation: false })
    })
  })

  it('拖拽语句排序后会恢复可视化编辑器快捷键焦点上下文', async () => {
    renderInBrowser(VisualEditorScene, {
      props: {
        state: createSceneState(),
      },
      global: {
        plugins: [createPinia()],
        stubs: globalStubs,
      },
    })
    await nextTick()

    const listbox = document.querySelector<HTMLElement>('[role="listbox"]')
    const firstItem = document.querySelector<HTMLElement>('[data-drag-index="0"]')
    const secondItem = document.querySelector<HTMLElement>('[data-drag-index="1"]')
    const handle = firstItem?.querySelector<HTMLElement>('[data-statement-drag-handle]')

    expect(listbox).not.toBeNull()
    expect(firstItem).not.toBeNull()
    expect(secondItem).not.toBeNull()
    expect(handle).not.toBeNull()

    setRect(listbox!, createVerticalRect(0, 96))
    setRect(firstItem!, createVerticalRect(0))
    setRect(secondItem!, createVerticalRect(48))

    handle!.dispatchEvent(createPointerEvent('pointerdown', { clientX: 8, clientY: 8 }))
    globalThis.dispatchEvent(createPointerEvent('pointermove', { clientX: 8, clientY: 90 }))
    globalThis.dispatchEvent(createPointerEvent('pointerup', { clientX: 8, clientY: 90 }))

    await vi.waitFor(() => {
      expect(reorderStatementsMock).toHaveBeenCalledWith(0, 1, { restoreSelectionPresentation: false })
    })

    expect(document.activeElement).toHaveAttribute('tabindex', '-1')
    expect(useShortcutContextRegistry().resolveContext().panelFocus).toBe('editor')
  })

  it('根节点可承载父级运行时 directive', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const state = createSceneState()
    const WrappedScene = defineComponent({
      name: 'WrappedSceneWithDirective',
      setup() {
        return () => withDirectives(h(VisualEditorScene, { state }), [
          [vShow, true],
        ])
      },
    })

    try {
      renderInBrowser(WrappedScene, {
        global: {
          plugins: [createPinia()],
          stubs: globalStubs,
        },
      })

      expect(warnSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('Runtime directive used on component with non-element root node'),
      )
    } finally {
      warnSpy.mockRestore()
    }
  })

  it('视觉模式请求焦点时会把焦点恢复到选中语句卡片', async () => {
    const tabsStore = reactive({
      activeTab: {
        path: '/project/scene.txt',
      },
      shouldFocusEditor: true,
    })

    useTabsStoreMock.mockReturnValue(tabsStore)

    renderInBrowser(VisualEditorScene, {
      props: {
        state: createSceneState(),
      },
      global: {
        plugins: [createPinia()],
        stubs: globalStubs,
      },
    })

    await expect.element(page.getByRole('option', { name: 'say:world' })).toHaveFocus()
    expect(tabsStore.shouldFocusEditor).toBe(false)
  })
})
