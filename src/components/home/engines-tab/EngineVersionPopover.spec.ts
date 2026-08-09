import { describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'

import {
  createBrowserClickStub,
  createBrowserContainerStub,
  renderInBrowser,
} from '~/__tests__/browser-render'
import { createTestEngine } from '~/__tests__/factories'
import { AbsPath } from '~/domain/path'

import EngineVersionPopover from './EngineVersionPopover.vue'

import type { OfficialEngineRelease } from '~/domain/engine/official-release'
import type { EngineGroupCollectionItem } from '~/features/home/home-collection-items'

const globalStubs = {
  Badge: createBrowserContainerStub('StubBadge', 'span'),
  Button: createBrowserClickStub('StubButton'),
  Tooltip: createBrowserContainerStub('StubTooltip'),
  TooltipContent: createBrowserContainerStub('StubTooltipContent'),
  TooltipProvider: createBrowserContainerStub('StubTooltipProvider'),
  TooltipTrigger: createBrowserContainerStub('StubTooltipTrigger'),
}

function createOfficialRelease(version: string): OfficialEngineRelease {
  return {
    assetName: `WebGAL-${version}-web.zip`,
    assetUrl: `https://example.com/downloads/${version}.zip`,
    engineId: 'open-webgal.webgal',
    name: 'WebGAL',
    releaseUrl: `https://example.com/releases/${version}`,
    sha256: 'a'.repeat(64),
    version,
  }
}

function createGroup(): EngineGroupCollectionItem {
  const installedEngine = createTestEngine({
    id: 'webgal-4.6.3',
    name: 'WebGAL',
    path: AbsPath.from('/engines/WebGAL/4.6.3'),
    version: '4.6.3',
  })
  const importedEngine = createTestEngine({
    id: 'webgal-4.6.2',
    name: 'WebGAL',
    path: AbsPath.from('/engines/WebGAL/4.6.2'),
    version: '4.6.2',
  })

  return {
    engineId: 'open-webgal.webgal',
    engines: [
      { engine: installedEngine },
      { engine: importedEngine },
    ],
    hasAvailableVersion: true,
    isDefault: false,
    isImporting: false,
    isUnavailable: false,
    latestVersionLabel: '4.6.3',
    name: 'WebGAL',
    remote: {
      releases: [
        createOfficialRelease('4.6.4'),
        createOfficialRelease('4.6.3'),
      ],
      status: 'ready',
    },
    representativeItem: { engine: installedEngine },
    summary: '',
    unavailableCount: 0,
    versionCount: 2,
  }
}

describe('EngineVersionPopover', () => {
  it('将已安装和可下载版本合并为降序列表，并为缓存版本提供发布页入口', async () => {
    const onDownloadVersion = vi.fn()
    const onOpenVersionRelease = vi.fn()
    renderInBrowser(EngineVersionPopover, {
      props: {
        group: createGroup(),
        onDownloadVersion,
        onOpenVersionRelease,
      },
      browser: {
        i18nMode: 'lite',
      },
      global: {
        stubs: globalStubs,
      },
    })

    await expect.element(page.getByText('engine.installedVersions')).not.toBeInTheDocument()
    await expect.element(page.getByText('engine.downloadableVersions')).not.toBeInTheDocument()
    const latestVersion = await page.getByText('4.6.4').element()
    const installedVersion = await page.getByText('4.6.3').element()
    expect(latestVersion.compareDocumentPosition(installedVersion) & Node.DOCUMENT_POSITION_FOLLOWING)
      .toBe(Node.DOCUMENT_POSITION_FOLLOWING)
    expect(page.getByText('4.6.3').elements()).toHaveLength(1)

    const openVersionReleaseButtons = page.getByRole('button', {
      name: 'common.openReleasePage',
    })
    expect(openVersionReleaseButtons.elements()).toHaveLength(2)
    expect(page.getByText('common.openReleasePage').elements()).toHaveLength(2)
    expect(page.getByText('home.engines.official.download').elements()).toHaveLength(1)
    expect(page.getByText('engine.deleteVersion').elements()).toHaveLength(2)
    await openVersionReleaseButtons.first().click()
    await openVersionReleaseButtons.last().click()

    await page.getByRole('button', { name: 'home.engines.official.download' }).click()

    expect(onDownloadVersion).toHaveBeenCalledWith('4.6.4')
    expect(onOpenVersionRelease).toHaveBeenNthCalledWith(1, 'https://example.com/releases/4.6.4')
    expect(onOpenVersionRelease).toHaveBeenNthCalledWith(2, 'https://example.com/releases/4.6.3')
  })
})
