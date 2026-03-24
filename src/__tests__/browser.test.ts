import { describe, expect, it } from 'vitest'

import { createBrowserConsoleMonitor } from './browser'

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
