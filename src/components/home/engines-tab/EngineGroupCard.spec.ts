import { beforeEach, describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'

import {
  createBrowserClickStub,
  createBrowserContainerStub,
  renderInBrowser,
} from '~/__tests__/browser-render'
import { createTestEngine } from '~/__tests__/factories'

import EngineGroupCard from './EngineGroupCard.vue'

import type { EngineGroupCollectionItem } from '~/features/home/home-collection-items'

const globalStubs = {
  AssetImage: createBrowserContainerStub('StubAssetImage', 'img'),
  Badge: createBrowserContainerStub('StubBadge', 'span'),
  Button: createBrowserClickStub('StubButton'),
  ContextMenu: createBrowserContainerStub('StubContextMenu'),
  ContextMenuContent: createBrowserContainerStub('StubContextMenuContent'),
  ContextMenuItem: createBrowserClickStub('StubContextMenuItem'),
  ContextMenuTrigger: createBrowserContainerStub('StubContextMenuTrigger'),
  DropdownMenu: createBrowserContainerStub('StubDropdownMenu'),
  DropdownMenuContent: createBrowserContainerStub('StubDropdownMenuContent'),
  DropdownMenuItem: createBrowserClickStub('StubDropdownMenuItem'),
  DropdownMenuTrigger: createBrowserContainerStub('StubDropdownMenuTrigger', 'button'),
  Popover: createBrowserContainerStub('StubPopover'),
  PopoverContent: createBrowserContainerStub('StubPopoverContent'),
  PopoverTrigger: createBrowserContainerStub('StubPopoverTrigger', 'button'),
}

function createGroup(): EngineGroupCollectionItem {
  const stable = createTestEngine({
    id: 'stable',
    name: 'WebGAL',
    path: '/engines/WebGAL/4.5.0',
    version: '4.5.0',
    metadata: {
      description: 'Stable release',
    },
  })
  const unavailable = createTestEngine({
    id: 'unavailable',
    name: 'WebGAL',
    path: '/engines/WebGAL/4.6.0',
    status: 'unavailable',
    version: '4.6.0',
  })

  return {
    engineId: 'open-webgal.webgal',
    engines: [
      {
        engine: unavailable,
        serveUrl: 'serve://unavailable',
      },
      {
        engine: stable,
        serveUrl: 'serve://stable',
      },
    ],
    hasAvailableVersion: true,
    isDefault: true,
    latestVersionLabel: '4.5.0',
    name: 'WebGAL',
    representativeItem: {
      engine: stable,
      serveUrl: 'serve://stable',
    },
    summary: 'Stable release',
    unavailableCount: 1,
    versionCount: 2,
  }
}

describe('EngineGroupCard', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('会展示引擎摘要、默认标记和版本信息', async () => {
    renderInBrowser(EngineGroupCard, {
      props: {
        group: createGroup(),
        viewMode: 'grid',
      },
      browser: {
        i18nMode: 'lite',
      },
      global: {
        stubs: globalStubs,
      },
    })

    await expect.element(page.getByText('WebGAL')).toBeInTheDocument()
    await expect.element(page.getByText('Stable release')).toBeInTheDocument()
    await expect.element(page.getByText('engine.defaultEngine')).toBeInTheDocument()
    await expect.element(page.getByText('4.5.0')).toBeInTheDocument()
  })

  it('会暴露组级操作和版本删除操作', async () => {
    const onDeleteEngine = vi.fn()
    const onDeleteGroup = vi.fn()
    const onOpenGroupFolder = vi.fn()
    const onSetDefaultEngine = vi.fn()

    renderInBrowser(EngineGroupCard, {
      props: {
        group: createGroup(),
        viewMode: 'list',
        onDeleteEngine,
        onDeleteGroup,
        onOpenGroupFolder,
        onSetDefaultEngine,
      },
      browser: {
        i18nMode: 'lite',
      },
      global: {
        stubs: globalStubs,
      },
    })

    await page.getByRole('button', { name: 'engine.unsetDefaultEngine' }).first().click()
    await page.getByRole('button', { name: 'common.openFolder' }).first().click()
    await page.getByRole('button', { name: 'engine.uninstallAllVersions' }).first().click()
    await page.getByRole('button', { name: 'engine.deleteVersion' }).first().click()

    expect(onSetDefaultEngine).toHaveBeenCalledWith(undefined)
    expect(onOpenGroupFolder).toHaveBeenCalledWith(expect.objectContaining({ name: 'WebGAL' }))
    expect(onDeleteGroup).toHaveBeenCalledWith('open-webgal.webgal')
    expect(onDeleteEngine).toHaveBeenCalledWith(expect.objectContaining({ id: 'unavailable' }))
  })
})
