import { describe, expect, it } from 'vitest'

import { isDesktopRuntime } from '~/services/platform/runtime'

describe('isDesktopRuntime', () => {
  it.each(['windows', 'linux', 'macos'] as const)('%s 被识别为桌面平台', (platform) => {
    expect(isDesktopRuntime(platform)).toBe(true)
  })

  it.each(['android', 'ios'] as const)('%s 被识别为移动平台', (platform) => {
    expect(isDesktopRuntime(platform)).toBe(false)
  })
})
