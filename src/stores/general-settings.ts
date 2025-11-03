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

    function applyLanguage(targetLanguage: string | 'system') {
      const finalLanguage = targetLanguage === 'system'
        ? systemLanguage.value
        : targetLanguage

      if (finalLanguage) {
        i18n.locale.value = finalLanguage
        setDayjsLocale(finalLanguage)
        document.querySelector('html')?.setAttribute('lang', finalLanguage)
      }
    }

    const systemLanguageWatcher = watch(systemLanguage, () => {
      applyLanguage('system')
    })

    watch($$(language), (newLanguage) => {
      if (newLanguage !== undefined) {
        applyLanguage(newLanguage)

        if (newLanguage === 'system') {
          systemLanguageWatcher.resume()
        } else {
          systemLanguageWatcher.pause()
        }
      }
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
