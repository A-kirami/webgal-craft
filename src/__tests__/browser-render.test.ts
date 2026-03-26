import { beforeEach, describe, expect, it, vi } from 'vitest'

const { renderMock } = vi.hoisted(() => ({
  renderMock: vi.fn(() => ({
    unmount: vi.fn(),
  })),
}))

vi.mock('vitest-browser-vue', () => ({
  render: renderMock,
}))

import { createBrowserLocalizedI18n, isBrowserTestI18nPlugin } from './browser'
import { renderInBrowser } from './browser-render'

interface MockedRenderOptions {
  global?: {
    plugins?: unknown[]
  }
}

function getRenderedOptions(): MockedRenderOptions {
  expect(renderMock).toHaveBeenCalledTimes(1)
  const firstCall = renderMock.mock.calls[0] as unknown[] | undefined
  return (firstCall?.[1] ?? {}) as MockedRenderOptions
}

describe('renderInBrowser', () => {
  beforeEach(() => {
    renderMock.mockClear()
  })

  it('global.plugins 已显式提供测试 i18n 时不会重复注入默认 i18n', () => {
    const localizedI18n = createBrowserLocalizedI18n()

    renderInBrowser({} as never, {
      global: {
        plugins: [localizedI18n],
      },
    })

    const renderOptions = getRenderedOptions()
    expect(renderOptions?.global?.plugins).toEqual([localizedI18n])
  })

  it('global.plugins 以 tuple 形式提供测试 i18n 时不会重复注入默认 i18n', () => {
    const localizedI18n = createBrowserLocalizedI18n()
    const localizedI18nTuple: [typeof localizedI18n] = [localizedI18n]

    renderInBrowser({} as never, {
      global: {
        plugins: [localizedI18nTuple],
      },
    })

    const renderOptions = getRenderedOptions()
    expect(renderOptions?.global?.plugins).toHaveLength(1)
    expect(renderOptions?.global?.plugins?.[0]).toBe(localizedI18nTuple)
  })

  it('未显式提供测试 i18n 时会注入默认 browser i18n', () => {
    renderInBrowser({} as never)

    const renderOptions = getRenderedOptions()
    expect(renderOptions?.global?.plugins).toHaveLength(1)
    const injectedPlugin = renderOptions?.global?.plugins?.[0]
    expect(isBrowserTestI18nPlugin(injectedPlugin)).toBe(true)
    if (!isBrowserTestI18nPlugin(injectedPlugin)) {
      throw new TypeError('未注入 browser test i18n 插件')
    }
    const translate = injectedPlugin.global.t as (key: string) => string
    expect(translate('common.confirm')).toBe('common.confirm')
  })

  it('显式提供测试 i18n 时仍会保留其它 browser plugins', () => {
    const localizedI18n = createBrowserLocalizedI18n()

    const rendered = renderInBrowser({} as never, {
      browser: {
        pinia: true,
      },
      global: {
        plugins: [localizedI18n],
      },
    })

    const renderOptions = getRenderedOptions()
    expect(renderOptions?.global?.plugins).toHaveLength(2)
    expect(renderOptions?.global?.plugins?.[0]).toBe(rendered.pinia)
    expect(renderOptions?.global?.plugins?.at(-1)).toBe(localizedI18n)
  })
})
