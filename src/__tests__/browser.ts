import { createPinia } from 'pinia'
import { afterEach, beforeEach, expect, vi } from 'vitest'
import { createI18n } from 'vue-i18n'

import zhHansMessages from '~/locales/zh-Hans.yml'

import type { Pinia } from 'pinia'
import type { MockInstance } from 'vitest'
import type { Plugin } from 'vue'
import type { I18n } from 'vue-i18n'

interface BrowserTestI18nOptions {
  locale?: string
  messages?: Record<string, unknown>
}

interface BrowserTestPluginsOptions extends BrowserTestI18nOptions {
  i18nMode?: BrowserTestI18nMode
  pinia?: boolean | Pinia
}

interface BrowserConsoleMonitor {
  expectNoConsoleMessage(pattern: string | RegExp): void
}

type BrowserTestMessages = Record<string, unknown>
type BrowserTestI18nMode = 'lite' | 'localized' | 'strict'

interface BrowserTestI18nConfig extends BrowserTestI18nOptions {
  includeDefaultMessages: boolean
  strict: boolean
}

function isMessageRecord(value: unknown): value is BrowserTestMessages {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function mergeMessageRecords(base: BrowserTestMessages, override: BrowserTestMessages): BrowserTestMessages {
  const merged: BrowserTestMessages = { ...base }

  for (const [key, value] of Object.entries(override)) {
    const current = merged[key]

    merged[key] = isMessageRecord(current) && isMessageRecord(value)
      ? mergeMessageRecords(current, value)
      : value
  }

  return merged
}

function getBrowserTestDefaultMessages(): BrowserTestMessages {
  return { 'zh-Hans': zhHansMessages as BrowserTestMessages }
}

function resolveBrowserTestMessages(messages: BrowserTestMessages | undefined, includeDefaultMessages: boolean): BrowserTestMessages {
  if (!includeDefaultMessages) {
    return messages ?? {}
  }

  const defaults = getBrowserTestDefaultMessages()

  return messages
    ? mergeMessageRecords(defaults, messages)
    : defaults
}

function createBrowserTestI18nInstance(config: BrowserTestI18nConfig): I18n {
  const locale = config.locale ?? 'zh-Hans'
  const messages = resolveBrowserTestMessages(config.messages, config.includeDefaultMessages)

  const i18n = createI18n({
    legacy: false,
    locale,
    messages: messages as never,
    missingWarn: false,
    fallbackWarn: false,
    missing: (missingLocale, key) => {
      if (config.strict) {
        throw new Error(`[browser-test-i18n] Missing translation: ${String(missingLocale ?? locale)}.${key}`)
      }

      return key
    },
  })

  return i18n
}

export function createBrowserLiteI18n(options: BrowserTestI18nOptions = {}) {
  return createBrowserTestI18nInstance({
    ...options,
    includeDefaultMessages: false,
    strict: false,
  })
}

export function createBrowserTestI18n(options: BrowserTestI18nOptions = {}) {
  return createBrowserLiteI18n({
    ...options,
    locale: options.locale ?? 'en',
  })
}

export function createBrowserLocalizedI18n(options: BrowserTestI18nOptions = {}) {
  return createBrowserTestI18nInstance({
    ...options,
    includeDefaultMessages: true,
    strict: false,
  })
}

export function createBrowserStrictI18n(options: BrowserTestI18nOptions = {}) {
  return createBrowserTestI18nInstance({
    ...options,
    includeDefaultMessages: true,
    strict: true,
  })
}

export function createBrowserTestPlugins(options: BrowserTestPluginsOptions = {}) {
  const plugins: Plugin[] = []
  let pinia: Pinia | undefined

  if (options.pinia) {
    pinia = options.pinia === true ? createPinia() : options.pinia
    plugins.push(pinia)
  }

  const createI18nPlugin = options.i18nMode
    ? {
        lite: createBrowserLiteI18n,
        localized: createBrowserLocalizedI18n,
        strict: createBrowserStrictI18n,
      }[options.i18nMode]
    : createBrowserTestI18n

  plugins.push(createI18nPlugin({
    locale: options.locale,
    messages: options.messages,
  }))

  return {
    plugins,
    pinia,
  }
}

export function createBrowserConsoleMonitor(): BrowserConsoleMonitor {
  let consoleWarnSpy: MockInstance<typeof console.warn> | undefined
  let consoleErrorSpy: MockInstance<typeof console.error> | undefined

  beforeEach(() => {
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => { /* no-op */ })
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => { /* no-op */ })
  })

  afterEach(() => {
    consoleWarnSpy?.mockRestore()
    consoleErrorSpy?.mockRestore()
  })

  function expectNoConsoleMessage(pattern: string | RegExp) {
    const output = [consoleWarnSpy, consoleErrorSpy]
      .flatMap(spy => spy?.mock.calls ?? [])
      .flat()
      .map(String)
      .join('\n')

    if (pattern instanceof RegExp) {
      expect(pattern.test(output)).toBe(false)
      return
    }
    expect(output).not.toContain(pattern)
  }

  return {
    expectNoConsoleMessage,
  }
}
