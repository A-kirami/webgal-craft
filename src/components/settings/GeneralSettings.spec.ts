import { describe, expect, it } from 'vitest'
import { page } from 'vitest/browser'
import { defineComponent, h } from 'vue'

import { createBrowserConsoleMonitor } from '~/__tests__/browser'
import { renderInBrowser } from '~/__tests__/browser-render'

import GeneralSettings from './GeneralSettings.vue'

const { expectNoConsoleMessage } = createBrowserConsoleMonitor()

const globalStubs = {
  SettingsForm: defineComponent({
    name: 'StubSettingsForm',
    setup() {
      return () => h('div', { 'data-testid': 'settings-form-stub' })
    },
  }),
  ThemeStyleMap: defineComponent({
    name: 'StubThemeStyleMap',
    setup() {
      return () => h('div', { 'data-testid': 'theme-style-map' })
    },
  }),
}

describe('GeneralSettings', () => {
  it('渲染主题设置且不依赖 FormField 上下文', async () => {
    renderInBrowser(GeneralSettings, {
      browser: {
        i18nMode: 'localized',
      },
      global: {
        stubs: globalStubs,
      },
    })

    await expect.element(page.getByText('主题')).toBeInTheDocument()
    await expect.element(page.getByText('浅色')).toBeInTheDocument()
    await expect.element(page.getByText('深色')).toBeInTheDocument()
    await expect.element(page.getByText('跟随系统')).toBeInTheDocument()

    expectNoConsoleMessage('useFormField should be used within <FormField>')
    expectNoConsoleMessage('Symbol(vee-validate-field-instance)')
  })

  it('主题 radio 共享同一个 name，保持原生单选组语义', async () => {
    renderInBrowser(GeneralSettings, {
      browser: {
        i18nMode: 'localized',
      },
      global: {
        stubs: globalStubs,
      },
    })

    const radios = page.getByRole('radio').elements()
    const names = radios.map(radio => radio.getAttribute('name'))

    expect(names).toHaveLength(3)
    expect(new Set(names).size).toBe(1)
    expect(names[0]).toBeTruthy()
  })
})
