import { afterEach, describe, expect, it, vi } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { defineComponent, h } from 'vue'

import {
  createBrowserClickStub,
  createBrowserContainerStub,
  renderInBrowser,
} from '~/__tests__/browser-render'
import {
  createBugReportUrl,
  formatAboutEnvironmentInfo,
} from '~/features/about/feedback'

import AboutModal from './AboutModal.vue'

import type { AboutEnvironmentInfo } from '~/features/about/feedback'

const { openUrlMock, platformMock, repositoryUrl } = vi.hoisted(() => ({
  openUrlMock: vi.fn(),
  platformMock: vi.fn(() => 'macos'),
  repositoryUrl: 'https://github.com/A-kirami/webgal-craft',
}))

const environmentInfo: AboutEnvironmentInfo = {
  appVersion: '1.0.0-alpha.4-build.abc 123',
  architecture: 'aarch64',
  osVersion: '15.5 & newer',
  platform: 'macos',
}
const environmentInfoText = formatAboutEnvironmentInfo(environmentInfo)

vi.mock('@tauri-apps/plugin-opener', () => ({
  openUrl: openUrlMock,
}))

vi.mock('@tauri-apps/plugin-os', () => ({
  arch: () => 'aarch64',
  platform: platformMock,
  version: () => '15.5 & newer',
}))

vi.mock('~/features/app-update/useAppUpdateController', () => ({
  useAppUpdateController: () => ({
    checkForUpdate: vi.fn(),
    openReleasePage: vi.fn(),
  }),
}))

vi.mock('~/utils/metadata', () => ({
  getVersion: () => ({
    name: '1.0.0-alpha.4-build.abc 123',
  }),
}))

vi.mock('~build/git', () => ({
  github: repositoryUrl,
}))

const DialogStub = defineComponent({
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

const DialogContentStub = defineComponent({
  setup(_, { attrs, slots }) {
    return () => h('section', {
      ...attrs,
      'aria-label': 'About WebGAL Craft',
      'role': 'dialog',
      'tabindex': -1,
    }, slots.default?.())
  },
})

const globalStubs = {
  Button: createBrowserClickStub('StubButton'),
  Dialog: DialogStub,
  DialogContent: DialogContentStub,
  DialogDescription: createBrowserContainerStub('StubDialogDescription', 'p'),
  DialogFooter: createBrowserContainerStub('StubDialogFooter'),
  DialogTitle: createBrowserContainerStub('StubDialogTitle', 'h2'),
  Separator: createBrowserContainerStub('StubSeparator', 'hr'),
}

function renderAboutModal(open: boolean = true) {
  return renderInBrowser(AboutModal, {
    props: {
      open,
    },
    browser: {
      i18nMode: 'lite',
    },
    global: {
      stubs: globalStubs,
    },
  })
}

function createCopyEvent(): { clipboardData: DataTransfer, event: ClipboardEvent } {
  const clipboardData = new DataTransfer()
  const event = new ClipboardEvent('copy', {
    bubbles: true,
    cancelable: true,
    clipboardData,
  })

  return { clipboardData, event }
}

describe('AboutModal', () => {
  afterEach(() => {
    document.body.innerHTML = ''
    openUrlMock.mockReset()
    platformMock.mockReturnValue('macos')
    globalThis.getSelection()?.removeAllRanges()
  })

  it('移动端不显示桌面应用更新入口', () => {
    platformMock.mockReturnValue('android')

    renderAboutModal()

    expect(page.getByRole('button', { name: 'appUpdate.action.checkForUpdate' })).not.toBeInTheDocument()
  })

  it('弹窗内没有可复制内容时通过复制快捷键写入稳定的版本和环境信息', async () => {
    renderAboutModal()
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]')
    let copyEvent: ClipboardEvent | undefined

    expect(dialog).not.toBeNull()
    dialog!.addEventListener('copy', (event) => {
      copyEvent = event
    })
    dialog!.focus()
    await userEvent.copy()

    expect(copyEvent).toBeDefined()
    expect(copyEvent!.defaultPrevented).toBe(true)

    // Browser Mode 无法读取 userEvent.copy() 触发的受信任事件数据。
    const copiedData = createCopyEvent()
    dialog!.dispatchEvent(copiedData.event)

    expect(copiedData.clipboardData.getData('text/plain')).toBe(environmentInfoText)
  })

  it('弹窗外或弹窗关闭时不接管复制', async () => {
    const { unmount } = renderAboutModal()
    const outsideCopy = createCopyEvent()

    document.body.dispatchEvent(outsideCopy.event)

    expect(outsideCopy.event.defaultPrevented).toBe(false)
    expect(outsideCopy.clipboardData.getData('text/plain')).toBe('')

    await unmount()
    renderAboutModal(false)
    const closedCopy = createCopyEvent()

    document.body.dispatchEvent(closedCopy.event)

    expect(document.querySelector('[role="dialog"]')).toBeNull()
    expect(closedCopy.event.defaultPrevented).toBe(false)
  })

  it('保留文本选择和可编辑内容的原生复制行为', () => {
    renderAboutModal()
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!
    const versionText = [...dialog.querySelectorAll('span')]
      .find(element => element.textContent === '1.0.0-alpha.4-build.abc 123')!
    const range = document.createRange()
    range.selectNodeContents(versionText)
    globalThis.getSelection()!.addRange(range)
    const selectionCopy = createCopyEvent()

    versionText.dispatchEvent(selectionCopy.event)

    expect(selectionCopy.event.defaultPrevented).toBe(false)
    expect(selectionCopy.clipboardData.getData('text/plain')).toBe('')

    globalThis.getSelection()!.removeAllRanges()
    const input = document.createElement('input')
    input.value = 'copy me'
    dialog.append(input)
    input.select()
    const inputCopy = createCopyEvent()

    input.dispatchEvent(inputCopy.event)

    expect(inputCopy.event.defaultPrevented).toBe(false)
    expect(inputCopy.clipboardData.getData('text/plain')).toBe('')
  })

  it('问题反馈打开错误报告模板并预填对应字段', async () => {
    renderAboutModal()

    await page.getByRole('button', { name: 'modals.about.issues' }).click()

    expect(openUrlMock).toHaveBeenCalledTimes(1)
    expect(openUrlMock).toHaveBeenCalledWith(createBugReportUrl(repositoryUrl, environmentInfo))
  })
})
