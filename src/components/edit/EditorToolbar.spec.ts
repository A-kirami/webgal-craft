import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import { reactive } from 'vue'

import { renderInBrowser } from '~/__tests__/browser-render'

const {
  useEditorStoreMock,
  usePreferenceStoreMock,
} = vi.hoisted(() => ({
  useEditorStoreMock: vi.fn(),
  usePreferenceStoreMock: vi.fn(),
}))

vi.mock('~/stores/editor', () => ({
  useEditorStore: useEditorStoreMock,
}))

vi.mock('~/stores/preference', () => ({
  usePreferenceStore: usePreferenceStoreMock,
}))

import EditorToolbar from './EditorToolbar.vue'

describe('EditorToolbar', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  beforeEach(() => {
    useEditorStoreMock.mockReset()
    usePreferenceStoreMock.mockReset()
  })

  it('点击模式切换按钮会委托 store 统一切换编辑模式', async () => {
    const preferenceStore = reactive({
      editorMode: 'visual' as 'text' | 'visual',
      showSidebar: false,
    })
    const editorStore = reactive({
      canToggleMode: true,
      currentState: { projection: 'visual' },
      currentTextProjection: {
        syncError: undefined,
      },
      isCurrentSceneFile: true,
      switchEditorMode: vi.fn(),
    })

    usePreferenceStoreMock.mockReturnValue(preferenceStore)
    useEditorStoreMock.mockReturnValue(editorStore)

    renderInBrowser(EditorToolbar, {
      global: {},
    })

    await page.getByRole('button', { name: 'edit.editorMode.textMode' }).click()

    expect(editorStore.switchEditorMode).toHaveBeenCalledWith('text')
  })

  it('点击侧栏按钮会切换 showSidebar', async () => {
    const preferenceStore = reactive({
      editorMode: 'text' as 'text' | 'visual',
      showSidebar: false,
    })
    const editorStore = reactive({
      canToggleMode: true,
      currentState: { projection: 'text' },
      currentTextProjection: {
        syncError: undefined,
      },
      isCurrentSceneFile: true,
      switchEditorMode: vi.fn(),
    })

    usePreferenceStoreMock.mockReturnValue(preferenceStore)
    useEditorStoreMock.mockReturnValue(editorStore)

    renderInBrowser(EditorToolbar, {
      global: {},
    })

    await page.getByRole('button', { name: 'edit.editorMode.toggleSidebar' }).click()

    expect(preferenceStore.showSidebar).toBe(true)
  })

  it('动画文本无效时仍允许切换到可视化模式', async () => {
    const preferenceStore = reactive({
      editorMode: 'text' as 'text' | 'visual',
      showSidebar: false,
    })
    const editorStore = reactive({
      canToggleMode: true,
      currentState: { projection: 'text' },
      currentTextProjection: {
        syncError: 'invalid-animation-json',
      },
      isCurrentSceneFile: false,
      switchEditorMode: vi.fn(),
    })

    usePreferenceStoreMock.mockReturnValue(preferenceStore)
    useEditorStoreMock.mockReturnValue(editorStore)

    renderInBrowser(EditorToolbar, {
      global: {},
    })

    await page.getByRole('button', { name: 'edit.editorMode.visualMode' }).click()

    expect(editorStore.switchEditorMode).toHaveBeenCalledWith('visual')
  })
})
