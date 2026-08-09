import { beforeEach, describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import { defineComponent, h, shallowRef } from 'vue'

import {
  createBrowserClickStub,
  createBrowserContainerStub,
  renderInBrowser,
} from '~/__tests__/browser-render'
import { createTestEngine } from '~/__tests__/factories'
import { AbsPath } from '~/domain/path'

import EngineGroupCard from './EngineGroupCard.vue'

import type { OfficialEngineRelease } from '~/domain/engine/official-release'
import type { EngineGroupCollectionItem } from '~/features/home/home-collection-items'

function createProgressStub() {
  return defineComponent({
    name: 'StubProgress',
    props: {
      modelValue: {
        type: Number,
        default: 0,
      },
    },
    setup(props, { attrs }) {
      return () => h('progress', {
        ...attrs,
        max: 100,
        value: props.modelValue,
      })
    },
  })
}

function createPopoverContentAutoFocusStub() {
  return defineComponent({
    name: 'StubPopoverContent',
    emits: ['openAutoFocus'],
    setup(_, { attrs, emit, slots }) {
      const autoFocusPrevented = shallowRef(false)

      function requestAutoFocus(): void {
        const event = new Event('openAutoFocus', { cancelable: true })
        emit('openAutoFocus', event)
        autoFocusPrevented.value = event.defaultPrevented
      }

      return () => h('div', attrs, [
        h('button', {
          'aria-label': 'popover.requestAutoFocus',
          'onClick': requestAutoFocus,
          'type': 'button',
        }),
        ...(slots.default?.() ?? []),
        h('output', { 'data-testid': 'popover-auto-focus-prevented' }, String(autoFocusPrevented.value)),
      ])
    },
  })
}

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
  Progress: createProgressStub(),
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
  const stable = createTestEngine({
    id: 'stable',
    name: 'WebGAL',
    path: AbsPath.from('/engines/WebGAL/4.5.0'),
    version: '4.5.0',
    metadata: {
      description: 'Stable release',
    },
  })
  const unavailable = createTestEngine({
    id: 'unavailable',
    name: 'WebGAL',
    path: AbsPath.from('/engines/WebGAL/4.6.0'),
    availability: 'broken',
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
    isImporting: false,
    isUnavailable: false,
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

function createImportingGroup(): EngineGroupCollectionItem {
  const importingEngine = createTestEngine({
    id: 'importing',
    name: 'WebGAL',
    path: AbsPath.from('/engines/WebGAL/4.7.0'),
    status: 'creating',
    version: '4.7.0',
  })

  return {
    ...createGroup(),
    engines: [
      {
        engine: importingEngine,
        serveUrl: 'serve://importing',
      },
    ],
    hasAvailableVersion: false,
    isImporting: true,
    isUnavailable: false,
    isDefault: false,
    latestVersionLabel: undefined,
    representativeItem: {
      engine: importingEngine,
      serveUrl: 'serve://importing',
    },
    unavailableCount: 0,
    versionCount: 1,
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

  it('官方组会展示绿色官方徽标，并提供总览与版本级发布页入口', async () => {
    const onDownloadVersion = vi.fn()
    const onOpenRelease = vi.fn()
    const onOpenVersionRelease = vi.fn()
    renderInBrowser(EngineGroupCard, {
      props: {
        group: {
          ...createGroup(),
          remote: {
            releases: [createOfficialRelease('4.6.4')],
            status: 'ready',
          },
        },
        viewMode: 'list',
        onDownloadVersion,
        onOpenRelease,
        onOpenVersionRelease,
      },
      browser: {
        i18nMode: 'lite',
      },
      global: {
        stubs: globalStubs,
      },
    })

    await expect.element(page.getByText('home.engines.official.badge')).toHaveClass('bg-emerald-50')
    await expect.element(page.getByText('home.engines.official.badge')).toHaveClass('text-emerald-700')
    await expect.element(page.getByText('home.engines.official.badge')).toHaveClass('hover:bg-emerald-50')
    const openReleaseActions = page.getByRole('button', { name: 'common.openReleasePage' })
    expect(openReleaseActions.elements()).toHaveLength(3)
    await openReleaseActions.last().click()
    await openReleaseActions.first().click()
    const updateButton = page.getByRole('button', { name: 'home.engines.official.update' })
    await expect.element(updateButton).toHaveAttribute('variant', 'outline')
    await updateButton.click()

    expect(onOpenRelease).toHaveBeenCalledOnce()
    expect(onOpenVersionRelease).toHaveBeenCalledWith('https://example.com/releases/4.6.4')
    expect(onDownloadVersion).toHaveBeenCalledWith('4.6.4')
  })

  it('会在卡片摘要中展示最新已安装版本', async () => {
    renderInBrowser(EngineGroupCard, {
      props: {
        group: {
          ...createGroup(),
          remote: {
            releases: [createOfficialRelease('4.6.4')],
            status: 'ready',
          },
        },
        viewMode: 'list',
      },
      browser: {
        i18nMode: 'localized',
      },
      global: {
        stubs: globalStubs,
      },
    })

    await expect.element(page.getByText(
      '4.6.0 · 已安装 2 个版本 · 共 3 个版本',
      { exact: true },
    )).toBeVisible()
  })

  it('未安装官方引擎时会展示版本总数', async () => {
    renderInBrowser(EngineGroupCard, {
      props: {
        group: {
          ...createGroup(),
          engines: [],
          hasAvailableVersion: false,
          latestVersionLabel: undefined,
          remote: {
            releases: [
              createOfficialRelease('4.6.4'),
              createOfficialRelease('4.6.3'),
              createOfficialRelease('4.6.2'),
            ],
            status: 'ready',
          },
          representativeItem: undefined,
          versionCount: 0,
        },
        viewMode: 'list',
      },
      browser: {
        i18nMode: 'lite',
      },
      global: {
        stubs: globalStubs,
      },
    })

    await expect.element(page.getByText(
      'engine.notInstalled · engine.totalVersions',
      { exact: true },
    )).toBeVisible()
    await expect.element(page.getByRole('button', { name: 'home.engines.official.install' })).toBeVisible()
  })

  it('已安装最新远端版本时不因缺少旧版本显示更新操作', async () => {
    renderInBrowser(EngineGroupCard, {
      props: {
        group: {
          ...createGroup(),
          remote: {
            releases: [
              createOfficialRelease('4.6.0'),
              createOfficialRelease('4.5.5'),
            ],
            status: 'ready',
          },
        },
        viewMode: 'list',
      },
      browser: {
        i18nMode: 'lite',
      },
      global: {
        stubs: globalStubs,
      },
    })

    await expect.element(page.getByRole('button', { name: 'home.engines.official.update' })).not.toBeInTheDocument()
    await expect.element(page.getByRole('button', { name: 'home.engines.official.install' })).not.toBeInTheDocument()
  })

  it('打开版本列表时不会自动聚焦首个操作按钮', async () => {
    renderInBrowser(EngineGroupCard, {
      props: {
        group: {
          ...createGroup(),
          remote: {
            releases: [createOfficialRelease('4.6.4')],
            status: 'ready',
          },
        },
        viewMode: 'list',
      },
      browser: {
        i18nMode: 'lite',
      },
      global: {
        stubs: {
          ...globalStubs,
          PopoverContent: createPopoverContentAutoFocusStub(),
        },
      },
    })

    await page.getByRole('button', { name: 'popover.requestAutoFocus' }).click()

    await expect.element(page.getByTestId('popover-auto-focus-prevented')).toHaveTextContent('true')
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

  it('当前默认组即使没有可用版本也允许取消默认', async () => {
    renderInBrowser(EngineGroupCard, {
      props: {
        group: {
          ...createGroup(),
          hasAvailableVersion: false,
          isImporting: false,
          isUnavailable: true,
          latestVersionLabel: undefined,
        },
        viewMode: 'list',
      },
      browser: {
        i18nMode: 'lite',
      },
      global: {
        stubs: globalStubs,
      },
    })

    await expect.element(page.getByRole('button', { name: 'engine.unsetDefaultEngine' }).first()).not.toBeDisabled()
  })

  it('导入中的引擎组不会显示失效徽标', async () => {
    renderInBrowser(EngineGroupCard, {
      props: {
        group: createImportingGroup(),
        progress: 42,
        viewMode: 'grid',
      },
      browser: {
        i18nMode: 'lite',
      },
      global: {
        stubs: globalStubs,
      },
    })

    await expect.element(page.getByText('home.unavailableBadge')).not.toBeInTheDocument()
    await expect.element(page.getByText('home.engines.importing')).toBeVisible()
    await expect.element(page.getByRole('button', { name: 'engine.uninstallAllVersions' })).not.toBeInTheDocument()
    await expect.element(page.getByRole('button', { name: 'engine.deleteVersion' })).not.toBeInTheDocument()
    const progress = await page.getByRole('progressbar').element() as HTMLProgressElement
    expect(progress.value).toBe(42)
  })

  it('导入进度尚未开始时也会显示导入中状态', async () => {
    renderInBrowser(EngineGroupCard, {
      props: {
        group: createImportingGroup(),
        viewMode: 'list',
      },
      browser: {
        i18nMode: 'lite',
      },
      global: {
        stubs: globalStubs,
      },
    })

    await expect.element(page.getByText('home.engines.importing')).toBeVisible()
    await expect.element(page.getByRole('progressbar')).not.toBeInTheDocument()
  })
})
