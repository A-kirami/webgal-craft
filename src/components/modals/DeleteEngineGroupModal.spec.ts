import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'

import {
  createBrowserClickStub,
  createBrowserContainerStub,
  renderInBrowser,
} from '~/__tests__/browser-render'
import { createTestGame } from '~/__tests__/factories'

import DeleteEngineGroupModal from './DeleteEngineGroupModal.vue'

const {
  canDeleteEngineGroupMock,
  notifyErrorMock,
  notifySuccessMock,
  uninstallEngineGroupMock,
} = vi.hoisted(() => ({
  canDeleteEngineGroupMock: vi.fn(),
  notifyErrorMock: vi.fn(),
  notifySuccessMock: vi.fn(),
  uninstallEngineGroupMock: vi.fn(),
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
    case 'modals.deleteEngineGroup.title': {
      return '卸载全部版本'
    }
    case 'modals.deleteEngineGroup.description': {
      return `确定要卸载引擎 ${params?.name as string} 的全部版本吗？`
    }
    case 'modals.deleteEngineGroup.warning': {
      return '此操作会删除该引擎的全部已安装版本。'
    }
    case 'modals.deleteEngineGroup.success': {
      return '引擎全部版本卸载成功'
    }
    case 'modals.deleteEngineGroup.failed': {
      return '引擎全部版本卸载失败'
    }
    default: {
      return key
    }
  }
}

vi.mock('~/services/engine-manager', () => ({
  engineManager: {
    canDeleteEngineGroup: canDeleteEngineGroupMock,
    uninstallEngineGroup: uninstallEngineGroupMock,
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

function renderDeleteEngineGroupModal(updateOpen = vi.fn()) {
  renderInBrowser(DeleteEngineGroupModal, {
    props: {
      'engineId': 'WebGAL',
      'open': true,
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
    updateOpen,
  }
}

describe('DeleteEngineGroupModal', () => {
  beforeEach(() => {
    vi.resetAllMocks()

    canDeleteEngineGroupMock.mockResolvedValue({ canDelete: true })
    uninstallEngineGroupMock.mockResolvedValue(undefined)
  })

  it('整组删除被关联游戏阻断时会展示游戏列表并禁用确认', async () => {
    canDeleteEngineGroupMock.mockResolvedValue({
      canDelete: false,
      associatedGames: [
        createTestGame({
          id: 'game-1',
          metadata: { name: 'Demo Game' },
        }),
      ],
      reason: 'ENGINE_HAS_ASSOCIATED_GAMES',
    })

    renderDeleteEngineGroupModal()

    await expect.element(page.getByText('无法删除')).toBeInTheDocument()
    await expect.element(page.getByText('以下游戏正在使用此引擎：')).toBeInTheDocument()
    await expect.element(page.getByText('Demo Game')).toBeInTheDocument()
    await expect.element(page.getByRole('button', { name: '确认' })).toBeDisabled()
  })

  it('可删除时确认会执行整组卸载并关闭模态框', async () => {
    const { updateOpen } = renderDeleteEngineGroupModal()

    await page.getByRole('button', { name: '确认' }).click()

    expect(uninstallEngineGroupMock).toHaveBeenCalledWith('WebGAL')
    expect(notifySuccessMock).toHaveBeenCalledWith('引擎全部版本卸载成功')
    expect(updateOpen).toHaveBeenCalledWith(false)
  })
})
