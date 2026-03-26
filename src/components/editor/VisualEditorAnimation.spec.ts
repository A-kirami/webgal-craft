import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { reactive } from 'vue'

import { createBrowserContainerStub, renderInBrowser } from '~/__tests__/browser-render'

const { useEditorStoreMock } = vi.hoisted(() => ({
  useEditorStoreMock: vi.fn(),
}))

vi.mock('~/stores/editor', () => ({
  isAnimationVisualProjection: (state: { kind?: string, projection?: string }) =>
    state.kind === 'animation' && state.projection === 'visual',
  isEditableEditor: (state: { projection?: string }) => 'projection' in state,
  isSceneVisualProjection: (state: { kind?: string, projection?: string }) =>
    state.kind === 'scene' && state.projection === 'visual',
  useEditorStore: useEditorStoreMock,
}))

import VisualEditorAnimation from './VisualEditorAnimation.vue'

const globalStubs = {
  AnimationEditorPane: createBrowserContainerStub('StubAnimationEditorPane'),
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

describe('VisualEditorAnimation', () => {
  afterEach(() => {
    vi.clearAllMocks()
    document.body.innerHTML = ''
  })

  beforeEach(() => {
    useEditorStoreMock.mockReset()
  })

  it('仅在当前活跃的动画可视化页响应历史快捷键', async () => {
    const undoDocument = vi.fn(() => ({ applied: true }))
    const scheduleAutoSaveIfEnabled = vi.fn()

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

    renderInBrowser(VisualEditorAnimation, {
      props: {
        state: createAnimationState('/game/animation/opening.json'),
      },
      global: {
        stubs: globalStubs,
      },
    })

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

    renderInBrowser(VisualEditorAnimation, {
      props: {
        state: createAnimationState('/game/animation/opening.json'),
      },
      global: {
        stubs: globalStubs,
      },
    })

    globalThis.dispatchEvent(new KeyboardEvent('keydown', {
      bubbles: true,
      ctrlKey: true,
      key: 'z',
    }))

    expect(undoDocument).toHaveBeenCalledTimes(1)
    expect(undoDocument).toHaveBeenCalledWith('/game/animation/opening.json')
    expect(scheduleAutoSaveIfEnabled).toHaveBeenCalledWith('/game/animation/opening.json')
  })

  it('焦点位于对话框等浮层内时不会响应历史快捷键', async () => {
    const undoDocument = vi.fn(() => ({ applied: true }))
    const scheduleAutoSaveIfEnabled = vi.fn()

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

    renderInBrowser(VisualEditorAnimation, {
      props: {
        state: createAnimationState('/game/animation/opening.json'),
      },
      global: {
        stubs: globalStubs,
      },
    })

    const overlay = document.createElement('div')
    overlay.setAttribute('role', 'dialog')
    const overlayButton = document.createElement('button')
    overlayButton.type = 'button'
    overlay.append(overlayButton)
    document.body.append(overlay)
    overlayButton.focus()

    globalThis.dispatchEvent(new KeyboardEvent('keydown', {
      bubbles: true,
      ctrlKey: true,
      key: 'z',
    }))

    expect(undoDocument).not.toHaveBeenCalled()
    expect(scheduleAutoSaveIfEnabled).not.toHaveBeenCalled()

    overlay.remove()
  })

  it('焦点位于 alertdialog 内时不会响应历史快捷键', async () => {
    const undoDocument = vi.fn(() => ({ applied: true }))
    const scheduleAutoSaveIfEnabled = vi.fn()

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

    renderInBrowser(VisualEditorAnimation, {
      props: {
        state: createAnimationState('/game/animation/opening.json'),
      },
      global: {
        stubs: globalStubs,
      },
    })

    const overlay = document.createElement('div')
    overlay.setAttribute('role', 'alertdialog')
    const overlayButton = document.createElement('button')
    overlayButton.type = 'button'
    overlay.append(overlayButton)
    document.body.append(overlay)
    overlayButton.focus()

    globalThis.dispatchEvent(new KeyboardEvent('keydown', {
      bubbles: true,
      ctrlKey: true,
      key: 'z',
    }))

    expect(undoDocument).not.toHaveBeenCalled()
    expect(scheduleAutoSaveIfEnabled).not.toHaveBeenCalled()

    overlay.remove()
  })
})
