import { beforeEach, describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import { defineComponent, h, reactive, ref } from 'vue'

import { renderInBrowser } from '~/__tests__/browser-render'

import AssetView from './AssetView.vue'

import type { Component, PropType } from 'vue'
import type { FileViewerItem, FileViewerPreviewSize } from '~/types/file-viewer'

const PREVIEW_TIMESTAMP = Date.parse('2023-11-14T22:13:20.000Z')

const PREVIEW_ITEM: FileViewerItem = {
  name: 'cover.png',
  path: '/games/demo/assets/bg/cover.png',
  isDir: false,
  mimeType: 'image/png',
  modifiedAt: PREVIEW_TIMESTAMP,
  createdAt: PREVIEW_TIMESTAMP,
}

const PREVIEW_SIZE: FileViewerPreviewSize = {
  width: 72,
  height: 72,
}

const {
  gameAssetDirMock,
  getFolderContentsMock,
  joinMock,
  resolveAssetUrlMock,
  useFileStoreMock,
  usePreferenceStoreMock,
  useTabsStoreMock,
  useWorkspaceStoreMock,
} = vi.hoisted(() => ({
  gameAssetDirMock: vi.fn(),
  getFolderContentsMock: vi.fn(),
  joinMock: vi.fn(),
  resolveAssetUrlMock: vi.fn(),
  useFileStoreMock: vi.fn(),
  usePreferenceStoreMock: vi.fn(),
  useTabsStoreMock: vi.fn(),
  useWorkspaceStoreMock: vi.fn(),
}))

vi.mock('@tauri-apps/api/path', async () => {
  const actual = await vi.importActual<typeof import('@tauri-apps/api/path')>('@tauri-apps/api/path')

  return {
    ...actual,
    join: joinMock,
  }
})

vi.mock('~/services/platform/app-paths', () => ({
  gameAssetDir: gameAssetDirMock,
}))

vi.mock('~/services/platform/asset-url', () => ({
  resolveAssetUrl: resolveAssetUrlMock,
}))

vi.mock('~/stores/file', () => ({
  useFileStore: useFileStoreMock,
}))

vi.mock('~/stores/preference', () => ({
  usePreferenceStore: usePreferenceStoreMock,
}))

vi.mock('~/stores/tabs', () => ({
  useTabsStore: useTabsStoreMock,
}))

vi.mock('~/stores/workspace', () => ({
  useWorkspaceStore: useWorkspaceStoreMock,
}))

function createFileViewerStub() {
  return defineComponent({
    name: 'StubFileViewer',
    props: {
      resolvePreviewUrl: {
        type: Function as PropType<((item: FileViewerItem, previewSize: FileViewerPreviewSize) => string | undefined) | undefined>,
        default: undefined,
      },
    },
    setup(props, { expose }) {
      expose({
        scrollToIndex: vi.fn(),
        viewport: undefined,
      })

      return () => h('output', {
        'data-testid': 'preview-url',
        'data-preview-url': props.resolvePreviewUrl?.(PREVIEW_ITEM, PREVIEW_SIZE) ?? '',
      })
    },
  })
}

function createHarness() {
  return defineComponent({
    name: 'AssetViewHarness',
    setup() {
      const currentPath = ref('')

      return () => h(AssetView as Component, {
        'assetType': 'bg',
        'current-path': currentPath.value,
        'onUpdate:current-path': (value: string) => {
          currentPath.value = value
        },
      })
    },
  })
}

describe('AssetView', () => {
  beforeEach(() => {
    gameAssetDirMock.mockReset()
    getFolderContentsMock.mockReset()
    joinMock.mockReset()
    resolveAssetUrlMock.mockReset()
    useFileStoreMock.mockReset()
    usePreferenceStoreMock.mockReset()
    useTabsStoreMock.mockReset()
    useWorkspaceStoreMock.mockReset()

    gameAssetDirMock.mockResolvedValue('/games/demo/assets/bg')
    getFolderContentsMock.mockResolvedValue([])
    joinMock.mockImplementation(async (...paths: string[]) => paths.filter(Boolean).join('/'))
    resolveAssetUrlMock.mockReturnValue('http://127.0.0.1:8899/game/demo/assets/bg/cover.png?t=1700000000000')

    useFileStoreMock.mockReturnValue({
      getFolderContents: getFolderContentsMock,
    })
    usePreferenceStoreMock.mockReturnValue(reactive({
      assetViewMode: 'grid',
      assetZoom: [100],
    }))
    useTabsStoreMock.mockReturnValue({
      openTab: vi.fn(),
      tabs: [],
      findTabIndex: vi.fn(() => -1),
      fixPreviewTab: vi.fn(),
    })
    useWorkspaceStoreMock.mockReturnValue(reactive({
      currentGame: {
        path: '/games/demo',
      },
      currentGameServeUrl: 'http://127.0.0.1:8899/game/demo/',
    }))
  })

  it('文件视图图片预览会按实际展示尺寸生成缩略图 URL', async () => {
    renderInBrowser(createHarness(), {
      global: {
        stubs: {
          FileViewer: createFileViewerStub(),
        },
      },
    })

    await expect.element(page.getByTestId('preview-url')).toHaveAttribute(
      'data-preview-url',
      'http://127.0.0.1:8899/game/demo/assets/bg/cover.png?t=1700000000000',
    )

    expect(resolveAssetUrlMock).toHaveBeenCalledWith('/games/demo/assets/bg/cover.png', {
      cwd: '/games/demo',
      cacheVersion: PREVIEW_TIMESTAMP,
      previewBaseUrl: 'http://127.0.0.1:8899/game/demo/',
      thumbnail: {
        width: 72,
        height: 72,
        resizeMode: 'contain',
      },
    })
  })
})
