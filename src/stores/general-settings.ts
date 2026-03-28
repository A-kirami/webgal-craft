import { defineStore } from 'pinia'

import { colorMode } from '~/composables/color-mode'
import { generalSettingsDefinition } from '~/features/settings/general-settings'
import { setDayjsLocale } from '~/plugins/dayjs'

export const useGeneralSettingsStore = defineStore(
  'general-settings',
  () => {
    const theme = $ref<'light' | 'dark' | 'system'>('system')
    const state = reactive({ ...generalSettingsDefinition.defaults })

    watch($$(theme), (newTheme) => {
      const mode = newTheme === 'system' ? 'auto' : newTheme
      if (colorMode.value !== mode) {
        colorMode.value = mode
      }
    }, { immediate: true })

    const i18n = useI18n()
    const { language: systemLanguage } = useNavigatorLanguage()

    const finalLanguage = $computed(() => {
      return state.language === 'system'
        ? systemLanguage.value
        : state.language
    })

    watch($$(finalLanguage), (lang) => {
      if (!lang) {
        return
      }

      i18n.locale.value = lang
      setDayjsLocale(lang)
      document.querySelector('html')?.setAttribute('lang', lang)
    }, { immediate: true })

    return {
      ...toRefs(state),
      ...$$({ theme }),
    }
  },
  {
    persist: true,
  },
)
