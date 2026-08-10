import { beforeEach, describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import { defineComponent, h } from 'vue'

import {
  createBrowserClickStub,
  createBrowserContainerStub,
  renderInBrowser,
} from '~/__tests__/browser-render'
import { createTestEngine, createTestGame } from '~/__tests__/factories'
import { AbsPath } from '~/domain/path'

import SwitchTemplateModal from './SwitchTemplateModal.vue'

const {
  dbEngineGetMock,
  handleErrorMock,
  isTemplateDirtyMock,
  readProjectConfigMock,
  resetTemplateMock,
  refreshCurrentGameSnapshotMock,
  switchTemplateMock,
  updateOpenMock,
  useWorkspaceStoreMock,
} = vi.hoisted(() => ({
  dbEngineGetMock: vi.fn(),
  handleErrorMock: vi.fn(),
  isTemplateDirtyMock: vi.fn(),
  readProjectConfigMock: vi.fn(),
  resetTemplateMock: vi.fn(),
  refreshCurrentGameSnapshotMock: vi.fn(),
  switchTemplateMock: vi.fn(),
  updateOpenMock: vi.fn(),
  useWorkspaceStoreMock: vi.fn(),
}))

function translate(key: string): string {
  switch (key) {
    case 'common.cancel': {
      return '取消'
    }
    case 'common.save': {
      return '保存'
    }
    case 'modals.switchTemplate.title': {
      return '切换模板'
    }
    case 'modals.switchTemplate.selectTemplate': {
      return '选择要切换的游戏模板'
    }
    case 'modals.switchTemplate.templateLabel': {
      return '游戏模板'
    }
    case 'modals.switchTemplate.reset.label': {
      return '重置模板'
    }
    case 'modals.switchTemplate.reset.title': {
      return '重置当前模板'
    }
    case 'modals.switchTemplate.reset.description': {
      return '此操作会清空当前项目 game/template/ 下的所有覆盖内容，包括新增、修改、未保存和删除的文件，并恢复为当前模板的初始状态。'
    }
    case 'modals.switchTemplate.dirtyWarning': {
      return '当前模板已被修改，切换将清除所有修改。'
    }
    case 'modals.switchTemplate.dirtyUnsavedWarning': {
      return '当前打开但尚未保存的模板文件也会被关闭，未保存内容将丢失。确定要继续吗？'
    }
    case 'modals.switchTemplate.reset.confirm': {
      return '确认重置'
    }
    case 'modals.switchTemplate.reset.error': {
      return '模板重置失败'
    }
    default: {
      return key
    }
  }
}

vi.mock('~/commands/project-config', () => ({
  projectConfigCmds: {
    readProjectConfig: readProjectConfigMock,
  },
}))

vi.mock('~/database/db', () => ({
  db: {
    engines: {
      get: dbEngineGetMock,
    },
  },
}))

vi.mock('~/services/template-switch', () => ({
  templateSwitch: {
    isTemplateDirty: isTemplateDirtyMock,
    resetTemplate: resetTemplateMock,
    switchTemplate: switchTemplateMock,
  },
}))

vi.mock('~/stores/workspace', () => ({
  useWorkspaceStore: useWorkspaceStoreMock,
}))

vi.mock('~/utils/error-handler', () => ({
  handleError: handleErrorMock,
}))

vi.mock('vue-i18n', async importOriginal => ({
  ...(await importOriginal<typeof import('vue-i18n')>()),
  useI18n: () => ({
    t: translate,
  }),
}))

const AlertDialogStub = defineComponent({
  name: 'StubAlertDialog',
  props: {
    open: {
      type: Boolean,
      default: false,
    },
  },
  setup(props, { slots }) {
    return () => props.open ? h('div', slots.default?.()) : undefined
  },
})

const globalStubs = {
  AlertDialog: AlertDialogStub,
  AlertDialogAction: createBrowserClickStub('StubAlertDialogAction'),
  AlertDialogCancel: createBrowserClickStub('StubAlertDialogCancel'),
  AlertDialogContent: createBrowserContainerStub('StubAlertDialogContent'),
  AlertDialogDescription: createBrowserContainerStub('StubAlertDialogDescription'),
  AlertDialogFooter: createBrowserContainerStub('StubAlertDialogFooter'),
  AlertDialogHeader: createBrowserContainerStub('StubAlertDialogHeader'),
  AlertDialogTitle: createBrowserContainerStub('StubAlertDialogTitle', 'h2'),
  Button: createBrowserClickStub('StubButton'),
  Dialog: createBrowserContainerStub('StubDialog'),
  DialogClose: createBrowserContainerStub('StubDialogClose'),
  DialogContent: createBrowserContainerStub('StubDialogContent'),
  DialogDescription: createBrowserContainerStub('StubDialogDescription'),
  DialogFooter: createBrowserContainerStub('StubDialogFooter'),
  DialogHeader: createBrowserContainerStub('StubDialogHeader'),
  DialogTitle: createBrowserContainerStub('StubDialogTitle', 'h2'),
  Label: createBrowserContainerStub('StubLabel', 'label'),
  TemplateSelector: createBrowserContainerStub('StubTemplateSelector'),
}

function renderSwitchTemplateModal() {
  const game = createTestGame({
    id: 'game-1',
    engineId: 'engine-current',
    path: AbsPath.from('/games/demo'),
  })

  renderInBrowser(SwitchTemplateModal, {
    props: {
      game,
      'open': true,
      'onUpdate:open': updateOpenMock,
    },
    global: {
      mocks: {
        $t: translate,
      },
      stubs: globalStubs,
    },
  })

  return game
}

describe('SwitchTemplateModal', () => {
  beforeEach(() => {
    vi.resetAllMocks()

    const currentGame = createTestGame({
      id: 'game-1',
      engineId: 'engine-current',
      path: AbsPath.from('/games/demo'),
    })
    const currentEngine = createTestEngine({
      id: 'engine-current',
      engineId: 'open-webgal.webgal',
      name: 'WebGAL',
      version: '4.5.0',
    })

    dbEngineGetMock.mockResolvedValue(currentEngine)
    handleErrorMock.mockReset()
    isTemplateDirtyMock.mockResolvedValue(true)
    readProjectConfigMock.mockResolvedValue({
      version: 1,
      engine: { id: 'open-webgal.webgal', version: '4.5.0' },
    })
    refreshCurrentGameSnapshotMock.mockResolvedValue(undefined)
    resetTemplateMock.mockResolvedValue(undefined)
    switchTemplateMock.mockResolvedValue(undefined)
    useWorkspaceStoreMock.mockReturnValue({
      currentGame,
      refreshCurrentGameSnapshot: refreshCurrentGameSnapshotMock,
    })
  })

  it('点击重置入口时先展示影响范围确认，不会立即清理模板', async () => {
    renderSwitchTemplateModal()

    await expect.element(page.getByRole('button', { name: '重置模板' })).toBeEnabled()
    await expect.element(page.getByRole('button', { name: '确认重置' })).not.toBeInTheDocument()
    await page.getByRole('button', { name: '重置模板' }).click()

    await expect.element(page.getByRole('heading', { name: '重置当前模板' })).toBeInTheDocument()
    await expect.element(
      page.getByText('此操作会清空当前项目 game/template/ 下的所有覆盖内容，包括新增、修改、未保存和删除的文件，并恢复为当前模板的初始状态。', { exact: true }),
    ).toBeInTheDocument()
    expect(resetTemplateMock).not.toHaveBeenCalled()
  })

  it('模板没有覆盖内容时隐藏重置入口', async () => {
    isTemplateDirtyMock.mockResolvedValue(false)

    renderSwitchTemplateModal()

    await expect.element(page.getByRole('button', { name: '重置模板' })).not.toBeInTheDocument()
  })

  it('确认重置后清理当前模板并隐藏入口', async () => {
    const game = renderSwitchTemplateModal()

    await expect.element(page.getByRole('button', { name: '重置模板' })).toBeEnabled()
    await page.getByRole('button', { name: '重置模板' }).click()
    await page.getByRole('button', { name: '确认重置' }).click()

    await vi.waitFor(() => {
      expect(resetTemplateMock).toHaveBeenCalledWith(game.path)
    })
    await expect.element(page.getByRole('button', { name: '重置模板' })).not.toBeInTheDocument()
  })

  it('重置失败时通过错误处理器反馈失败原因', async () => {
    resetTemplateMock.mockRejectedValueOnce(new Error('reset failed'))

    renderSwitchTemplateModal()

    await expect.element(page.getByRole('button', { name: '重置模板' })).toBeEnabled()
    await page.getByRole('button', { name: '重置模板' }).click()
    await page.getByRole('button', { name: '确认重置' }).click()

    await vi.waitFor(() => {
      expect(handleErrorMock).toHaveBeenCalledWith(
        expect.any(Error),
        { context: '模板重置失败' },
      )
    })
  })
})
