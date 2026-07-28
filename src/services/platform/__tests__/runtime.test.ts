import { describe, expect, it, vi } from 'vitest'

const { platformMock } = vi.hoisted(() => ({
  platformMock: vi.fn(() => 'android' as const),
}))

vi.mock('@tauri-apps/plugin-os', () => ({
  platform: platformMock,
}))

import { isDesktopRuntime } from '~/services/platform/runtime'

describe('isDesktopRuntime', () => {
  it('未传入平台时使用运行时平台', () => {
    expect(isDesktopRuntime()).toBe(false)
    expect(platformMock).toHaveBeenCalledOnce()
  })

  it.each(['windows', 'linux', 'macos'] as const)('%s 被识别为桌面平台', (platform) => {
    expect(isDesktopRuntime(platform)).toBe(true)
  })

  it.each(['android', 'ios'] as const)('%s 被识别为移动平台', (platform) => {
    expect(isDesktopRuntime(platform)).toBe(false)
  })
})
