import { beforeEach, describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'

import {
  createBrowserClickStub,
  createBrowserContainerStub,
  renderInBrowser,
} from '~/__tests__/browser-render'
import { createTestGame, createTestTemplate } from '~/__tests__/factories'

import DeleteTemplateModal from './DeleteTemplateModal.vue'

const {
  canDeleteTemplateMock,
  deleteTemplateMock,
  notifyErrorMock,
  notifySuccessMock,
} = vi.hoisted(() => ({
  canDeleteTemplateMock: vi.fn(),
  deleteTemplateMock: vi.fn(),
  notifyErrorMock: vi.fn(),
  notifySuccessMock: vi.fn(),
}))

function translate(key: string, params?: Record<string, unknown>): string {
  switch (key) {
    case 'common.cancel': {
      return '取消'
    }
    case 'common.confirm': {
      return '确认'
    }
    case 'modals.deleteTemplate.blockedTitle': {
      return '无法删除'
    }
    case 'modals.deleteTemplate.blockedByGames': {
      return '以下游戏正在使用此模板：'
    }
    case 'modals.deleteTemplate.blockedByUncheckedGames': {
      return '以下游戏的项目配置无法读取，无法确认是否正在使用此模板：'
    }
    case 'modals.deleteTemplate.title': {
      return '删除模板'
    }
    case 'modals.deleteTemplate.description': {
      return `确定要删除模板 ${params?.name as string} 吗？`
    }
    case 'modals.deleteTemplate.warning': {
      return '此操作将把模板文件移到回收站，你可以稍后从回收站恢复。'
    }
    case 'modals.deleteTemplate.deleteSuccess': {
      return '模板删除成功'
    }
    case 'modals.deleteTemplate.deleteFailed': {
      return '模板删除失败'
    }
    case 'modals.deleteTemplate.removeTitle': {
      return '移除模板记录'
    }
    case 'modals.deleteTemplate.removeDescription': {
      return `确定要移除模板 ${params?.name as string} 的记录吗？`
    }
    case 'modals.deleteTemplate.removeWarning': {
      return '模板目录已不可用，此操作只会移除本地记录，不会删除任何文件。'
    }
    case 'modals.deleteTemplate.removeSuccess': {
      return '模板记录已移除'
    }
    case 'modals.deleteTemplate.removeFailed': {
      return '模板记录移除失败'
    }
    default: {
      return key
    }
  }
}

vi.mock('~/services/template-manager', () => ({
  templateManager: {
    canDeleteTemplate: canDeleteTemplateMock,
    deleteTemplate: deleteTemplateMock,
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

function renderDeleteTemplateModal(updateOpen = vi.fn(), template = createTestTemplate({
  metadata: {
    name: 'Modern Template',
  },
})) {
  renderInBrowser(DeleteTemplateModal, {
    props: {
      'open': true,
      template,
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
    template,
    updateOpen,
  }
}

describe('DeleteTemplateModal', () => {
  beforeEach(() => {
    vi.resetAllMocks()

    canDeleteTemplateMock.mockResolvedValue({ canDelete: true })
    deleteTemplateMock.mockResolvedValue(undefined)
  })

  it('删除被关联游戏阻断时会展示游戏列表并禁用确认', async () => {
    canDeleteTemplateMock.mockResolvedValue({
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
      reason: 'TEMPLATE_HAS_ASSOCIATED_GAMES',
    })

    renderDeleteTemplateModal()

    await expect.element(page.getByText('无法删除')).toBeInTheDocument()
    await expect.element(page.getByText('以下游戏正在使用此模板：')).toBeInTheDocument()
    await expect.element(page.getByText('Demo Game')).toBeInTheDocument()
    await expect.element(page.getByText('Another Game')).toBeInTheDocument()
    await expect.element(page.getByRole('button', { name: '确认' })).toBeDisabled()
  })

  it('引用检查无法完成时会展示未检查游戏列表并禁用确认', async () => {
    canDeleteTemplateMock.mockResolvedValue({
      canDelete: false,
      reason: 'TEMPLATE_REFERENCE_CHECK_FAILED',
      uncheckedGames: [
        createTestGame({
          id: 'game-1',
          metadata: { name: 'Unreadable Game' },
        }),
      ],
    })

    renderDeleteTemplateModal()

    await expect.element(page.getByText('无法删除')).toBeInTheDocument()
    await expect.element(page.getByText('以下游戏的项目配置无法读取，无法确认是否正在使用此模板：')).toBeInTheDocument()
    await expect.element(page.getByText('Unreadable Game')).toBeInTheDocument()
    await expect.element(page.getByRole('button', { name: '确认' })).toBeDisabled()
  })

  it('可删除时确认会执行删除并关闭模态框', async () => {
    const { template, updateOpen } = renderDeleteTemplateModal()

    await page.getByRole('button', { name: '确认' }).click()

    expect(deleteTemplateMock).toHaveBeenCalledWith(template)
    expect(notifySuccessMock).toHaveBeenCalledWith('模板删除成功')
    expect(updateOpen).toHaveBeenCalledWith(false)
  })

  it('不可用模板会带入名称渲染移除说明', async () => {
    renderDeleteTemplateModal(
      vi.fn(),
      createTestTemplate({
        availability: 'broken',
        metadata: {
          name: 'Modern Template',
        },
      }),
    )

    await expect.element(page.getByText('确定要移除模板 Modern Template 的记录吗？')).toBeInTheDocument()
  })
})
