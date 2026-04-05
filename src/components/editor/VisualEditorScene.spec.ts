import { createPinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import { computed, defineComponent, h, reactive } from 'vue'

import { createBrowserContainerStub, renderInBrowser } from '~/__tests__/browser-render'

import VisualEditorScene from './VisualEditorScene.vue'

import type { SceneVisualProjectionState } from '~/stores/editor'

const {
  handleCollapsedUpdateMock,
  handlePlayToMock,
  handleSelectMock,
  handleStatementDeleteMock,
  handleStatementUpdateMock,
  measureRowElementMock,
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
        }),
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
      { id: 1, rawText: 'say:hello' },
      { id: 2, rawText: 'say:world' },
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
      previousSpeakers: ['', 'Alice'],
      selectedStatementId: 2,
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
