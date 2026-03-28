import { afterEach, describe, expect, it, vi } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { defineComponent, h, ref } from 'vue'

import { createBrowserClickStub, createBrowserContainerStub, renderInBrowser } from '~/__tests__/browser-render'
import { createTestEngine } from '~/__tests__/factories'

import EnginesTabCollectionSection from './EnginesTabCollectionSection.vue'

import type { PropType } from 'vue'
import type { Engine } from '~/database/model'

vi.mock('~/composables/useTauriDropZone', () => ({
  useTauriDropZone: () => ({
    files: ref<string[] | undefined>(undefined),
    isOverDropZone: ref(false),
  }),
}))

interface ThumbnailStubValue {
  width: number
  height: number
  resizeMode?: 'contain' | 'cover'
}

function createAssetImageStub() {
  return defineComponent({
    name: 'StubAssetImage',
    props: {
      alt: {
        type: String,
        default: undefined,
      },
      path: {
        type: String,
        default: undefined,
      },
      cacheVersion: {
        type: Number,
        default: undefined,
      },
      thumbnail: {
        type: Object as PropType<ThumbnailStubValue | undefined>,
        default: undefined,
      },
    },
    setup(props, { attrs }) {
      return () => h('img', {
        ...attrs,
        'alt': props.alt,
        'data-path': props.path,
        'data-cache-version': props.cacheVersion === undefined ? undefined : String(props.cacheVersion),
        'data-thumbnail': props.thumbnail === undefined ? undefined : JSON.stringify(props.thumbnail),
      })
    },
  })
}

const globalStubs = {
  AssetImage: createAssetImageStub(),
  Button: createBrowserClickStub('StubButton'),
  Card: createBrowserContainerStub('StubCard'),
  CardContent: createBrowserContainerStub('StubCardContent'),
  ContextMenu: createBrowserContainerStub('StubContextMenu'),
  ContextMenuContent: createBrowserContainerStub('StubContextMenuContent'),
  ContextMenuItem: createBrowserClickStub('StubContextMenuItem'),
  ContextMenuTrigger: createBrowserContainerStub('StubContextMenuTrigger'),
  Progress: createBrowserContainerStub('StubProgress'),
  Tooltip: createBrowserContainerStub('StubTooltip'),
  TooltipContent: createBrowserContainerStub('StubTooltipContent'),
  TooltipProvider: createBrowserContainerStub('StubTooltipProvider'),
  TooltipTrigger: createBrowserContainerStub('StubTooltipTrigger'),
}

function createHarness(viewMode: 'grid' | 'list') {
  return defineComponent({
    name: `EnginesTabCollectionSection${viewMode}Harness`,
    setup() {
      const importCount = ref(0)

      return () => h('div', [
        h(EnginesTabCollectionSection, {
          engines: [],
          getEngineProgress: () => 0,
          hasEngineProgress: () => false,
          resolveEngineServeUrl: () => 'http://127.0.0.1:8899/game/engine/',
          viewMode,
          onImportClick: () => {
            importCount.value += 1
          },
        }),
        h('output', { 'data-testid': 'import-count' }, String(importCount.value)),
      ])
    },
  })
}

describe('EnginesTabCollectionSection', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('网格视图中处理中的引擎不会显示打开和卸载操作', async () => {
    renderInBrowser(EnginesTabCollectionSection, {
      browser: {
        i18nMode: 'lite',
      },
      props: {
        engines: [createTestEngine()],
        getEngineProgress: () => 50,
        hasEngineProgress: () => true,
        resolveEngineServeUrl: () => 'http://127.0.0.1:8899/game/engine/',
        viewMode: 'grid',
      },
      global: {
        stubs: globalStubs,
      },
    })

    await expect.element(page.getByRole('button', { name: 'common.openFolder' })).not.toBeInTheDocument()
    await expect.element(page.getByRole('button', { name: 'home.engines.uninstallEngine' })).not.toBeInTheDocument()
  })

  it('网格导入入口支持键盘触发', async () => {
    renderInBrowser(createHarness('grid'), {
      browser: {
        i18nMode: 'lite',
      },
      global: {
        stubs: globalStubs,
      },
    })

    const importButton = page.getByRole('button', { name: 'home.engines.installEngine' })
    await expect.element(importButton).toBeInTheDocument()
    const importButtonElement = await importButton.element()
    importButtonElement.focus()
    await userEvent.keyboard('{Enter}')

    await expect.element(page.getByTestId('import-count')).toHaveTextContent('1')
  })

  it('列表导入入口支持键盘触发', async () => {
    renderInBrowser(createHarness('list'), {
      browser: {
        i18nMode: 'lite',
      },
      global: {
        stubs: globalStubs,
      },
    })

    const importButton = page.getByRole('button', { name: 'home.engines.installEngine' })
    await expect.element(importButton).toBeInTheDocument()
    const importButtonElement = await importButton.element()
    importButtonElement.focus()
    await userEvent.keyboard('{Enter}')

    await expect.element(page.getByTestId('import-count')).toHaveTextContent('1')
  })

  it('会为网格视图中的引擎图标传入固定缩略图尺寸', async () => {
    renderInBrowser(EnginesTabCollectionSection, {
      browser: {
        i18nMode: 'lite',
      },
      props: {
        engines: [createTestEngine()],
        getEngineProgress: () => 0,
        hasEngineProgress: () => false,
        resolveEngineServeUrl: () => 'http://127.0.0.1:8899/game/engine/',
        viewMode: 'grid',
      },
      global: {
        stubs: globalStubs,
      },
    })

    const iconImage = await page.getByAltText('home.engines.engineIcon').element()
    expect(iconImage.dataset.thumbnail).toBe(JSON.stringify({ width: 120, height: 120, resizeMode: 'cover' }))
  })

  it('会为列表视图中的引擎图标传入固定缩略图尺寸', async () => {
    renderInBrowser(EnginesTabCollectionSection, {
      browser: {
        i18nMode: 'lite',
      },
      props: {
        engines: [createTestEngine()],
        getEngineProgress: () => 0,
        hasEngineProgress: () => false,
        resolveEngineServeUrl: () => 'http://127.0.0.1:8899/game/engine/',
        viewMode: 'list',
      },
      global: {
        stubs: globalStubs,
      },
    })

    const iconImage = await page.getByAltText('home.engines.engineIcon').element()
    expect(iconImage.dataset.thumbnail).toBe(JSON.stringify({ width: 80, height: 80, resizeMode: 'cover' }))
  })

  it('引擎图标会使用资源级 cacheVersion 作为缓存指纹', async () => {
    const engine = createTestEngine() as Engine & {
      previewAssets: {
        icon: { path: string, cacheVersion: number }
      }
    }

    engine.previewAssets = {
      icon: {
        path: '/engines/default/icon-from-preview.png',
        cacheVersion: 333,
      },
    }

    renderInBrowser(EnginesTabCollectionSection, {
      browser: {
        i18nMode: 'lite',
      },
      props: {
        engines: [engine],
        getEngineProgress: () => 0,
        hasEngineProgress: () => false,
        resolveEngineServeUrl: () => 'http://127.0.0.1:8899/game/engine/',
        viewMode: 'grid',
      },
      global: {
        stubs: globalStubs,
      },
    })

    const iconImage = await page.getByAltText('home.engines.engineIcon').element()
    expect(iconImage.dataset.path).toBe('/engines/default/icon-from-preview.png')
    expect(iconImage.dataset.cacheVersion).toBe('333')
  })
})
