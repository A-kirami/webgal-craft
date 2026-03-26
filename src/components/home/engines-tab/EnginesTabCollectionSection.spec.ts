import { afterEach, describe, expect, it, vi } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { defineComponent, h, ref } from 'vue'

import { createBrowserClickStub, createBrowserContainerStub, renderInBrowser } from '~/__tests__/browser-render'
import { createTestEngine } from '~/__tests__/factories'

import EnginesTabCollectionSection from './EnginesTabCollectionSection.vue'

vi.mock('~/composables/useTauriDropZone', () => ({
  useTauriDropZone: () => ({
    files: ref<string[] | undefined>(undefined),
    isOverDropZone: ref(false),
  }),
}))

const globalStubs = {
  Button: createBrowserClickStub('StubButton'),
  Card: createBrowserContainerStub('StubCard'),
  CardContent: createBrowserContainerStub('StubCardContent'),
  ContextMenu: createBrowserContainerStub('StubContextMenu'),
  ContextMenuContent: createBrowserContainerStub('StubContextMenuContent'),
  ContextMenuItem: createBrowserClickStub('StubContextMenuItem'),
  ContextMenuTrigger: createBrowserContainerStub('StubContextMenuTrigger'),
  Progress: createBrowserContainerStub('StubProgress'),
  Thumbnail: createBrowserContainerStub('StubThumbnail', 'img'),
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
})
