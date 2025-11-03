import messages from '@intlify/unplugin-vue-i18n/messages'
import { createI18n } from 'vue-i18n'

export const i18n = createI18n({
  legacy: false,
  locale: '',
  fallbackLocale: {
    // 简体中文变体回退
    'zh-CN': ['zh-Hans'],
    'zh-SG': ['zh-Hans'],
    'zh-MY': ['zh-Hans'],

    // 繁体中文变体回退
    'zh-TW': ['zh-Hant'],
    'zh-HK': ['zh-Hant'],
    'zh-MO': ['zh-Hant'],

    // 日语回退
    'ja': ['en'],

    // 默认回退
    'default': ['zh-Hans'],
  },
  messages,
  missingWarn: import.meta.env.DEV,
  fallbackWarn: import.meta.env.DEV,
})
