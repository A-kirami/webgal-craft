export type SystemPlatform = 'linux' | 'mac' | 'windows'

/**
 * 基于 navigator 的平台检测，仅用于展示层（如快捷键修饰键文案）。
 * 浏览器和测试环境都安全；运行环境能力判断（Tauri、Android）见 ~/services/platform/runtime。
 */
export function detectSystemPlatform(): SystemPlatform {
  if (typeof navigator === 'undefined') {
    return 'windows'
  }

  const userAgent = navigator.userAgent.toLowerCase()
  if (userAgent.includes('mac') || userAgent.includes('iphone') || userAgent.includes('ipad')) {
    return 'mac'
  }

  if (userAgent.includes('win')) {
    return 'windows'
  }

  return 'linux'
}
