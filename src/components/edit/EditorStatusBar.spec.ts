import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import { render } from 'vitest-browser-vue'
import { reactive } from 'vue'

import { createBrowserTestI18n } from '~/__tests__/browser'

const {
  dayjsMock,
  getImageDimensionsMock,
  getLanguageDisplayNameMock,
  useEditorStoreMock,
} = vi.hoisted(() => ({
  dayjsMock: vi.fn(),
  getImageDimensionsMock: vi.fn(),
  getLanguageDisplayNameMock: vi.fn(),
  useEditorStoreMock: vi.fn(),
}))

vi.mock('~/stores/editor', () => ({
  isAnimationVisualProjection: (state: { kind?: string, projection?: string }) =>
    state.kind === 'animation' && state.projection === 'visual',
  isEditableEditor: (state: { view?: string }) => state.view !== 'preview',
  isSceneVisualProjection: (state: { kind?: string, projection?: string }) =>
    state.kind === 'scene' && state.projection === 'visual',
  useEditorStore: useEditorStoreMock,
}))

vi.mock('~/commands/thumbnaila', () => ({
  thumbnailCmds: {
    getImageDimensions: getImageDimensionsMock,
  },
}))

vi.mock('~/plugins/dayjs', () => ({
  default: dayjsMock,
}))

vi.mock('~/plugins/editor', () => ({
  getLanguageDisplayName: getLanguageDisplayNameMock,
}))

import EditorStatusBar from './EditorStatusBar.vue'

function createTestI18n() {
  return createBrowserTestI18n({
    messages: {
      en: {
        common: {
          saved: 'Saved',
          unsaved: 'Unsaved',
        },
        edit: {
          assetPanel: {
            tabs: {
              template: 'Template',
            },
          },
          statusBar: {
            frames: '{count} frames',
            statements: '{count} statements',
          },
          textEditor: {
            languages: {
              webgalanimation: 'WebGAL Animation',
              webgalscript: 'WebGAL Script',
            },
            stats: {
              lines: '{count} lines',
              words: '{count} words',
            },
          },
        },
      },
    },
  })
}

function createEditorStore() {
  return reactive({
    currentState: undefined as Record<string, unknown> | undefined,
    currentTextProjection: undefined as Record<string, unknown> | undefined,
  })
}

describe('EditorStatusBar', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  beforeEach(() => {
    dayjsMock.mockReset()
    getImageDimensionsMock.mockReset()
    getLanguageDisplayNameMock.mockReset()
    useEditorStoreMock.mockReset()

    dayjsMock.mockReturnValue({
      fromNow: () => 'just now',
    })
    getLanguageDisplayNameMock.mockReturnValue('Markdown')
  })

  it('会显示文本编辑器的保存状态、语言与行词统计', async () => {
    const editorStore = createEditorStore()
    editorStore.currentState = {
      isDirty: false,
      kind: 'scene',
      lastSavedTime: '2026-03-20T10:00:00.000Z',
      path: '/project/scene.txt',
      projection: 'text',
      textContent: 'hello world\nnext line',
    }
    editorStore.currentTextProjection = {
      syncError: undefined,
    }

    useEditorStoreMock.mockReturnValue(editorStore)

    render(EditorStatusBar, {
      global: {
        plugins: [createTestI18n()],
      },
    })

    await expect.element(page.getByText('Saved')).toBeVisible()
    await expect.element(page.getByText('just now')).toBeVisible()
    await expect.element(page.getByText('WebGAL Script')).toBeVisible()
    await expect.element(page.getByText('2 lines')).toBeVisible()
    await expect.element(page.getByText('4 words')).toBeVisible()
  })

  it('模板样式文件显示语言名而不是模板标签', async () => {
    const editorStore = createEditorStore()
    editorStore.currentState = {
      isDirty: false,
      kind: 'template',
      lastSavedTime: '2026-03-20T10:00:00.000Z',
      path: '/project/template/example.scss',
      projection: 'text',
      textContent: '.example { color: red; }',
    }
    editorStore.currentTextProjection = {
      syncError: undefined,
    }

    getLanguageDisplayNameMock.mockReturnValue('SCSS')
    useEditorStoreMock.mockReturnValue(editorStore)

    render(EditorStatusBar, {
      global: {
        plugins: [createTestI18n()],
      },
    })

    await expect.element(page.getByText('SCSS')).toBeVisible()
    await expect.element(page.getByText('Template')).not.toBeInTheDocument()
  })

  it('场景可视化模式会显示未保存状态和语句数量', async () => {
    const editorStore = createEditorStore()
    editorStore.currentState = {
      isDirty: true,
      kind: 'scene',
      path: '/project/scene.txt',
      projection: 'visual',
      statements: [
        { id: 1, rawText: 'say:hello' },
        { id: 2, rawText: 'say:world' },
        { id: 3, rawText: 'changeBg:bg.jpg' },
      ],
      textContent: '',
    }
    editorStore.currentTextProjection = {
      syncError: undefined,
    }

    useEditorStoreMock.mockReturnValue(editorStore)

    render(EditorStatusBar, {
      global: {
        plugins: [createTestI18n()],
      },
    })

    await expect.element(page.getByText('Unsaved')).toBeVisible()
    await expect.element(page.getByText('3 statements')).toBeVisible()
    await expect.element(page.getByText('WebGAL Script')).toBeVisible()
  })

  it('资源预览模式会显示图片尺寸和文件大小', async () => {
    const editorStore = createEditorStore()
    editorStore.currentState = {
      fileSize: 2048,
      mimeType: 'image/png',
      path: '/project/background.png',
      view: 'preview',
    }

    getImageDimensionsMock.mockResolvedValue([1280, 720])
    useEditorStoreMock.mockReturnValue(editorStore)

    render(EditorStatusBar, {
      global: {
        plugins: [createTestI18n()],
      },
    })

    await expect.element(page.getByText('1280 × 720')).toBeVisible()
    await expect.element(page.getByText('2.0 KiB')).toBeVisible()
    expect(getImageDimensionsMock).toHaveBeenCalledWith('/project/background.png')
  })

  it('动画可视化模式显示帧数而不是行词统计', async () => {
    const editorStore = createEditorStore()
    editorStore.currentState = {
      frames: [
        { duration: 0 },
        { duration: 200 },
        { duration: 300 },
      ],
      isDirty: false,
      kind: 'animation',
      lastSavedTime: '2026-03-20T10:00:00.000Z',
      path: '/project/effect.json',
      projection: 'visual',
      textContent: '',
    }
    editorStore.currentTextProjection = {
      syncError: undefined,
    }

    useEditorStoreMock.mockReturnValue(editorStore)

    render(EditorStatusBar, {
      global: {
        plugins: [createTestI18n()],
      },
    })

    await expect.element(page.getByText('Saved')).toBeVisible()
    await expect.element(page.getByText('WebGAL Animation')).toBeVisible()
    await expect.element(page.getByText('3 frames')).toBeVisible()
    await expect.element(page.getByText(/lines$/)).not.toBeInTheDocument()
    await expect.element(page.getByText(/words$/)).not.toBeInTheDocument()
  })
})
