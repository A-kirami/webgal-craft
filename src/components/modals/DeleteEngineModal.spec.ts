import { beforeEach, describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'

import {
  createBrowserClickStub,
  createBrowserContainerStub,
  renderInBrowser,
} from '~/__tests__/browser-render'
import { createTestEngine, createTestGame } from '~/__tests__/factories'

import DeleteEngineModal from './DeleteEngineModal.vue'

const {
  canDeleteEngineMock,
  notifyErrorMock,
  notifySuccessMock,
  uninstallEngineMock,
} = vi.hoisted(() => ({
  canDeleteEngineMock: vi.fn(),
  notifyErrorMock: vi.fn(),
  notifySuccessMock: vi.fn(),
  uninstallEngineMock: vi.fn(),
}))

function translate(key: string, params?: Record<string, unknown>): string {
  switch (key) {
    case 'common.cancel': {
      return '取消'
    }
    case 'common.confirm': {
      return '确认'
    }
    case 'engine.deleteBlocked': {
      return '无法删除'
    }
    case 'engine.deleteBlockedByGames': {
      return '以下游戏正在使用此引擎：'
    }
    case 'modals.deleteEngine.title': {
      return '卸载引擎'
    }
    case 'modals.deleteEngine.description': {
      return `确定要卸载引擎 ${params?.name as string} 吗？`
    }
    case 'modals.deleteEngine.warning': {
      return '此操作将把引擎文件移到回收站，你可以稍后从回收站恢复。'
    }
    case 'modals.deleteEngine.uninstallSuccess': {
      return '引擎卸载成功'
    }
    case 'modals.deleteEngine.uninstallFailed': {
      return '引擎卸载失败'
    }
    case 'modals.deleteEngine.removeTitle': {
      return '移除引擎记录'
    }
    case 'modals.deleteEngine.removeDescription': {
      return `确定要移除引擎 ${params?.name as string} 的记录吗？`
    }
    case 'modals.deleteEngine.removeWarning': {
      return '引擎目录已不可用，此操作只会移除本地记录，不会删除任何文件。'
    }
    case 'modals.deleteEngine.removeSuccess': {
      return '引擎记录已移除'
    }
    case 'modals.deleteEngine.removeFailed': {
      return '引擎记录移除失败'
    }
    default: {
      return key
    }
  }
}

vi.mock('~/services/engine-manager', () => ({
  engineManager: {
    canDeleteEngine: canDeleteEngineMock,
    uninstallEngine: uninstallEngineMock,
  },
}))

vi.mock('notivue', () => ({
  push: {
    error: notifyErrorMock,
    success: notifySuccessMock,
  },
}))

vi.mock('vue-i18n', async importOriginal => ({
  ...(await importOriginal<typeof import('vue-i18n')>()),
  useI18n: () => ({
    t: translate,
  }),
}))

const globalStubs = {
  AlertDialog: createBrowserContainerStub('StubAlertDialog'),
  AlertDialogAction: createBrowserClickStub('StubAlertDialogAction'),
  AlertDialogCancel: createBrowserClickStub('StubAlertDialogCancel'),
  AlertDialogContent: createBrowserContainerStub('StubAlertDialogContent'),
  AlertDialogDescription: createBrowserContainerStub('StubAlertDialogDescription'),
  AlertDialogFooter: createBrowserContainerStub('StubAlertDialogFooter'),
  AlertDialogHeader: createBrowserContainerStub('StubAlertDialogHeader'),
  AlertDialogTitle: createBrowserContainerStub('StubAlertDialogTitle', 'h2'),
}

function renderDeleteEngineModal(updateOpen = vi.fn(), engine = createTestEngine()) {
  renderInBrowser(DeleteEngineModal, {
    props: {
      'open': true,
      engine,
      'onUpdate:open': updateOpen,
    },
    global: {
      mocks: {
        $t: translate,
      },
      stubs: globalStubs,
    },
  })

  return {
    engine,
    updateOpen,
  }
}

describe('DeleteEngineModal', () => {
  beforeEach(() => {
    vi.resetAllMocks()

    canDeleteEngineMock.mockResolvedValue({ canDelete: true })
    uninstallEngineMock.mockResolvedValue(undefined)
  })

  it('删除被关联游戏阻断时会展示游戏列表并禁用确认', async () => {
    canDeleteEngineMock.mockResolvedValue({
      canDelete: false,
      associatedGames: [
        createTestGame({
          id: 'game-1',
          metadata: { name: 'Demo Game' },
        }),
        createTestGame({
          id: 'game-2',
          metadata: { name: 'Another Game' },
        }),
      ],
      reason: 'ENGINE_HAS_ASSOCIATED_GAMES',
    })

    renderDeleteEngineModal()

    await expect.element(page.getByText('无法删除')).toBeInTheDocument()
    await expect.element(page.getByText('以下游戏正在使用此引擎：')).toBeInTheDocument()
    await expect.element(page.getByText('Demo Game')).toBeInTheDocument()
    await expect.element(page.getByText('Another Game')).toBeInTheDocument()
    await expect.element(page.getByRole('button', { name: '确认' })).toBeDisabled()
  })

  it('可删除时确认会执行卸载并关闭模态框', async () => {
    const { engine, updateOpen } = renderDeleteEngineModal()

    await page.getByRole('button', { name: '确认' }).click()

    expect(uninstallEngineMock).toHaveBeenCalledWith(engine)
    expect(notifySuccessMock).toHaveBeenCalledWith('引擎卸载成功')
    expect(updateOpen).toHaveBeenCalledWith(false)
  })

  it('可用引擎会在卸载说明中展示版本号', async () => {
    renderDeleteEngineModal(
      vi.fn(),
      createTestEngine({
        name: 'WebGAL',
        version: '4.5.0',
      }),
    )

    await expect.element(page.getByText('确定要卸载引擎 WebGAL 4.5.0 吗？')).toBeInTheDocument()
  })

  it('不可用引擎会带入名称渲染移除说明', async () => {
    renderDeleteEngineModal(
      vi.fn(),
      createTestEngine({
        name: 'WebGAL',
        status: 'unavailable',
        version: '4.5.0',
      }),
    )

    await expect.element(page.getByText('确定要移除引擎 WebGAL 4.5.0 的记录吗？')).toBeInTheDocument()
  })
})
