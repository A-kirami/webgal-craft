import { createPinia, setActivePinia } from 'pinia'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'

import {
  createBrowserClickStub,
  createBrowserContainerStub,
  renderInBrowser,
} from '~/__tests__/browser-render'
import { useAppUpdateStore } from '~/stores/app-update'

import UpdateDetailsModal from './UpdateDetailsModal.vue'

function translate(key: string, params?: Record<string, unknown>): string {
  switch (key) {
    case 'appUpdate.details.title': {
      return `发现新版本 ${params?.version as string}`
    }
    case 'appUpdate.details.description': {
      return `当前版本 ${params?.currentVersion as string}`
    }
    case 'appUpdate.details.releaseNotes': {
      return '更新内容'
    }
    case 'appUpdate.details.emptyReleaseNotes': {
      return '本次更新没有提供更新说明。'
    }
    case 'appUpdate.details.openReleasePage': {
      return '在 GitHub 查看'
    }
    case 'appUpdate.details.updateNow': {
      return '立即更新'
    }
    case 'appUpdate.details.installUpdateNow': {
      return '安装更新'
    }
    case 'appUpdate.details.skipVersion': {
      return '跳过此版本'
    }
    case 'appUpdate.details.later': {
      return '稍后'
    }
    default: {
      return key
    }
  }
}

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

function renderUpdateDetailsModal(props: Record<string, unknown> = {}) {
  const updateOpen = vi.fn()
  const onUpdateNow = vi.fn()
  const onSkipVersion = vi.fn()
  const onOpenReleasePage = vi.fn()
  const pinia = createPinia()
  setActivePinia(pinia)

  const result = renderInBrowser(UpdateDetailsModal, {
    props: {
      'open': true,
      'update': {
        currentVersion: '1.0.0',
        version: '1.1.0',
        date: '2026-06-01T00:00:00.000Z',
        body: 'Short release note.',
      },
      onOpenReleasePage,
      onSkipVersion,
      onUpdateNow,
      'onUpdate:open': updateOpen,
      ...props,
    },
    browser: {
      pinia,
    },
    global: {
      mocks: {
        $t: translate,
      },
      stubs: globalStubs,
    },
  })

  return {
    onOpenReleasePage,
    onSkipVersion,
    onUpdateNow,
    pinia,
    updateOpen,
    unmount: result.unmount,
  }
}

describe('UpdateDetailsModal', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('展示版本、本地化更新日期和更新内容', async () => {
    renderUpdateDetailsModal()

    await expect.element(page.getByText('发现新版本 1.1.0')).toBeInTheDocument()
    await expect.element(page.getByText('当前版本 1.0.0')).toBeInTheDocument()
    await expect.element(page.getByText('2026年6月1日')).toBeInTheDocument()
    await expect.element(page.getByText('2026-06-01')).not.toBeInTheDocument()
    await expect.element(page.getByText('更新内容')).toBeInTheDocument()
    await expect.element(page.getByText('Short release note.')).toBeInTheDocument()
  })

  it('立即更新和跳过此版本会触发对应事件并关闭弹窗', async () => {
    const { onUpdateNow, unmount, updateOpen } = renderUpdateDetailsModal()

    await page.getByRole('button', { name: '立即更新' }).click()

    expect(onUpdateNow).toHaveBeenCalledTimes(1)
    expect(updateOpen).toHaveBeenCalledWith(false)
    await unmount()

    const skipped = renderUpdateDetailsModal()
    await page.getByRole('button', { name: '跳过此版本' }).click()

    expect(skipped.onSkipVersion).toHaveBeenCalledTimes(1)
    expect(skipped.updateOpen).toHaveBeenCalledWith(false)
  })

  it('已下载更新时主操作显示安装更新', async () => {
    const { pinia } = renderUpdateDetailsModal()
    const store = useAppUpdateStore(pinia)
    store.setAvailableUpdate({
      currentVersion: '1.0.0',
      version: '1.1.0',
    })
    store.setDownloaded()

    await expect.element(page.getByRole('button', { name: '安装更新' })).toBeInTheDocument()
    await expect.element(page.getByRole('button', { name: '立即更新' })).not.toBeInTheDocument()
  })

  it('在 GitHub 查看会传入当前更新版本', async () => {
    const { onOpenReleasePage } = renderUpdateDetailsModal()

    await page.getByRole('button', { name: '在 GitHub 查看' }).click()

    expect(onOpenReleasePage).toHaveBeenCalledWith('1.1.0')
  })
})
