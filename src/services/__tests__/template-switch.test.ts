import '~/__tests__/setup'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AbsPath } from '~/domain/path'
import { templateSwitch } from '~/services/template-switch'

vi.mock('@tauri-apps/plugin-log', () => ({
  info: vi.fn(),
  warn: vi.fn(),
}))

const {
  cleanTemplateUpperMock,
  closeTabMock,
  dbTemplateFilterFirstMock,
  debugCommanderMock,
  engineFindByRefMock,
  findTabIndexMock,
  hasUnsavedDocumentsUnderMock,
  isEngineUsableMock,
  isTemplateDirtyMock,
  refreshTemplateOverlayMock,
  tabsStoreMock,
} = vi.hoisted(() => ({
  cleanTemplateUpperMock: vi.fn(),
  closeTabMock: vi.fn(),
  dbTemplateFilterFirstMock: vi.fn(),
  debugCommanderMock: {
    refetchTemplates: vi.fn(),
  },
  engineFindByRefMock: vi.fn(),
  findTabIndexMock: vi.fn(),
  hasUnsavedDocumentsUnderMock: vi.fn(),
  isEngineUsableMock: vi.fn(),
  isTemplateDirtyMock: vi.fn(),
  refreshTemplateOverlayMock: vi.fn(),
  tabsStoreMock: {
    tabs: [] as { path: string }[],
  },
}))

vi.mock('~/services/debug-commander', () => ({
  debugCommander: debugCommanderMock,
}))

vi.mock('~/database/db', () => ({
  db: {
    templates: {
      filter: () => ({
        first: dbTemplateFilterFirstMock,
      }),
    },
  },
}))

vi.mock('~/services/engine-manager', () => ({
  engineManager: {
    findEngineByRef: engineFindByRefMock,
  },
  isEngineUsable: isEngineUsableMock,
}))

vi.mock('~/stores/editor', () => ({
  useEditorStore: () => ({
    hasUnsavedDocumentsUnder: hasUnsavedDocumentsUnderMock,
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
    isTemplateDirty: isTemplateDirtyMock,
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
  dbTemplateFilterFirstMock.mockResolvedValue(undefined)
  engineFindByRefMock.mockResolvedValue(undefined)
  hasUnsavedDocumentsUnderMock.mockReturnValue(false)
  isEngineUsableMock.mockReturnValue(true)
  isTemplateDirtyMock.mockResolvedValue(false)
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

  it('刷新模板 overlay 失败时不会报告重置成功', async () => {
    refreshTemplateOverlayMock.mockRejectedValueOnce(new Error('overlay failed'))

    await expect(templateSwitch.resetTemplate(AbsPath.from('/games/demo'))).rejects.toThrow('overlay failed')

    expect(cleanTemplateUpperMock).toHaveBeenCalledWith('/games/demo')
    expect(debugCommanderMock.refetchTemplates).not.toHaveBeenCalled()
  })

  it('预览状态重置时不阻止模板重置', async () => {
    debugCommanderMock.refetchTemplates.mockRejectedValueOnce(new Error('preview state reset'))

    await expect(templateSwitch.resetTemplate(AbsPath.from('/games/demo'))).resolves.toBeUndefined()

    expect(cleanTemplateUpperMock).toHaveBeenCalledWith('/games/demo')
  })

  it('其他预览刷新失败会向调用方传播', async () => {
    debugCommanderMock.refetchTemplates.mockRejectedValueOnce(new Error('preview failed'))

    await expect(templateSwitch.resetTemplate(AbsPath.from('/games/demo'))).rejects.toThrow('preview failed')

    expect(cleanTemplateUpperMock).toHaveBeenCalledWith('/games/demo')
  })
})

describe('templateSwitch.evaluateTemplateStrategy', () => {
  it('存在显式模板绑定时直接返回 explicit，不检查脏状态', async () => {
    const strategy = await templateSwitch.evaluateTemplateStrategy(AbsPath.from('/games/demo'), {
      version: 1,
      template: { kind: 'standalone', name: 'My Template' },
    })

    expect(strategy).toBe('explicit')
    expect(isTemplateDirtyMock).not.toHaveBeenCalled()
  })

  it('跟随引擎且覆盖层被修改时返回 dirty', async () => {
    isTemplateDirtyMock.mockResolvedValue(true)

    const strategy = await templateSwitch.evaluateTemplateStrategy(AbsPath.from('/games/demo'), { version: 1 })

    expect(strategy).toBe('dirty')
    expect(hasUnsavedDocumentsUnderMock).not.toHaveBeenCalled()
  })

  it('跟随引擎且只有模板目录下的未保存文档时返回 dirty', async () => {
    isTemplateDirtyMock.mockResolvedValue(false)
    hasUnsavedDocumentsUnderMock.mockReturnValue(true)

    const strategy = await templateSwitch.evaluateTemplateStrategy(AbsPath.from('/games/demo'), { version: 1 })

    expect(strategy).toBe('dirty')
    expect(hasUnsavedDocumentsUnderMock).toHaveBeenCalledWith('/games/demo/game/template')
  })

  it('跟随引擎且模板干净时返回 clean', async () => {
    isTemplateDirtyMock.mockResolvedValue(false)
    hasUnsavedDocumentsUnderMock.mockReturnValue(false)

    await expect(templateSwitch.evaluateTemplateStrategy(AbsPath.from('/games/demo'), { version: 1 }))
      .resolves.toBe('clean')
  })
})

describe('templateSwitch.resolveTemplatePath', () => {
  it('缺省绑定时回退到当前引擎的内建模板目录', async () => {
    const path = await templateSwitch.resolveTemplatePath(undefined, { path: AbsPath.from('/engines/webgal') })

    expect(path).toBe('/engines/webgal/game/template')
  })

  it('缺省绑定且没有当前引擎时返回 undefined', async () => {
    await expect(templateSwitch.resolveTemplatePath(undefined)).resolves.toBeUndefined()
  })

  it('独立模板绑定按名称查库', async () => {
    dbTemplateFilterFirstMock.mockResolvedValue({ path: AbsPath.from('/templates/custom') })

    const path = await templateSwitch.resolveTemplatePath({ kind: 'standalone', name: 'Custom' })

    expect(path).toBe('/templates/custom')
    expect(engineFindByRefMock).not.toHaveBeenCalled()
  })

  it('内建模板绑定按绑定自身的引擎解析，而不是当前引擎', async () => {
    engineFindByRefMock.mockResolvedValue({ path: AbsPath.from('/engines/pinned') })
    isEngineUsableMock.mockReturnValue(true)

    const path = await templateSwitch.resolveTemplatePath(
      {
        engine: { id: 'pinned.engine', version: '4.4.0' },
        kind: 'engineBuiltin',
      },
      { path: AbsPath.from('/engines/current') },
    )

    expect(engineFindByRefMock).toHaveBeenCalledWith({ id: 'pinned.engine', version: '4.4.0' })
    expect(path).toBe('/engines/pinned/game/template')
  })

  it('内建模板绑定引用的引擎不可用时返回 undefined', async () => {
    engineFindByRefMock.mockResolvedValue({ path: AbsPath.from('/engines/pinned') })
    isEngineUsableMock.mockReturnValue(false)

    await expect(templateSwitch.resolveTemplatePath({
      engine: { id: 'pinned.engine', version: '4.4.0' },
      kind: 'engineBuiltin',
    })).resolves.toBeUndefined()
  })
})
