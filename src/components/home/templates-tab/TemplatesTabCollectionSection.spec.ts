import { afterEach, describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'

import { createBrowserClickStub, createBrowserContainerStub, renderInBrowser } from '~/__tests__/browser-render'
import { createTestEngine } from '~/__tests__/factories'

import TemplatesTabCollectionSection from './TemplatesTabCollectionSection.vue'

import type { TemplateCollectionItem } from '~/features/home/home-collection-items'

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
      cacheVersion: {
        type: Number,
        default: undefined,
      },
      path: {
        type: String,
        default: undefined,
      },
      rootPath: {
        type: String,
        default: undefined,
      },
      serveUrl: {
        type: String,
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
        'data-cache-version': props.cacheVersion === undefined ? undefined : String(props.cacheVersion),
        'data-path': props.path,
        'data-root-path': props.rootPath,
        'data-serve-url': props.serveUrl,
        'data-thumbnail': props.thumbnail === undefined ? undefined : JSON.stringify(props.thumbnail),
      })
    },
  })
}

const globalStubs = {
  AssetImage: createAssetImageStub(),
  Badge: createBrowserContainerStub('StubBadge'),
  Button: createBrowserClickStub('StubButton'),
  Card: createBrowserContainerStub('StubCard'),
  CardContent: createBrowserContainerStub('StubCardContent'),
  ContextMenu: createBrowserContainerStub('StubContextMenu'),
  ContextMenuContent: createBrowserContainerStub('StubContextMenuContent'),
  ContextMenuItem: createBrowserClickStub('StubContextMenuItem'),
  ContextMenuTrigger: createBrowserContainerStub('StubContextMenuTrigger'),
  DropdownMenu: createBrowserContainerStub('StubDropdownMenu'),
  DropdownMenuContent: createBrowserContainerStub('StubDropdownMenuContent'),
  DropdownMenuItem: createBrowserClickStub('StubDropdownMenuItem'),
  DropdownMenuTrigger: createBrowserContainerStub('StubDropdownMenuTrigger'),
  Popover: createBrowserContainerStub('StubPopover'),
  PopoverContent: createBrowserContainerStub('StubPopoverContent'),
  PopoverTrigger: createBrowserContainerStub('StubPopoverTrigger'),
  Progress: createBrowserContainerStub('StubProgress'),
  ScrollArea: createBrowserContainerStub('StubScrollArea'),
}

function createItems(): TemplateCollectionItem[] {
  const builtinNovaEngine = createTestEngine({
    id: 'engine-3',
    name: 'WebGAL Nova',
    path: '/engines/WebGAL Nova/5.0.0',
    previewAssets: {
      icon: {
        cacheVersion: 13,
        path: 'icons/favicon.ico',
      },
    },
    version: '5.0.0',
  })
  const builtinStableEngine = createTestEngine({
    id: 'engine-2',
    name: 'WebGAL',
    path: '/engines/WebGAL/4.8.2',
    previewAssets: {
      icon: {
        cacheVersion: 21,
        path: 'icons/favicon.ico',
      },
    },
    version: '4.8.2',
  })

  return [
    {
      templateGroup: {
        key: 'standalone:Modern Template',
        name: 'Modern Template',
        sourceKind: 'standalone',
        sources: [
          {
            kind: 'standalone',
            templateId: 'template-1',
            name: 'Modern Template',
            path: '/templates/modern',
            createdAt: 1,
            webgalVersion: '4.8.1',
            availability: 'available',
          },
        ],
      },
    },
    {
      representativeEngineItem: {
        engine: builtinNovaEngine,
        serveUrl: 'serve:///engines/WebGAL Nova/5.0.0',
      },
      templateGroup: {
        key: 'engineBuiltin:WebGAL Nova',
        name: 'WebGAL Nova',
        sourceKind: 'engineBuiltin',
        sources: [
          {
            kind: 'engineBuiltin',
            engineId: 'engine-3',
            engineName: 'WebGAL Nova',
            engineVersion: '5.0.0',
            enginePath: '/engines/WebGAL Nova/5.0.0',
            templatePath: '/engines/WebGAL Nova/5.0.0/game/template',
            createdAt: 3,
          },
        ],
      },
    },
    {
      representativeEngineItem: {
        engine: builtinStableEngine,
        serveUrl: 'serve:///engines/WebGAL/4.8.2',
      },
      templateGroup: {
        key: 'engineBuiltin:WebGAL',
        name: 'WebGAL',
        sourceKind: 'engineBuiltin',
        sources: [
          {
            kind: 'engineBuiltin',
            engineId: 'engine-2',
            engineName: 'WebGAL',
            engineVersion: '4.8.2',
            enginePath: '/engines/WebGAL/4.8.2',
            templatePath: '/engines/WebGAL/4.8.2/game/template',
            createdAt: 2,
          },
          {
            kind: 'engineBuiltin',
            engineId: 'engine-1',
            engineName: 'WebGAL',
            engineVersion: '4.8.1',
            enginePath: '/engines/WebGAL/4.8.1',
            templatePath: '/engines/WebGAL/4.8.1/game/template',
            createdAt: 1,
          },
        ],
      },
    },
  ]
}

describe('TemplatesTabCollectionSection', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('网格视图中会为所有内置模板统一显示来源详情，并且只为独立模板暴露组级菜单', async () => {
    renderInBrowser(TemplatesTabCollectionSection, {
      browser: {
        i18nMode: 'lite',
      },
      props: {
        items: createItems(),
        getTemplateProgress: () => 0,
        hasTemplateProgress: () => false,
        viewMode: 'grid',
      },
      global: {
        stubs: globalStubs,
      },
    })

    await expect.element(page.getByRole('heading', { name: 'Modern Template' })).toBeVisible()
    await expect.element(page.getByRole('heading', { name: 'WebGAL Nova' })).toBeVisible()
    await expect.element(page.getByRole('heading', { exact: true, name: 'WebGAL' })).toBeVisible()
    await expect.element(page.getByText('home.templates.compatibilityVersion')).toBeVisible()
    await expect.element(page.getByText('home.templates.sourceKind.engineBuiltin').first()).toBeVisible()
    await expect.element(page.getByText('home.templates.sourceSummary.engineBuiltin').first()).toBeVisible()
    await expect.element(page.getByText('home.templates.sourceKind.standalone')).not.toBeInTheDocument()
    expect(document.querySelectorAll('button[aria-label="home.templates.actions.more"]')).toHaveLength(1)
    expect(document.querySelectorAll('button[aria-label="home.templates.actions.openEngineFolder"]')).toHaveLength(0)
    expect(document.querySelectorAll('img[data-root-path]')).toHaveLength(2)
    expect(document.querySelectorAll('svg.lucide-layout-template')).toHaveLength(1)
    for (const image of document.querySelectorAll<HTMLImageElement>('img[data-root-path]')) {
      expect(image.parentElement?.classList.contains('bg-muted')).toBe(false)
    }
    expect(document.querySelector('svg.lucide-layout-template')?.parentElement?.classList.contains('bg-muted')).toBe(true)
  })

  it('列表视图中会通过来源详情暴露内置模板目录操作，并保留独立模板删除', async () => {
    const onDeleteTemplate = vi.fn()
    const onOpenSourceFolder = vi.fn()

    renderInBrowser(TemplatesTabCollectionSection, {
      browser: {
        i18nMode: 'lite',
      },
      props: {
        items: createItems(),
        getTemplateProgress: () => 0,
        hasTemplateProgress: () => false,
        onDeleteTemplate,
        onOpenSourceFolder,
        viewMode: 'list',
      },
      global: {
        stubs: globalStubs,
      },
    })

    const standaloneHeading = [...document.querySelectorAll('h3')].find(heading => heading.textContent?.trim() === 'Modern Template')
    const builtinHeading = [...document.querySelectorAll('h3')].find(heading => heading.textContent?.trim() === 'WebGAL Nova')

    expect(standaloneHeading?.parentElement?.nextElementSibling?.textContent).toContain('home.templates.compatibilityVersion')
    expect(builtinHeading?.parentElement?.nextElementSibling?.textContent).toContain('home.templates.sourceSummary.engineBuiltin')

    await page.getByRole('button', { name: 'home.templates.deleteTemplate' }).first().click()
    const openTemplateFolderButtons = document.querySelectorAll<HTMLButtonElement>('button[aria-label="home.templates.actions.openTemplateFolder"]')
    openTemplateFolderButtons[0]?.click()
    openTemplateFolderButtons[2]?.click()

    expect(onDeleteTemplate).toHaveBeenCalledWith(expect.objectContaining({
      key: 'standalone:Modern Template',
    }))
    expect(onOpenSourceFolder).toHaveBeenNthCalledWith(1, expect.objectContaining({
      templatePath: '/engines/WebGAL Nova/5.0.0/game/template',
    }))
    expect(onOpenSourceFolder).toHaveBeenNthCalledWith(2, expect.objectContaining({
      templatePath: '/engines/WebGAL/4.8.1/game/template',
    }))
    expect(document.querySelectorAll('button[aria-label="home.templates.actions.openEngineFolder"]')).toHaveLength(0)
    expect(document.querySelectorAll('button[aria-label="home.templates.actions.more"]')).toHaveLength(1)
    expect(document.querySelectorAll('img[data-root-path]')).toHaveLength(2)
    expect(document.querySelectorAll('svg.lucide-layout-template')).toHaveLength(1)
    for (const image of document.querySelectorAll<HTMLImageElement>('img[data-root-path]')) {
      expect(image.parentElement?.classList.contains('bg-muted')).toBe(false)
    }
    expect(document.querySelector('svg.lucide-layout-template')?.parentElement?.classList.contains('bg-muted')).toBe(true)
  })
})
