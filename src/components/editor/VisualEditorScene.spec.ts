import { createPinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import { computed, defineComponent, h, nextTick, reactive, shallowRef, vShow, withDirectives } from 'vue'

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
  handleCommandDropMock,
  handleFileDropMock,
  measureRowElementMock,
  reorderStatementsMock,
  statementSortVirtualAdapterMock,
  useDroppableRegistryMock,
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
  handleCommandDropMock: vi.fn(),
  handleFileDropMock: vi.fn(),
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
  useDroppableRegistryMock: vi.fn(),
}))

vi.mock('~/composables/useDroppableRegistry', () => ({
  useDroppableRegistry: useDroppableRegistryMock,
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
    handleCommandDropMock.mockReset()
    handleFileDropMock.mockReset()
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
    useDroppableRegistryMock.mockReset()

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
      canHandleCommandDrop: vi.fn(() => true),
      canHandleFileDrop: vi.fn(() => true),
      handleCommandDrop: handleCommandDropMock,
      handleCollapsedUpdate: handleCollapsedUpdateMock,
      handleFileDrop: handleFileDropMock,
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
    useDroppableRegistryMock.mockReturnValue({
      clearHover: vi.fn(),
      drop: vi.fn(),
      getMatchAt: vi.fn(),
      hoveredTarget: shallowRef(),
      isDropAllowed: shallowRef(false),
      registerDroppable: vi.fn(),
      unregisterDroppable: vi.fn(),
      updateHover: vi.fn(),
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

  it('空场景会显示空状态而不是空语句卡片', async () => {
    const state = createSceneState()
    state.statements = []

    renderInBrowser(VisualEditorScene, {
      props: {
        state,
      },
      global: {
        plugins: [createPinia()],
        stubs: globalStubs,
      },
    })

    await expect.element(page.getByText('edit.visualEditor.emptyTitle')).toBeVisible()
    await expect.element(page.getByText('edit.visualEditor.emptyDescription')).toBeVisible()
    await expect.element(page.getByRole('option')).not.toBeInTheDocument()
  })

  it('空场景会把空状态区域注册为首条语句投放目标', async () => {
    const registerDroppable = vi.fn()
    handleCommandDropMock.mockReturnValue(true)
    handleFileDropMock.mockReturnValue(true)
    useDroppableRegistryMock.mockReturnValue({
      clearHover: vi.fn(),
      drop: vi.fn(),
      getMatchAt: vi.fn(),
      hoveredTarget: shallowRef(),
      isDropAllowed: shallowRef(false),
      registerDroppable,
      unregisterDroppable: vi.fn(),
      updateHover: vi.fn(),
    })

    const state = createSceneState()
    state.statements = []

    const result = renderInBrowser(VisualEditorScene, {
      props: { state },
      global: {
        plugins: [createPinia()],
        stubs: globalStubs,
      },
    })
    await nextTick()

    expect(registerDroppable).toHaveBeenCalledWith(
      expect.any(HTMLElement),
      expect.objectContaining({ id: 'visual-editor:empty' }),
    )
    expect(registerDroppable).not.toHaveBeenCalledWith(
      expect.any(HTMLElement),
      expect.objectContaining({ id: 'visual-editor:tail' }),
    )

    const emptyConfig = registerDroppable.mock.calls.find(([, config]) =>
      config.id === 'visual-editor:empty',
    )?.[1]
    const commandPayload = {
      label: 'Say',
      rawTexts: ['say:new;'],
      source: 'command-panel',
      type: 'command-panel-statement',
    } as const
    const filePayload = {
      source: 'file-viewer',
      type: 'file-system-item',
      path: '/games/demo/game/background/room.png',
      isDir: false,
    } as const

    expect(emptyConfig.canDrop(commandPayload, document.createElement('div'))).toBe(true)

    emptyConfig.onDragEnter(commandPayload)
    await nextTick()

    expect(result.container.querySelector('[data-visual-drop-indicator="empty"]')).not.toBeNull()
    expect(result.container.querySelector('[data-visual-drop-indicator="insert"]')).toBeNull()

    await emptyConfig.onDrop(commandPayload, document.createElement('div'))

    expect(handleCommandDropMock).toHaveBeenCalledWith(commandPayload, {
      placement: 'tail',
      insertIndex: 0,
    })
    expect(document.activeElement).toHaveAttribute('tabindex', '-1')

    await emptyConfig.onDrop(filePayload, document.createElement('div'))

    expect(handleFileDropMock).toHaveBeenCalledWith(filePayload, {
      placement: 'tail',
      insertIndex: 0,
    })
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
      canHandleCommandDrop: vi.fn(() => true),
      canHandleFileDrop: vi.fn(() => true),
      handleCommandDrop: handleCommandDropMock,
      handleCollapsedUpdate: handleCollapsedUpdateMock,
      handleFileDrop: handleFileDropMock,
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

  it('为 head / gap / update / tail 注册 drop target，并把 drop 目标传给 runtime', async () => {
    const registerDroppable = vi.fn()
    useDroppableRegistryMock.mockReturnValue({
      clearHover: vi.fn(),
      drop: vi.fn(),
      getMatchAt: vi.fn(),
      hoveredTarget: shallowRef(),
      isDropAllowed: shallowRef(false),
      registerDroppable,
      unregisterDroppable: vi.fn(),
      updateHover: vi.fn(),
    })

    const state = createSceneState()
    renderInBrowser(VisualEditorScene, {
      props: { state },
      global: {
        plugins: [createPinia()],
        stubs: globalStubs,
      },
    })
    await nextTick()

    expect(registerDroppable).toHaveBeenCalledWith(
      expect.any(HTMLElement),
      expect.objectContaining({ id: 'visual-editor:head' }),
    )
    expect(registerDroppable).toHaveBeenCalledWith(
      expect.any(HTMLElement),
      expect.objectContaining({ id: 'visual-editor:update:1' }),
    )
    expect(registerDroppable).toHaveBeenCalledWith(
      expect.any(HTMLElement),
      expect.objectContaining({ id: 'visual-editor:gap:1:2' }),
    )
    expect(registerDroppable).toHaveBeenCalledWith(
      expect.any(HTMLElement),
      expect.objectContaining({ id: 'visual-editor:tail' }),
    )

    const updateConfig = registerDroppable.mock.calls.find(([, config]) =>
      config.id === 'visual-editor:update:1',
    )?.[1]
    const payload = {
      source: 'file-viewer',
      type: 'file-system-item',
      path: '/games/demo/game/scene/chapter2.txt',
      isDir: false,
    } as const
    const commandPayload = {
      label: 'Say',
      rawTexts: ['say:new;'],
      source: 'command-panel',
      type: 'command-panel-statement',
    } as const

    expect(updateConfig.canDrop(commandPayload, document.createElement('div'))).toBe(false)

    await updateConfig.onDrop(payload, document.createElement('div'))

    expect(handleFileDropMock).toHaveBeenCalledWith(payload, {
      placement: 'update',
      insertIndex: 0,
      statementId: 1,
    })

    const gapConfig = registerDroppable.mock.calls.find(([, config]) =>
      config.id === 'visual-editor:gap:1:2',
    )?.[1]

    await gapConfig.onDrop(payload, document.createElement('div'))

    expect(handleFileDropMock).toHaveBeenCalledWith(payload, {
      placement: 'gap',
      insertIndex: 1,
    })

    expect(gapConfig.canDrop(commandPayload, document.createElement('div'))).toBe(true)
    await gapConfig.onDrop(commandPayload, document.createElement('div'))

    expect(handleCommandDropMock).toHaveBeenCalledWith(commandPayload, {
      placement: 'gap',
      insertIndex: 1,
    })

    const headConfig = registerDroppable.mock.calls.find(([, config]) =>
      config.id === 'visual-editor:head',
    )?.[1]

    await headConfig.onDrop(payload, document.createElement('div'))

    expect(handleFileDropMock).toHaveBeenCalledWith(payload, {
      placement: 'head',
      insertIndex: 0,
    })
  })

  it('文件投放成功后会恢复可视化编辑器焦点', async () => {
    const registerDroppable = vi.fn()
    handleFileDropMock.mockReturnValue(true)
    useDroppableRegistryMock.mockReturnValue({
      clearHover: vi.fn(),
      drop: vi.fn(),
      getMatchAt: vi.fn(),
      hoveredTarget: shallowRef(),
      isDropAllowed: shallowRef(false),
      registerDroppable,
      unregisterDroppable: vi.fn(),
      updateHover: vi.fn(),
    })

    renderInBrowser(VisualEditorScene, {
      props: { state: createSceneState() },
      global: {
        plugins: [createPinia()],
        stubs: globalStubs,
      },
    })
    await nextTick()

    const headConfig = registerDroppable.mock.calls.find(([, config]) =>
      config.id === 'visual-editor:head',
    )?.[1]
    const payload = {
      source: 'file-viewer',
      type: 'file-system-item',
      path: '/games/demo/game/background/room.png',
      isDir: false,
    } as const

    await headConfig.onDrop(payload, document.createElement('div'))

    expect(document.activeElement).toHaveAttribute('tabindex', '-1')
    expect(useShortcutContextRegistry().resolveContext().panelFocus).toBe('editor')
  })

  it('拖过插入区时会显示语义化插入指示器', async () => {
    const registerDroppable = vi.fn()
    useDroppableRegistryMock.mockReturnValue({
      clearHover: vi.fn(),
      drop: vi.fn(),
      getMatchAt: vi.fn(),
      hoveredTarget: shallowRef(),
      isDropAllowed: shallowRef(false),
      registerDroppable,
      unregisterDroppable: vi.fn(),
      updateHover: vi.fn(),
    })

    const result = renderInBrowser(VisualEditorScene, {
      props: { state: createSceneState() },
      global: {
        plugins: [createPinia()],
        stubs: globalStubs,
      },
    })
    await nextTick()

    const gapConfig = registerDroppable.mock.calls.find(([, config]) =>
      config.id === 'visual-editor:gap:1:2',
    )?.[1]
    const payload = {
      source: 'file-viewer',
      type: 'file-system-item',
      path: '/games/demo/game/background/room.png',
      isDir: false,
    } as const

    gapConfig.onDragEnter(payload)
    await nextTick()

    const insertIndicator = result.container.querySelector('[data-visual-drop-indicator="insert"]')
    expect(insertIndicator).not.toBeNull()
    expect(insertIndicator!.className).toContain('drop-insert-indicator-before')
    expect((insertIndicator as HTMLElement).style.top).toBe('-0.125rem')
    expect(result.container.querySelector('[data-visual-drop-indicator="update"]')).toBeNull()
  })

  it('拖过更新区时会显示语义化更新指示器', async () => {
    const registerDroppable = vi.fn()
    useDroppableRegistryMock.mockReturnValue({
      clearHover: vi.fn(),
      drop: vi.fn(),
      getMatchAt: vi.fn(),
      hoveredTarget: shallowRef(),
      isDropAllowed: shallowRef(false),
      registerDroppable,
      unregisterDroppable: vi.fn(),
      updateHover: vi.fn(),
    })

    const result = renderInBrowser(VisualEditorScene, {
      props: { state: createSceneState() },
      global: {
        plugins: [createPinia()],
        stubs: globalStubs,
      },
    })
    await nextTick()

    const updateConfig = registerDroppable.mock.calls.find(([, config]) =>
      config.id === 'visual-editor:update:1',
    )?.[1]
    const payload = {
      source: 'file-viewer',
      type: 'file-system-item',
      path: '/games/demo/game/scene/chapter2.txt',
      isDir: false,
    } as const

    updateConfig.onDragEnter(payload)
    await nextTick()

    expect(result.container.querySelector('[data-visual-drop-indicator="update"]')).not.toBeNull()
    expect(result.container.querySelector('[data-visual-drop-indicator="insert"]')).toBeNull()
  })

  it('切换到更短场景且虚拟行尚未同步时会跳过越界行', async () => {
    const state = createSceneState()
    state.statements = [createStatementEntry(1, 'say:only')]

    expect(() => renderInBrowser(VisualEditorScene, {
      props: { state },
      global: {
        plugins: [createPinia()],
        stubs: globalStubs,
      },
    })).not.toThrow()

    await nextTick()
    await expect.element(page.getByText('say:only')).toBeVisible()
    await expect.element(page.getByText('say:world')).not.toBeInTheDocument()
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

  it('空场景插入首条语句后会恢复语句列表拖拽排序', async () => {
    const state = reactive({
      ...createSceneState(),
      statements: [],
    }) as SceneVisualProjectionState
    statementSortVirtualAdapterMock.getItemCount.mockReturnValue(2)
    statementSortVirtualAdapterMock.getVisibleItems.mockReturnValue([])
    const Harness = defineComponent({
      name: 'EmptyToFilledSceneHarness',
      setup() {
        return () => h(VisualEditorScene, { state })
      },
    })

    renderInBrowser(Harness, {
      global: {
        plugins: [createPinia()],
        stubs: globalStubs,
      },
    })
    await nextTick()

    state.statements.push(
      createStatementEntry(1, 'say:first'),
      createStatementEntry(2, 'say:second'),
    )
    statementSortVirtualAdapterMock.getVisibleItems.mockReturnValue([
      { index: 0, size: 48, start: 0 },
      { index: 1, size: 48, start: 48 },
    ])
    await nextTick()
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
