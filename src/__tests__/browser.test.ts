import { describe, expect, it } from 'vitest'

import {
  createBrowserConsoleMonitor,
  createBrowserLiteI18n,
  createBrowserLocalizedI18n,
  createBrowserStrictI18n,
  createBrowserTestI18n,
  createBrowserTestPlugins,
} from './browser'

interface BrowserTestI18nHandle {
  global: {
    locale: {
      value: string
    }
    t(key: string): string
  }
}

describe('createBrowserConsoleMonitor', () => {
  const monitor = createBrowserConsoleMonitor() as {
    expectNoConsoleMessage(pattern: string | RegExp): void
  }

  it('支持使用正则断言不存在的浏览器控制台输出', () => {
    // eslint-disable-next-line no-console
    console.warn('[Vue warn]: hydration mismatch')

    expect(() => monitor.expectNoConsoleMessage(/hydration mismatch/)).toThrow()
  })

  it('保留原有字符串匹配行为', () => {
    // eslint-disable-next-line no-console
    console.error('plain error message')

    expect(() => monitor.expectNoConsoleMessage('plain error')).toThrow()
  })
})

describe('browser test i18n helpers', () => {
  it('localized helper 默认使用 zh-Hans 作为测试 locale', () => {
    const i18n = createBrowserLocalizedI18n() as BrowserTestI18nHandle

    expect(i18n.global.locale.value).toBe('zh-Hans')
  })

  it('localized helper 默认使用 zh-Hans 文案作为测试消息基线', () => {
    const i18n = createBrowserLocalizedI18n() as BrowserTestI18nHandle

    expect(i18n.global.t('common.confirm')).toBe('确认')
    expect(i18n.global.t('common.saved')).toBe('已保存')
  })

  it('lite helper 不加载完整 locale 文案而是回退到 key', () => {
    const i18n = createBrowserLiteI18n() as BrowserTestI18nHandle

    expect(i18n.global.t('common.confirm')).toBe('common.confirm')
  })

  it('兼容 helper 保持旧的 en + key fallback 语义', () => {
    const i18n = createBrowserTestI18n() as BrowserTestI18nHandle

    expect(i18n.global.locale.value).toBe('en')
    expect(i18n.global.t('common.confirm')).toBe('common.confirm')
  })

  it('strict helper 会在缺失 key 时直接抛错', () => {
    const i18n = createBrowserStrictI18n({
      locale: 'en',
      messages: {
        en: {
          common: {
            confirm: 'Confirm',
          },
        },
      },
    }) as BrowserTestI18nHandle

    expect(i18n.global.t('common.confirm')).toBe('Confirm')
    expect(() => i18n.global.t('common.saved')).toThrowError('[browser-test-i18n] Missing translation: en.common.saved')
  })

  it('plugins helper 会按显式 i18nMode 创建对应的 i18n 插件', () => {
    const { pinia, plugins } = createBrowserTestPlugins({
      i18nMode: 'lite',
      pinia: true,
    })
    const i18n = plugins.at(-1) as unknown as BrowserTestI18nHandle

    expect(pinia).toBeDefined()
    expect(i18n.global.t('common.confirm')).toBe('common.confirm')
  })

  it('plugins helper 未显式指定 i18nMode 时默认使用 lite 模式', () => {
    const { plugins } = createBrowserTestPlugins()
    const i18n = plugins.at(-1) as unknown as BrowserTestI18nHandle

    expect(i18n.global.locale.value).toBe('en')
    expect(i18n.global.t('common.confirm')).toBe('common.confirm')
  })
})
