import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import { render } from 'vitest-browser-vue'
import { defineComponent, h, reactive } from 'vue'
import { createI18n } from 'vue-i18n'

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

vi.mock('~/composables/useVisualEditorSaveShortcut', () => ({
  useVisualEditorSaveShortcut: useVisualEditorSaveShortcutMock,
}))

import { createBrowserConsoleMonitor } from '~/__tests__/browser'

import FileEditor from './FileEditor.vue'

function createStubComponent(name: string, options: { tag?: string, text?: string }) {
  const tag = options.tag ?? 'div'

  return defineComponent({
    name,
    setup(_, { attrs, slots }) {
      return () => options.text === undefined
        ? h(tag, attrs, slots.default?.())
        : h('div', options.text)
    },
  })
}

const globalStubs = {
  AssetPreview: createStubComponent('StubAssetPreview', { text: 'Asset Preview' }),
  Button: createStubComponent('StubButton', { tag: 'button' }),
  Empty: createStubComponent('StubEmpty', {}),
  EmptyContent: createStubComponent('StubEmptyContent', {}),
  EmptyDescription: createStubComponent('StubEmptyDescription', {}),
  EmptyHeader: createStubComponent('StubEmptyHeader', {}),
  EmptyMedia: createStubComponent('StubEmptyMedia', {}),
  EmptyTitle: createStubComponent('StubEmptyTitle', {}),
  TextEditor: createStubComponent('StubTextEditor', { text: 'Text Editor' }),
  VisualEditorAnimation: createStubComponent('StubVisualEditorAnimation', { text: 'Visual Editor Animation' }),
  VisualEditorScene: createStubComponent('StubVisualEditorScene', { text: 'Visual Editor Scene' }),
}

const { expectNoConsoleMessage } = createBrowserConsoleMonitor()

function createTestI18n() {
  return createI18n({
    legacy: false,
    locale: 'en',
    messages: {
      en: {
        edit: {
          empty: {
            createScene: 'Create scene',
            description: 'No file selected',
            title: 'Nothing open',
          },
          textEditor: {
            invalidAnimationVisualMessage: 'Current animation file has errors and cannot be shown in visual mode. Switch to text mode to fix it.',
          },
          editorMode: {
            textMode: 'Switch to Text',
            switchToText: 'Switch to Text',
          },
          unsupported: {
            unsupportedFile: 'Unsupported file',
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

    render(FileEditor, {
      global: {
        plugins: [createTestI18n()],
        stubs: globalStubs,
      },
    })

    await expect.element(page.getByText('Current animation file has errors and cannot be shown in visual mode. Switch to text mode to fix it.')).toBeVisible()
    await expect.element(page.getByRole('button', { name: 'Switch to Text' })).toBeVisible()
    await expect.element(page.getByText('Visual Editor Animation')).not.toBeInTheDocument()

    await page.getByRole('button', { name: 'Switch to Text' }).click()

    expect(switchEditorMode).toHaveBeenCalledWith('text')
    expectNoConsoleMessage('decodeEntities option is passed but will be ignored in non-browser builds')
  })
})
