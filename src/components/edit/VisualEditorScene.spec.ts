/* eslint-disable vue/one-component-per-file, vue/require-default-prop */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import { render } from 'vitest-browser-vue'
import { computed, defineComponent, h, reactive } from 'vue'
import { createI18n } from 'vue-i18n'

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
  useVisualEditorSceneRuntimeMock,
} = vi.hoisted(() => ({
  handleCollapsedUpdateMock: vi.fn(),
  handlePlayToMock: vi.fn(),
  handleSelectMock: vi.fn(),
  handleStatementDeleteMock: vi.fn(),
  handleStatementUpdateMock: vi.fn(),
  measureRowElementMock: vi.fn(),
  useEditSettingsStoreMock: vi.fn(),
  usePreferenceStoreMock: vi.fn(),
  useVisualEditorSceneRuntimeMock: vi.fn(),
}))

vi.mock('~/stores/edit-settings', () => ({
  useEditSettingsStore: useEditSettingsStoreMock,
}))

vi.mock('~/stores/preference', () => ({
  usePreferenceStore: usePreferenceStoreMock,
}))

vi.mock('~/composables/useVisualEditorSceneRuntime', () => ({
  useVisualEditorSceneRuntime: useVisualEditorSceneRuntimeMock,
}))

const globalStubs = {
  ScrollArea: defineComponent({
    name: 'StubScrollArea',
    props: {
      style: {
        type: Object,
        required: false,
      },
    },
    setup(props, { slots }) {
      return () => h('div', {
        'data-testid': 'scroll-area',
        'style': props.style,
      }, slots.default?.())
    },
  }),
  VisualEditorStatementCard: defineComponent({
    name: 'StubVisualEditorStatementCard',
    props: {
      collapsed: Boolean,
      entry: {
        type: Object,
        required: true,
      },
      index: Number,
      previousSpeaker: String,
      readonly: Boolean,
      selected: Boolean,
    },
    emits: ['delete', 'play-to', 'select', 'update', 'update:collapsed'],
    setup(props, { emit }) {
      return () => h('div', [
        h('button', {
          type: 'button',
          onClick: () => emit('select', props.entry.id),
        }, `${props.entry.rawText}`),
        h('button', {
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

function createTestI18n() {
  return createI18n({
    legacy: false,
    locale: 'en',
    missingWarn: false,
    fallbackWarn: false,
    missing: (_locale, key) => key,
  })
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
  })

  beforeEach(() => {
    handleCollapsedUpdateMock.mockReset()
    handlePlayToMock.mockReset()
    handleSelectMock.mockReset()
    handleStatementDeleteMock.mockReset()
    handleStatementUpdateMock.mockReset()
    measureRowElementMock.mockReset()
    useEditSettingsStoreMock.mockReset()
    usePreferenceStoreMock.mockReset()
    useVisualEditorSceneRuntimeMock.mockReset()

    useEditSettingsStoreMock.mockReturnValue(reactive({
      collapseStatementsOnSidebarOpen: true,
    }))
    usePreferenceStoreMock.mockReturnValue(reactive({
      showSidebar: true,
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
    render(VisualEditorScene, {
      props: {
        state: createSceneState(),
      },
      global: {
        plugins: [createTestI18n()],
        stubs: globalStubs,
      },
    })

    await expect.element(page.getByRole('listbox', { name: 'edit.visualEditor.statementList' })).toBeVisible()
    await expect.element(page.getByText('say:hello')).toBeVisible()
    await expect.element(page.getByText('say:world')).toBeVisible()
  })

  it('卡片事件会转发到 runtime 处理函数', async () => {
    render(VisualEditorScene, {
      props: {
        state: createSceneState(),
      },
      global: {
        plugins: [createTestI18n()],
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
})
