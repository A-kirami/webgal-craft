import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import { reactive } from 'vue'

import { createBrowserConsoleMonitor, createBrowserLocalizedI18n } from '~/__tests__/browser'
import { createBrowserContainerStub, createBrowserTextStub, renderInBrowser } from '~/__tests__/browser-render'

const {
  useEditorStoreMock,
  useModalStoreMock,
  useTabsStoreMock,
  useVisualEditorSaveShortcutMock,
} = vi.hoisted(() => ({
  useEditorStoreMock: vi.fn(),
  useModalStoreMock: vi.fn(),
  useTabsStoreMock: vi.fn(),
  useVisualEditorSaveShortcutMock: vi.fn(),
}))

vi.mock('@tauri-apps/api/path', () => ({
  basename: vi.fn(async (filePath: string) => filePath.split(/[/\\]/).at(-1) ?? ''),
  dirname: vi.fn(async (filePath: string) => filePath.replace(/[\\/][^\\/]+$/, '')),
  extname: vi.fn(async (filePath: string) => {
    const match = /\.[^./\\]+$/.exec(filePath)
    return match?.[0] ?? ''
  }),
  join: vi.fn(async (...parts: string[]) => parts.join('/')),
  normalize: vi.fn((filePath: string) => filePath.replaceAll('\\', '/')),
  sep: '/',
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

vi.mock('~/stores/modal', () => ({
  useModalStore: useModalStoreMock,
}))

vi.mock('~/features/editor/visual-editor/useVisualEditorSaveShortcut', () => ({
  useVisualEditorSaveShortcut: useVisualEditorSaveShortcutMock,
}))

import FileEditor from './FileEditor.vue'

const globalStubs = {
  AssetPreview: createBrowserTextStub('StubAssetPreview', 'Asset Preview'),
  Button: createBrowserContainerStub('StubButton', 'button'),
  Empty: createBrowserContainerStub('StubEmpty'),
  EmptyContent: createBrowserContainerStub('StubEmptyContent'),
  EmptyDescription: createBrowserContainerStub('StubEmptyDescription'),
  EmptyHeader: createBrowserContainerStub('StubEmptyHeader'),
  EmptyMedia: createBrowserContainerStub('StubEmptyMedia'),
  EmptyTitle: createBrowserContainerStub('StubEmptyTitle'),
  TextEditor: createBrowserTextStub('StubTextEditor', 'Text Editor'),
  VisualEditorAnimation: createBrowserTextStub('StubVisualEditorAnimation', 'Visual Editor Animation'),
  VisualEditorScene: createBrowserTextStub('StubVisualEditorScene', 'Visual Editor Scene'),
}

const { expectNoConsoleMessage } = createBrowserConsoleMonitor()

function createFileEditorLocalizedI18n() {
  return createBrowserLocalizedI18n({
    messages: {
      'zh-Hans': {
        edit: {
          empty: {
            createScene: '创建场景',
            description: '未选择文件',
            title: '暂无打开文件',
          },
          textEditor: {
            invalidAnimationVisualMessage: '当前动画文件存在错误，无法在可视化模式下编辑，请切换到文本模式修复',
          },
          editorMode: {
            textMode: '切换到文本',
            switchToText: '切换到文本',
          },
          unsupported: {
            unsupportedFile: '不支持的文件',
          },
        },
      },
    },
  })
}

describe('FileEditor', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  beforeEach(() => {
    useEditorStoreMock.mockReset()
    useModalStoreMock.mockReset()
    useTabsStoreMock.mockReset()
    useVisualEditorSaveShortcutMock.mockReset()
  })

  it('动画文本无效时切到可视化会显示错误占位而不是状态栏之外的编辑器', async () => {
    const switchEditorMode = vi.fn()
    const tabsStore = reactive({
      activeTab: {
        path: '/game/animation/broken.json',
      },
      tabs: [{
        path: '/game/animation/broken.json',
      }],
    })

    useEditorStoreMock.mockReturnValue(reactive({
      currentState: {
        kind: 'animation',
        path: '/game/animation/broken.json',
        projection: 'visual',
      },
      currentTextProjection: {
        kind: 'animation',
        path: '/game/animation/broken.json',
        projection: 'text',
        syncError: 'invalid-animation-json',
      },
      currentVisualProjection: {
        kind: 'animation',
        path: '/game/animation/broken.json',
        projection: 'visual',
      },
      switchEditorMode,
    }))
    useTabsStoreMock.mockReturnValue(tabsStore)
    useModalStoreMock.mockReturnValue({
      open: vi.fn(),
    })

    renderInBrowser(FileEditor, {
      global: {
        plugins: [createFileEditorLocalizedI18n()],
        stubs: globalStubs,
      },
    })

    await expect.element(page.getByText('当前动画文件存在错误，无法在可视化模式下编辑，请切换到文本模式修复')).toBeVisible()
    await expect.element(page.getByRole('button', { name: '切换到文本' })).toBeVisible()
    await expect.element(page.getByText('Visual Editor Animation')).not.toBeInTheDocument()

    await page.getByRole('button', { name: '切换到文本' }).click()

    expect(switchEditorMode).toHaveBeenCalledWith('text')
    expectNoConsoleMessage('decodeEntities option is passed but will be ignored in non-browser builds')
  })
})
