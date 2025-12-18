import messages from '@intlify/unplugin-vue-i18n/messages'
import { createI18n } from 'vue-i18n'

import { isDebug } from '~build/meta'

// 简体中文变体区域设置列表
const zhHansLocales = ['zh-CN', 'zh-SG', 'zh-MY']

// 繁体中文变体区域设置列表
const zhHantLocales = ['zh-TW', 'zh-HK', 'zh-MO']

/**
 * 为区域设置列表生成回退映射
 * @param list - 区域设置列表
 * @param script - 回退到的脚本类型（如 'zh-Hans' 或 'zh-Hant'）
 * @returns 回退映射对象
 */
function makeFallback(list: string[], script: string) {
  const result: Record<string, string[]> = {}
  for (const loc of list) {
    result[loc] = [script]
  }
  return result
}

export const i18n = createI18n({
  legacy: false,
  locale: '',
  fallbackLocale: {
    ...makeFallback(zhHansLocales, 'zh-Hans'),
    ...makeFallback(zhHantLocales, 'zh-Hant'),
    // 日语回退
    ja: ['en'],
    // 默认回退
    default: ['zh-Hans'],
  },
  messages,
  // 仅在开发调试模式下显示警告
  missingWarn: isDebug,
  fallbackWarn: isDebug,
})

/**
 * 获取当前使用的区域设置
 */
export function getI18nLocale(): string {
  return unref(i18n.global.locale)
}
