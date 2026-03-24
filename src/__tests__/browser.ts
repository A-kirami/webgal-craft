import { createPinia } from 'pinia'
import { afterEach, beforeEach, expect, vi } from 'vitest'
import { createI18n } from 'vue-i18n'

import type { Pinia } from 'pinia'
import type { MockInstance } from 'vitest'
import type { Plugin } from 'vue'

interface BrowserTestI18nOptions {
  locale?: string
  messages?: Record<string, unknown>
}

interface BrowserTestPluginsOptions extends BrowserTestI18nOptions {
  pinia?: boolean | Pinia
}

interface BrowserConsoleMonitor {
  expectNoConsoleMessage(pattern: string | RegExp): void
}

export function createBrowserTestI18n(options: BrowserTestI18nOptions = {}) {
  return createI18n({
    legacy: false,
    locale: options.locale ?? 'en',
    messages: options.messages as never,
    missingWarn: false,
    fallbackWarn: false,
    missing: (_locale, key) => key,
  })
}

export function createBrowserTestPlugins(options: BrowserTestPluginsOptions = {}) {
  const plugins: Plugin[] = []
  let pinia: Pinia | undefined

  if (options.pinia) {
    pinia = options.pinia === true ? createPinia() : options.pinia
    plugins.push(pinia)
  }

  plugins.push(createBrowserTestI18n({
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
