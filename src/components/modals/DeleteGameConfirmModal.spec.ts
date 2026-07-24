import { describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'

import {
  createBrowserClickStub,
  createBrowserContainerStub,
  createBrowserInputStub,
  renderInBrowser,
} from '~/__tests__/browser-render'
import { createTestGame } from '~/__tests__/factories'

import DeleteGameConfirmModal from './DeleteGameConfirmModal.vue'

function translate(key: string): string {
  switch (key) {
    case 'common.cancel': {
      return '取消'
    }
    case 'modals.deleteGameConfirm.confirmDelete': {
      return '确认删除'
    }
    case 'modals.deleteGameConfirm.gameName': {
      return '游戏名称'
    }
    case 'modals.deleteGameConfirm.title': {
      return '最终确认'
    }
    default: {
      return key
    }
  }
}

const globalStubs = {
  'Button': createBrowserClickStub('StubButton'),
  'Dialog': createBrowserContainerStub('StubDialog'),
  'DialogClose': createBrowserContainerStub('StubDialogClose'),
  'DialogContent': createBrowserContainerStub('StubDialogContent'),
  'DialogDescription': createBrowserContainerStub('StubDialogDescription'),
  'DialogFooter': createBrowserContainerStub('StubDialogFooter'),
  'DialogHeader': createBrowserContainerStub('StubDialogHeader'),
  'DialogTitle': createBrowserContainerStub('StubDialogTitle', 'h2'),
  'Input': createBrowserInputStub('StubInput'),
  'Label': createBrowserContainerStub('StubLabel', 'label'),
  'i18n-t': createBrowserContainerStub('MockI18nT', 'span'),
}

function renderDeleteGameConfirmModal(
  onConfirm: () => Promise<boolean>,
  updateOpen = vi.fn(),
) {
  const game = createTestGame()

  renderInBrowser(DeleteGameConfirmModal, {
    props: {
      'open': true,
      game,
      onConfirm,
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
    game,
    updateOpen,
  }
}

describe('DeleteGameConfirmModal', () => {
  it.each([
    { confirmed: true, shouldClose: true, title: '删除成功' },
    { confirmed: false, shouldClose: false, title: '删除失败' },
  ])('$title时按操作结果决定是否关闭模态框', async ({ confirmed, shouldClose }) => {
    const onConfirm = vi.fn(async () => confirmed)
    const { game, updateOpen } = renderDeleteGameConfirmModal(onConfirm)

    await page.getByRole('textbox').fill(game.metadata.name)
    await page.getByRole('button', { name: '确认删除' }).click()

    await vi.waitFor(() => {
      expect(onConfirm).toHaveBeenCalledTimes(1)
    })
    if (shouldClose) {
      expect(updateOpen).toHaveBeenCalledWith(false)
    } else {
      expect(updateOpen).not.toHaveBeenCalledWith(false)
    }
  })
})
