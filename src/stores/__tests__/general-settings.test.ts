import '~/__tests__/setup'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick, ref } from 'vue'

import { generalSettingsDefinition } from '~/features/settings/general-settings'
import { useGeneralSettingsStore } from '~/stores/general-settings'

const { dayjsLocaleMock } = vi.hoisted(() => ({
  dayjsLocaleMock: vi.fn(),
}))
const locale = ref('en')
const systemLanguage = ref<'en' | 'ja'>('ja')
const colorMode = ref<'auto' | 'light' | 'dark'>('auto')
const setAttributeMock = vi.fn()

vi.mock('~/plugins/dayjs', () => ({
  setDayjsLocale: dayjsLocaleMock,
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ locale, t: (key: string) => key }),
  createI18n: () => ({}),
}))

vi.mock('@vueuse/core', () => ({
  useNavigatorLanguage: () => ({ language: systemLanguage }),
}))

vi.mock('~/composables/color-mode', () => ({
  get colorMode() {
    return colorMode
  },
}))

describe('通用设置状态仓库', () => {
  beforeEach(() => {
    locale.value = 'en'
    systemLanguage.value = 'ja'
    colorMode.value = 'auto'
    dayjsLocaleMock.mockReset()
    setAttributeMock.mockReset()
    vi.stubGlobal('document', {
      querySelector: vi.fn((selector: string) => {
        if (selector !== 'html') {
          return
        }
        return {
          setAttribute: setAttributeMock,
        }
      }),
    } as unknown as Document)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('theme 会同步到全局 colorMode，并保留 system -> auto 的映射', async () => {
    const store = useGeneralSettingsStore()

    await nextTick()
    expect(colorMode.value).toBe('auto')

    store.theme = 'dark'
    await nextTick()
    expect(colorMode.value).toBe('dark')

    store.theme = 'light'
    await nextTick()
    expect(colorMode.value).toBe('light')
  })

  it('language 默认跟随系统语言，并在切换时同步 i18n/dayjs/html lang', async () => {
    const store = useGeneralSettingsStore()

    await nextTick()
    expect(locale.value).toBe('ja')
    expect(dayjsLocaleMock).toHaveBeenLastCalledWith('ja')
    expect(setAttributeMock).toHaveBeenLastCalledWith('lang', 'ja')

    store.language = 'en'
    await nextTick()

    expect(locale.value).toBe('en')
    expect(dayjsLocaleMock).toHaveBeenLastCalledWith('en')
    expect(setAttributeMock).toHaveBeenLastCalledWith('lang', 'en')
  })

  it('语言选项仅保留 follow system 走 i18n，其余语言名称使用固定自称', () => {
    const languageField = generalSettingsDefinition.schema.general.fields.language

    expect(languageField.type).toBe('select')
    if (languageField.type !== 'select') {
      throw new Error('language field should be select')
    }

    expect(typeof languageField.options[0]?.label).toBe('function')
    expect(languageField.options.slice(1)).toEqual([
      { value: 'zh-Hans', label: '简体中文' },
      { value: 'zh-Hant', label: '繁體中文' },
      { value: 'en', label: 'English' },
      { value: 'ja', label: '日本語' },
    ])
  })
})
