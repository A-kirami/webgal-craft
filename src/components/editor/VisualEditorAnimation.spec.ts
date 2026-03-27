import { createPinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import { computed, defineComponent, h, reactive } from 'vue'

import { renderInBrowser } from '~/__tests__/browser-render'
import { useShortcutContext } from '~/features/editor/shortcut/useShortcutContext'
import { useShortcutDispatcher } from '~/features/editor/shortcut/useShortcutDispatcher'

const {
  useEditorStoreMock,
  useTabsStoreMock,
} = vi.hoisted(() => ({
  useEditorStoreMock: vi.fn(),
  useTabsStoreMock: vi.fn(),
}))

vi.mock('~/stores/editor', () => ({
  isAnimationVisualProjection: (state: { kind?: string, projection?: string }) =>
    state.kind === 'animation' && state.projection === 'visual',
  isEditableEditor: (state: { projection?: string }) => 'projection' in state,
  isSceneVisualProjection: (state: { kind?: string, projection?: string }) =>
    state.kind === 'scene' && state.projection === 'visual',
  useEditorStore: useEditorStoreMock,
}))

vi.mock('~/stores/tabs', () => ({
  useTabsStore: useTabsStoreMock,
}))

import VisualEditorAnimation from './VisualEditorAnimation.vue'

const globalStubs = {
  AnimationEditorPane: defineComponent({
    name: 'StubAnimationEditorPane',
    setup() {
      return () => h('div', [
        h('button', {
          'data-animation-frame-selected': 'true',
          'type': 'button',
        }, 'animation-editor-pane'),
        h('input', {
          'aria-label': 'animation-editor-input',
          'type': 'text',
        }),
      ])
    },
  }),
}

function createAnimationState(path: string) {
  return {
    frames: [{
      duration: 200,
    }],
    isDirty: false,
    kind: 'animation' as const,
    path,
    projection: 'visual' as const,
  }
}

function createShortcutHarness(
  state: ReturnType<typeof createAnimationState>,
  context: {
    editorMode: 'none' | 'text' | 'visual'
    isModalOpen?: boolean
    visualType: 'animation' | 'none' | 'scene'
  },
) {
  return defineComponent({
    name: 'VisualEditorAnimationShortcutHarness',
    setup() {
      useShortcutDispatcher({
        bindings: [],
        executeContext: {},
        platform: 'windows',
      })

      useShortcutContext({
        commandPanelOpen: false,
        editorMode: computed(() => context.editorMode),
        hasSelection: false,
        isDirty: false,
        isModalOpen: computed(() => context.isModalOpen ?? false),
        panelFocus: 'none',
        visualType: computed(() => context.visualType),
      })

      return () => h(VisualEditorAnimation, { state })
    },
  })
}

describe('VisualEditorAnimation', () => {
  afterEach(() => {
    vi.clearAllMocks()
    document.body.innerHTML = ''
  })

  beforeEach(() => {
    useEditorStoreMock.mockReset()
    useTabsStoreMock.mockReset()
  })

  it('仅在当前活跃的动画可视化页响应历史快捷键', async () => {
    const undoDocument = vi.fn(() => ({ applied: true }))
    const scheduleAutoSaveIfEnabled = vi.fn()
    const tabsStore = reactive({
      activeTab: {
        path: '/game/animation/opening.json',
      },
      shouldFocusEditor: false,
    })

    useEditorStoreMock.mockReturnValue(reactive({
      applyAnimationFrameDelete: vi.fn(),
      applyAnimationFrameInsert: vi.fn(),
      applyAnimationFrameUpdate: vi.fn(),
      canRedoDocument: vi.fn(() => false),
      canUndoDocument: vi.fn(() => true),
      currentState: {
        kind: 'scene',
        path: '/game/start.txt',
        projection: 'visual',
      },
      redoDocument: vi.fn(() => ({ applied: false })),
      scheduleAutoSaveIfEnabled,
      undoDocument,
    }))
    useTabsStoreMock.mockReturnValue(tabsStore)

    renderInBrowser(createShortcutHarness(
      createAnimationState('/game/animation/opening.json'),
      {
        editorMode: 'visual',
        visualType: 'scene',
      },
    ), {
      global: {
        plugins: [createPinia()],
        stubs: globalStubs,
      },
    })

    const pane = page.getByRole('button', { name: 'animation-editor-pane' })
    await pane.click()

    globalThis.dispatchEvent(new KeyboardEvent('keydown', {
      bubbles: true,
      ctrlKey: true,
      key: 'z',
    }))

    expect(undoDocument).not.toHaveBeenCalled()
    expect(scheduleAutoSaveIfEnabled).not.toHaveBeenCalled()
  })

  it('当前活跃页是动画可视化时会响应撤销快捷键', async () => {
    const undoDocument = vi.fn(() => ({ applied: true }))
    const scheduleAutoSaveIfEnabled = vi.fn()
    const tabsStore = reactive({
      activeTab: {
        path: '/game/animation/opening.json',
      },
      shouldFocusEditor: false,
    })

    useEditorStoreMock.mockReturnValue(reactive({
      applyAnimationFrameDelete: vi.fn(),
      applyAnimationFrameInsert: vi.fn(),
      applyAnimationFrameUpdate: vi.fn(),
      canRedoDocument: vi.fn(() => false),
      canUndoDocument: vi.fn(() => true),
      currentState: {
        kind: 'animation',
        path: '/game/animation/opening.json',
        projection: 'visual',
      },
      redoDocument: vi.fn(() => ({ applied: false })),
      scheduleAutoSaveIfEnabled,
      undoDocument,
    }))
    useTabsStoreMock.mockReturnValue(tabsStore)

    renderInBrowser(createShortcutHarness(
      createAnimationState('/game/animation/opening.json'),
      {
        editorMode: 'visual',
        visualType: 'animation',
      },
    ), {
      global: {
        plugins: [createPinia()],
        stubs: globalStubs,
      },
    })

    const pane = page.getByRole('button', { name: 'animation-editor-pane' })
    await pane.click()

    globalThis.dispatchEvent(new KeyboardEvent('keydown', {
      bubbles: true,
      ctrlKey: true,
      key: 'z',
    }))

    expect(undoDocument).toHaveBeenCalledTimes(1)
    expect(undoDocument).toHaveBeenCalledWith('/game/animation/opening.json')
    expect(scheduleAutoSaveIfEnabled).toHaveBeenCalledWith('/game/animation/opening.json')
  })

  it('模态框打开时不会响应历史快捷键', async () => {
    const undoDocument = vi.fn(() => ({ applied: true }))
    const scheduleAutoSaveIfEnabled = vi.fn()
    const tabsStore = reactive({
      activeTab: {
        path: '/game/animation/opening.json',
      },
      shouldFocusEditor: false,
    })

    useEditorStoreMock.mockReturnValue(reactive({
      applyAnimationFrameDelete: vi.fn(),
      applyAnimationFrameInsert: vi.fn(),
      applyAnimationFrameUpdate: vi.fn(),
      canRedoDocument: vi.fn(() => false),
      canUndoDocument: vi.fn(() => true),
      currentState: {
        kind: 'animation',
        path: '/game/animation/opening.json',
        projection: 'visual',
      },
      redoDocument: vi.fn(() => ({ applied: false })),
      scheduleAutoSaveIfEnabled,
      undoDocument,
    }))
    useTabsStoreMock.mockReturnValue(tabsStore)

    renderInBrowser(createShortcutHarness(
      createAnimationState('/game/animation/opening.json'),
      {
        editorMode: 'visual',
        isModalOpen: true,
        visualType: 'animation',
      },
    ), {
      global: {
        plugins: [createPinia()],
        stubs: globalStubs,
      },
    })

    const pane = page.getByRole('button', { name: 'animation-editor-pane' })
    await pane.click()

    globalThis.dispatchEvent(new KeyboardEvent('keydown', {
      bubbles: true,
      ctrlKey: true,
      key: 'z',
    }))

    expect(undoDocument).not.toHaveBeenCalled()
    expect(scheduleAutoSaveIfEnabled).not.toHaveBeenCalled()
  })

  it('当前活跃页是动画可视化时会响应删除快捷键', async () => {
    const applyAnimationFrameDelete = vi.fn()
    const scheduleAutoSaveIfEnabled = vi.fn()
    const tabsStore = reactive({
      activeTab: {
        path: '/game/animation/opening.json',
      },
      shouldFocusEditor: false,
    })

    useEditorStoreMock.mockReturnValue(reactive({
      applyAnimationFrameDelete,
      applyAnimationFrameInsert: vi.fn(),
      applyAnimationFrameUpdate: vi.fn(),
      canRedoDocument: vi.fn(() => false),
      canUndoDocument: vi.fn(() => true),
      currentState: {
        kind: 'animation',
        path: '/game/animation/opening.json',
        projection: 'visual',
      },
      redoDocument: vi.fn(() => ({ applied: false })),
      scheduleAutoSaveIfEnabled,
      undoDocument: vi.fn(() => ({ applied: false })),
    }))
    useTabsStoreMock.mockReturnValue(tabsStore)

    renderInBrowser(createShortcutHarness(
      createAnimationState('/game/animation/opening.json'),
      {
        editorMode: 'visual',
        visualType: 'animation',
      },
    ), {
      global: {
        plugins: [createPinia()],
        stubs: globalStubs,
      },
    })

    await page.getByRole('button', { name: 'animation-editor-pane' }).click()

    globalThis.dispatchEvent(new KeyboardEvent('keydown', {
      bubbles: true,
      key: 'Delete',
    }))

    expect(applyAnimationFrameDelete).toHaveBeenCalledTimes(1)
    expect(applyAnimationFrameDelete).toHaveBeenCalledWith('/game/animation/opening.json', 0)
    expect(scheduleAutoSaveIfEnabled).toHaveBeenCalledWith('/game/animation/opening.json')
  })

  it('视觉模式请求焦点时会把焦点恢复到动画编辑器', async () => {
    const tabsStore = reactive({
      activeTab: {
        path: '/game/animation/opening.json',
      },
      shouldFocusEditor: true,
    })

    useEditorStoreMock.mockReturnValue(reactive({
      applyAnimationFrameDelete: vi.fn(),
      applyAnimationFrameInsert: vi.fn(),
      applyAnimationFrameUpdate: vi.fn(),
      canRedoDocument: vi.fn(() => false),
      canUndoDocument: vi.fn(() => true),
      currentState: {
        kind: 'animation',
        path: '/game/animation/opening.json',
        projection: 'visual',
      },
      redoDocument: vi.fn(() => ({ applied: false })),
      scheduleAutoSaveIfEnabled: vi.fn(),
      undoDocument: vi.fn(() => ({ applied: false })),
    }))
    useTabsStoreMock.mockReturnValue(tabsStore)

    renderInBrowser(VisualEditorAnimation, {
      props: {
        state: createAnimationState('/game/animation/opening.json'),
      },
      global: {
        plugins: [createPinia()],
        stubs: globalStubs,
      },
    })

    await expect.element(page.getByRole('button', { name: 'animation-editor-pane' })).toHaveFocus()
    expect(tabsStore.shouldFocusEditor).toBe(false)
  })

  it('动画编辑器输入框焦点下不会劫持文本撤销和重做快捷键', async () => {
    const undoDocument = vi.fn(() => ({ applied: true }))
    const redoDocument = vi.fn(() => ({ applied: true }))
    const scheduleAutoSaveIfEnabled = vi.fn()
    const tabsStore = reactive({
      activeTab: {
        path: '/game/animation/opening.json',
      },
      shouldFocusEditor: false,
    })

    useEditorStoreMock.mockReturnValue(reactive({
      applyAnimationFrameDelete: vi.fn(),
      applyAnimationFrameInsert: vi.fn(),
      applyAnimationFrameUpdate: vi.fn(),
      canRedoDocument: vi.fn(() => false),
      canUndoDocument: vi.fn(() => true),
      currentState: {
        kind: 'animation',
        path: '/game/animation/opening.json',
        projection: 'visual',
      },
      redoDocument,
      scheduleAutoSaveIfEnabled,
      undoDocument,
    }))
    useTabsStoreMock.mockReturnValue(tabsStore)

    renderInBrowser(createShortcutHarness(
      createAnimationState('/game/animation/opening.json'),
      {
        editorMode: 'visual',
        visualType: 'animation',
      },
    ), {
      global: {
        plugins: [createPinia()],
        stubs: globalStubs,
      },
    })

    const input = page.getByRole('textbox', { name: 'animation-editor-input' })
    const inputElement = await input.element()
    inputElement.focus()
    await expect.element(input).toHaveFocus()

    inputElement.dispatchEvent(new KeyboardEvent('keydown', {
      bubbles: true,
      ctrlKey: true,
      key: 'z',
    }))

    inputElement.dispatchEvent(new KeyboardEvent('keydown', {
      bubbles: true,
      ctrlKey: true,
      key: 'y',
    }))

    expect(undoDocument).not.toHaveBeenCalled()
    expect(redoDocument).not.toHaveBeenCalled()
    expect(scheduleAutoSaveIfEnabled).not.toHaveBeenCalled()
  })
})
