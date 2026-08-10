import '~/__tests__/setup'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AbsPath } from '~/domain/path'
import { templateSwitch } from '~/services/template-switch'

const {
  cleanTemplateUpperMock,
  closeTabMock,
  debugCommanderMock,
  findTabIndexMock,
  refreshTemplateOverlayMock,
  tabsStoreMock,
} = vi.hoisted(() => ({
  cleanTemplateUpperMock: vi.fn(),
  closeTabMock: vi.fn(),
  debugCommanderMock: {
    refetchTemplates: vi.fn(),
  },
  findTabIndexMock: vi.fn(),
  refreshTemplateOverlayMock: vi.fn(),
  tabsStoreMock: {
    tabs: [] as { path: string }[],
  },
}))

vi.mock('~/services/debug-commander', () => ({
  debugCommander: debugCommanderMock,
}))

vi.mock('~/stores/editor', () => ({
  useEditorStore: () => ({
    hasUnsavedDocumentsUnder: vi.fn(),
  }),
}))

vi.mock('~/stores/file', () => ({
  useFileStore: () => ({
    refreshTemplateOverlay: refreshTemplateOverlayMock,
  }),
}))

vi.mock('~/stores/tabs', () => ({
  useTabsStore: () => ({
    tabs: tabsStoreMock.tabs,
    closeTab: closeTabMock,
    findTabIndex: findTabIndexMock,
  }),
}))

vi.mock('~/commands/vfs', () => ({
  vfsCmds: {
    cleanTemplateUpper: cleanTemplateUpperMock,
  },
}))

beforeEach(() => {
  vi.resetAllMocks()

  tabsStoreMock.tabs = []
  findTabIndexMock.mockImplementation(path => tabsStoreMock.tabs.findIndex(tab => tab.path === path))
  closeTabMock.mockImplementation((index: number) => {
    tabsStoreMock.tabs.splice(index, 1)
  })
  cleanTemplateUpperMock.mockResolvedValue(undefined)
  refreshTemplateOverlayMock.mockResolvedValue(undefined)
  debugCommanderMock.refetchTemplates.mockResolvedValue(undefined)
})

describe('templateSwitch.notifyTemplateChanged', () => {
  it('默认通知预览重新加载模板', async () => {
    await templateSwitch.notifyTemplateChanged(AbsPath.from('/games/demo'))

    expect(refreshTemplateOverlayMock).toHaveBeenCalledWith('/games/demo', {
      nextEnginePath: undefined,
      nextTemplatePath: undefined,
    })
    expect(debugCommanderMock.refetchTemplates).toHaveBeenCalledTimes(1)
  })

  it('引擎切换时跳过独立的模板重载请求', async () => {
    await templateSwitch.notifyTemplateChanged(AbsPath.from('/games/demo'), {
      skipPreviewTemplateReload: true,
    })

    expect(refreshTemplateOverlayMock).toHaveBeenCalledWith('/games/demo', {
      nextEnginePath: undefined,
      nextTemplatePath: undefined,
    })
    expect(debugCommanderMock.refetchTemplates).not.toHaveBeenCalled()
  })
})

describe('templateSwitch.resetTemplate', () => {
  it('关闭模板标签、清理覆盖层后刷新文件缓存和预览', async () => {
    const gamePath = AbsPath.from('/games/demo')
    tabsStoreMock.tabs = [
      { path: '/games/demo/game/template/custom.txt' },
      { path: '/games/demo/game/scene/start.txt' },
      { path: '/games/demo/game/template/styles.css' },
      { path: '/games/demo/game/template-old/kept.txt' },
    ]

    await templateSwitch.resetTemplate(gamePath)

    expect(closeTabMock).toHaveBeenNthCalledWith(1, 0)
    expect(closeTabMock).toHaveBeenNthCalledWith(2, 1)
    expect(tabsStoreMock.tabs).toEqual([
      { path: '/games/demo/game/scene/start.txt' },
      { path: '/games/demo/game/template-old/kept.txt' },
    ])
    expect(cleanTemplateUpperMock).toHaveBeenCalledWith('/games/demo')
    expect(refreshTemplateOverlayMock).toHaveBeenCalledWith('/games/demo', {
      nextEnginePath: undefined,
      nextTemplatePath: undefined,
    })
    expect(debugCommanderMock.refetchTemplates).toHaveBeenCalledTimes(1)
    expect(cleanTemplateUpperMock.mock.invocationCallOrder[0]).toBeGreaterThan(closeTabMock.mock.invocationCallOrder[1])
    expect(refreshTemplateOverlayMock.mock.invocationCallOrder[0]).toBeGreaterThan(cleanTemplateUpperMock.mock.invocationCallOrder[0])
  })

  it('清理失败时不会刷新模板消费者', async () => {
    cleanTemplateUpperMock.mockRejectedValueOnce(new Error('clean failed'))

    await expect(templateSwitch.resetTemplate(AbsPath.from('/games/demo'))).rejects.toThrow('clean failed')

    expect(refreshTemplateOverlayMock).not.toHaveBeenCalled()
    expect(debugCommanderMock.refetchTemplates).not.toHaveBeenCalled()
  })

  it('关闭模板标签失败时不会清理覆盖层', async () => {
    const gamePath = AbsPath.from('/games/demo')
    tabsStoreMock.tabs = [{ path: '/games/demo/game/template/custom.txt' }]
    closeTabMock.mockImplementationOnce(() => {
      throw new Error('close failed')
    })

    await expect(templateSwitch.resetTemplate(gamePath)).rejects.toThrow('close failed')

    expect(cleanTemplateUpperMock).not.toHaveBeenCalled()
    expect(refreshTemplateOverlayMock).not.toHaveBeenCalled()
    expect(debugCommanderMock.refetchTemplates).not.toHaveBeenCalled()
  })
})
