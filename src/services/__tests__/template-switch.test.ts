import '~/__tests__/setup'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AbsPath } from '~/domain/path'
import { templateSwitch } from '~/services/template-switch'

const {
  closeTabMock,
  collectDocumentPathsUnderMock,
  debugCommanderMock,
  findTabIndexMock,
  refreshTemplateOverlayMock,
} = vi.hoisted(() => ({
  closeTabMock: vi.fn(),
  collectDocumentPathsUnderMock: vi.fn(),
  debugCommanderMock: {
    refetchTemplates: vi.fn(),
  },
  findTabIndexMock: vi.fn(),
  refreshTemplateOverlayMock: vi.fn(),
}))

vi.mock('~/services/debug-commander', () => ({
  debugCommander: debugCommanderMock,
}))

vi.mock('~/stores/editor', () => ({
  useEditorStore: () => ({
    collectDocumentPathsUnder: collectDocumentPathsUnderMock,
  }),
}))

vi.mock('~/stores/file', () => ({
  useFileStore: () => ({
    refreshTemplateOverlay: refreshTemplateOverlayMock,
  }),
}))

vi.mock('~/stores/tabs', () => ({
  useTabsStore: () => ({
    closeTab: closeTabMock,
    findTabIndex: findTabIndexMock,
  }),
}))

describe('templateSwitch.notifyTemplateChanged', () => {
  beforeEach(() => {
    closeTabMock.mockReset()
    collectDocumentPathsUnderMock.mockReset()
    debugCommanderMock.refetchTemplates.mockReset()
    findTabIndexMock.mockReset()
    refreshTemplateOverlayMock.mockReset()

    collectDocumentPathsUnderMock.mockReturnValue([])
    refreshTemplateOverlayMock.mockResolvedValue(undefined)
    debugCommanderMock.refetchTemplates.mockResolvedValue(undefined)
  })

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
