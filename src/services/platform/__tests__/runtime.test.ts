import { describe, expect, it, vi } from 'vitest'

const { platformMock } = vi.hoisted(() => ({
  platformMock: vi.fn(() => 'android' as const),
}))

vi.mock('@tauri-apps/plugin-os', () => ({
  platform: platformMock,
}))

import { isAndroidRuntime, isDesktopRuntime } from '~/services/platform/runtime'

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

describe('isAndroidRuntime', () => {
  it('只把 Android 识别为 Android 运行时', () => {
    expect(isAndroidRuntime('android')).toBe(true)
    expect(isAndroidRuntime('ios')).toBe(false)
    expect(isAndroidRuntime('windows')).toBe(false)
  })
})
