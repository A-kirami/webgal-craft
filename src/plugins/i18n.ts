import messages from '@intlify/unplugin-vue-i18n/messages'
import { createI18n } from 'vue-i18n'

export const i18n = createI18n({
  legacy: false,
  locale: '',
  fallbackLocale: {
    'zh-TW': ['zh-CN'],
    'ja': ['en', 'zh-CN'],
    'default': ['zh-CN'],
  },
  messages,
  missingWarn: import.meta.env.DEV,
  fallbackWarn: import.meta.env.DEV,
})
