import { afterEach, describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'

import { renderInBrowser } from '~/__tests__/browser-render'

import SafeMarkdown from './SafeMarkdown.vue'

const { openUrlMock } = vi.hoisted(() => ({
  openUrlMock: vi.fn(),
}))

vi.mock('@tauri-apps/plugin-opener', () => ({
  openUrl: openUrlMock,
}))

describe('SafeMarkdown', () => {
  afterEach(() => {
    vi.clearAllMocks()
    document.body.innerHTML = ''
  })

  function renderedMarkdown(): HTMLElement {
    const element = document.querySelector<HTMLElement>('[data-testid="safe-markdown"]')
    if (!element) {
      throw new Error('SafeMarkdown 未渲染')
    }

    expect(element).toBeInTheDocument()
    return element
  }

  it('渲染受支持的安全 HTML', async () => {
    const result = renderInBrowser(SafeMarkdown, {
      props: {
        source: [
          '## Notes',
          '',
          '<div align="center">',
          '<h1>Release Notes</h1>',
          '<img width="120" src="https://example.com/image.png" alt="Logo">',
          '<p><kbd>Ctrl</kbd>+<kbd>Enter</kbd> <u>underline</u> <s>removed</s></p>',
          '</div>',
          '',
          '![remote image](https://example.com/image.png)',
        ].join('\n'),
      },
    })

    await expect.element(page.getByRole('heading', { name: /^Notes$/ })).toBeInTheDocument()
    await expect.element(page.getByRole('heading', { name: 'Release Notes' })).toBeInTheDocument()
    const markdown = renderedMarkdown()
    expect(markdown.querySelector('div[align="center"]')).toBeInTheDocument()
    expect(markdown.querySelector('img[src="https://example.com/image.png"][width="120"]')).toBeInTheDocument()
    expect(markdown.querySelectorAll('kbd')).toHaveLength(2)
    expect(markdown.querySelector('u')).toHaveTextContent('underline')
    expect(markdown.querySelector('s')).toHaveTextContent('removed')
    await expect.element(page.getByRole('link', { name: 'remote image' })).toBeInTheDocument()

    await result.unmount()
  })

  it('清理危险 HTML 和非 Web 图片地址', async () => {
    const result = renderInBrowser(SafeMarkdown, {
      props: {
        source: [
          '<script>alert(1)</script>',
          '<img src="javascript:alert(1)" onerror="alert(1)" alt="bad">',
          '<a href="javascript:alert(1)" onclick="alert(1)">Unsafe</a>',
          '<input type="text">',
        ].join('\n'),
      },
    })

    const markdown = renderedMarkdown()
    expect(markdown.querySelector('script')).toBeNull()
    expect(markdown.querySelector('img')).toBeNull()
    expect(markdown.querySelector('input')).toBeNull()
    await expect.element(page.getByText('Unsafe')).toBeInTheDocument()
    await expect.element(page.getByRole('link', { name: 'Unsafe' })).not.toBeInTheDocument()

    await result.unmount()
  })

  it('渲染只读任务列表', async () => {
    const result = renderInBrowser(SafeMarkdown, {
      props: {
        source: [
          '- [x] 已完成',
          '- [ ] 待处理',
          '  - [X] 子任务',
        ].join('\n'),
      },
    })

    const checkboxes = renderedMarkdown().querySelectorAll<HTMLInputElement>('input[type="checkbox"]')
    expect(checkboxes).toHaveLength(3)
    expect(checkboxes[0]).toBeChecked()
    expect(checkboxes[0]).toBeDisabled()
    expect(checkboxes[1]).not.toBeChecked()
    expect(checkboxes[1]).toBeDisabled()
    expect(checkboxes[2]).toBeChecked()
    expect(checkboxes[2]).toBeDisabled()
    await expect.element(page.getByText('已完成')).toBeInTheDocument()
    await expect.element(page.getByText('待处理')).toBeInTheDocument()
    await expect.element(page.getByText('子任务')).toBeInTheDocument()

    await result.unmount()
  })

  it('点击 http/https 外链时使用 opener 打开，不在 WebView 内直接导航', async () => {
    const result = renderInBrowser(SafeMarkdown, {
      props: {
        source: '[Release](https://example.com/release) [Unsafe](javascript:alert(1))',
      },
    })

    await page.getByRole('link', { name: 'Release' }).click()

    expect(openUrlMock).toHaveBeenCalledWith('https://example.com/release')
    await expect.element(page.getByText('Unsafe')).toBeInTheDocument()
    await expect.element(page.getByRole('link', { name: 'Unsafe' })).not.toBeInTheDocument()

    await result.unmount()
  })
})
