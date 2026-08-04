import { platform } from '@tauri-apps/plugin-os'

import type { Platform } from '@tauri-apps/plugin-os'

export function isAndroidRuntime(runtimePlatform: Platform = platform()): boolean {
  return runtimePlatform === 'android'
}

export function isDesktopRuntime(runtimePlatform: Platform = platform()): boolean {
  return runtimePlatform !== 'android' && runtimePlatform !== 'ios'
}
