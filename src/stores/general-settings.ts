import { defineStore } from 'pinia'

import { setDayjsLocale } from '~/plugins/dayjs'

export const useGeneralSettingsStore = defineStore(
  'general-settings',
  () => {
    const theme = $ref<'light' | 'dark' | 'system'>('system')
    const language = $ref<'system' | 'zh-Hans' | 'zh-Hant' | 'en' | 'ja'>('system')
    const openLastProject = $ref<boolean>(false)
    const autoInstallUpdates = $ref<boolean>(true)

    const colorMode = useColorMode({
      storageKey: undefined,
    })

    watch($$(theme), (newTheme) => {
      const mode = newTheme === 'system' ? 'auto' : newTheme
      if (colorMode.value !== mode) {
        colorMode.value = mode
      }
    }, { immediate: true })

    const i18n = useI18n()
    const { language: systemLanguage } = useNavigatorLanguage()

    // 计算最终语言：如果选择系统语言则使用系统语言，否则使用用户选择的语言
    const finalLanguage = $computed(() => {
      return language === 'system'
        ? systemLanguage.value
        : language
    })

    // 监听最终语言变化并应用
    watch($$(finalLanguage), (lang) => {
      if (!lang) {
        return
      }
      i18n.locale.value = lang
      setDayjsLocale(lang)
      document.querySelector('html')?.setAttribute('lang', lang)
    }, { immediate: true })

    return $$({
      theme,
      language,
      openLastProject,
      autoInstallUpdates,
    })
  },
  {
    persist: true,
  },
)
