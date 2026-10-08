import { describe, expect, it } from 'vitest'
import { page } from 'vitest/browser'
import { defineComponent, h } from 'vue'

import { createBrowserContainerStub, renderInBrowser } from '~/__tests__/browser-render'

import ManagedImportStatus from './ManagedImportStatus.vue'

const globalStubs = {
  Button: createBrowserContainerStub('StubButton', 'button'),
  Progress: defineComponent({
    name: 'StubProgress',
    props: {
      modelValue: {
        type: Number,
        default: 0,
      },
    },
    setup(props, { attrs }) {
      return () => h('progress', { ...attrs, max: 100, value: props.modelValue })
    },
  }),
}

describe('ManagedImportStatus', () => {
  it('官方安装尚未收到进度时显示正在下载', async () => {
    await renderInBrowser(ManagedImportStatus, {
      props: {
        activity: {
          kind: 'official-engine-install',
          engineName: 'WebGAL',
          engineVersion: '4.6.5',
        },
        canCancel: false,
        resourceKind: 'engine',
      },
      browser: {
        i18nMode: 'localized',
      },
      global: {
        stubs: globalStubs,
      },
    })

    await expect.element(page.getByText('正在下载')).toBeVisible()
    await expect.element(page.getByText('已下载 0 B')).toBeVisible()
    await expect.element(page.getByText('正在复制文件')).not.toBeInTheDocument()
  })

  it('官方引擎下载时展示安装标题和下载大小', async () => {
    await renderInBrowser(ManagedImportStatus, {
      props: {
        activity: {
          kind: 'official-engine-install',
          engineName: 'WebGAL',
          engineVersion: '4.6.5',
        },
        canCancel: false,
        resourceKind: 'engine',
        progress: {
          sessionId: 'official-engine-4.6.5',
          resourceKind: 'engine',
          phase: 'downloading',
          copiedBytes: 9 * 1024 * 1024,
          copiedFiles: 0,
          totalBytes: 32 * 1024 * 1024,
        },
      },
      browser: {
        i18nMode: 'localized',
      },
      global: {
        stubs: globalStubs,
      },
    })

    await expect.element(page.getByText('正在安装 WebGAL 4.6.5')).toBeVisible()
    await expect.element(page.getByText('正在下载')).toBeVisible()
    await expect.element(page.getByText('已下载 9.0 MiB / 32 MiB')).toBeVisible()
    await expect.element(page.getByText('0 个文件 · 9.0 MiB')).not.toBeInTheDocument()
  })

  it('官方引擎解压时展示文件数和当前文件', async () => {
    await renderInBrowser(ManagedImportStatus, {
      props: {
        activity: {
          kind: 'official-engine-install',
          engineName: 'WebGAL',
          engineVersion: '4.6.5',
        },
        canCancel: false,
        resourceKind: 'engine',
        progress: {
          sessionId: 'official-engine-4.6.5',
          resourceKind: 'engine',
          phase: 'extracting',
          copiedBytes: 0,
          copiedFiles: 96,
          currentEntry: 'game/vocal/v2.wav',
        },
      },
      browser: {
        i18nMode: 'localized',
      },
      global: {
        stubs: globalStubs,
      },
    })

    await expect.element(page.getByText('已解压 96 个文件 · game/vocal/v2.wav')).toBeVisible()
    await expect.element(page.getByText('正在解压')).toBeVisible()
    await expect.element(page.getByText('96 个文件 · 0 B')).not.toBeInTheDocument()
  })

  it('普通导入仍展示资源类型和复制详情', async () => {
    await renderInBrowser(ManagedImportStatus, {
      props: {
        canCancel: false,
        resourceKind: 'engine',
        progress: {
          sessionId: 'managed-engine',
          resourceKind: 'engine',
          phase: 'copying',
          copiedBytes: 9 * 1024 * 1024,
          copiedFiles: 12,
        },
      },
      browser: {
        i18nMode: 'localized',
      },
      global: {
        stubs: globalStubs,
      },
    })

    await expect.element(page.getByText('正在导入引擎')).toBeVisible()
    await expect.element(page.getByText('12 个文件 · 9.0 MiB')).toBeVisible()
  })

  it('不可取消时取消按钮保留占位但不可见，避免布局抖动', async () => {
    const { container } = await renderInBrowser(ManagedImportStatus, {
      props: {
        activity: {
          kind: 'official-engine-install',
          engineName: 'WebGAL',
          engineVersion: '4.6.5',
        },
        canCancel: false,
        resourceKind: 'engine',
      },
      browser: {
        i18nMode: 'localized',
      },
      global: {
        stubs: globalStubs,
      },
    })

    const button = container.querySelector<HTMLButtonElement>('button[aria-label="取消下载"]')
    expect(button).toBeTruthy()
    expect(button?.classList.contains('invisible')).toBe(true)
    expect(button?.disabled).toBe(true)
  })

  it('可取消时取消按钮可见且可点击', async () => {
    await renderInBrowser(ManagedImportStatus, {
      props: {
        activity: {
          kind: 'official-engine-install',
          engineName: 'WebGAL',
          engineVersion: '4.6.5',
        },
        canCancel: true,
        resourceKind: 'engine',
      },
      browser: {
        i18nMode: 'localized',
      },
      global: {
        stubs: globalStubs,
      },
    })

    const button = page.getByRole('button', { name: '取消下载' })
    await expect.element(button).toBeVisible()
    await expect.element(button).not.toBeDisabled()
  })
})
