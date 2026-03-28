import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import { reactive } from 'vue'

import { createBrowserLocalizedI18n } from '~/__tests__/browser'
import { renderInBrowser } from '~/__tests__/browser-render'

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

vi.mock('~/commands/fs', () => ({
  fsCmds: {
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

function createEditorStatusBarLocalizedI18n() {
  return createBrowserLocalizedI18n({
    messages: {
      'zh-Hans': {
        common: {
          saved: '已保存',
          unsaved: '未保存',
        },
        edit: {
          assetPanel: {
            tabs: {
              template: '模板',
            },
          },
          statusBar: {
            frames: '{count} 帧',
            statements: '{count} 条语句',
          },
          textEditor: {
            languages: {
              webgalanimation: 'WebGAL 动画',
              webgalscript: 'WebGAL 脚本',
            },
            stats: {
              lines: '{count} 行',
              words: '{count} 字',
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

    renderInBrowser(EditorStatusBar, {
      global: {
        plugins: [createEditorStatusBarLocalizedI18n()],
      },
    })

    await expect.element(page.getByText('已保存')).toBeVisible()
    await expect.element(page.getByText('just now')).toBeVisible()
    await expect.element(page.getByText('WebGAL 脚本')).toBeVisible()
    await expect.element(page.getByText('2 行')).toBeVisible()
    await expect.element(page.getByText('4 字')).toBeVisible()
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

    renderInBrowser(EditorStatusBar, {
      global: {
        plugins: [createEditorStatusBarLocalizedI18n()],
      },
    })

    await expect.element(page.getByText('1280 × 720')).toBeVisible()
    await expect.element(page.getByText('2.0 KiB')).toBeVisible()
    expect(getImageDimensionsMock).toHaveBeenCalledWith('/project/background.png')
  })
})
