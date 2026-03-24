import { createPinia } from 'pinia'
import { afterEach, beforeEach, expect, vi } from 'vitest'
import { createI18n } from 'vue-i18n'

import enMessages from '~/locales/en.yml'

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
  expectNoConsoleMessage(pattern: string): void
}

type BrowserTestMessages = Record<string, unknown>

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

function resolveBrowserTestMessages(messages?: BrowserTestMessages): BrowserTestMessages {
  const defaults = { en: enMessages as BrowserTestMessages }

  return messages
    ? mergeMessageRecords(defaults, messages)
    : defaults
}

export function createBrowserTestI18n(options: BrowserTestI18nOptions = {}) {
  return createI18n({
    legacy: false,
    locale: options.locale ?? 'en',
    messages: resolveBrowserTestMessages(options.messages) as never,
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

  function expectNoConsoleMessage(pattern: string) {
    const output = [consoleWarnSpy, consoleErrorSpy]
      .flatMap(spy => spy?.mock.calls ?? [])
      .flat()
      .map(String)
      .join('\n')

    expect(output).not.toContain(pattern)
  }

  return {
    expectNoConsoleMessage,
  }
}
