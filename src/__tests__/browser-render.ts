import { render } from 'vitest-browser-vue'
import { defineComponent, h } from 'vue'

import { createBrowserTestPlugins, isBrowserTestI18nPlugin } from './browser'

type BrowserRenderCall = typeof render
type BrowserRenderComponent = Parameters<BrowserRenderCall>[0]
type BrowserRenderOptions = NonNullable<Parameters<BrowserRenderCall>[1]> & {
  browser?: {
    i18nMode?: 'lite' | 'localized' | 'strict'
    locale?: string
    messages?: Record<string, unknown>
    pinia?: boolean | import('pinia').Pinia
  }
}

export function createBrowserClickStub(name: string, tag: string = 'button') {
  return defineComponent({
    name,
    emits: ['click'],
    setup(_, { attrs, emit, slots }) {
      return () => h(tag, {
        ...attrs,
        ...(tag === 'button' ? { type: 'button' } : {}),
        onClick: (event: MouseEvent) => emit('click', event),
      }, slots.default?.())
    },
  })
}

export function createBrowserContainerStub(name: string, tag: string = 'div') {
  return defineComponent({
    name,
    setup(_, { attrs, slots }) {
      return () => h(tag, attrs, slots.default?.())
    },
  })
}

export function renderInBrowser(component: BrowserRenderComponent, options: BrowserRenderOptions = {}) {
  const { browser, global, ...renderOptions } = options
  const globalPlugins = global?.plugins ?? []
  const hasExplicitBrowserI18n = globalPlugins.some((plugin) => {
    const candidate = Array.isArray(plugin) ? plugin[0] : plugin
    return isBrowserTestI18nPlugin(candidate)
  })
  const { plugins: browserPlugins, pinia } = createBrowserTestPlugins({
    includeI18n: !hasExplicitBrowserI18n,
    i18nMode: browser?.i18nMode ?? 'lite',
    locale: browser?.locale,
    messages: browser?.messages,
    pinia: browser?.pinia,
  })
  const plugins = [...browserPlugins, ...globalPlugins]

  const result = render(component, {
    ...renderOptions,
    global: {
      ...global,
      plugins,
    },
  })

  return {
    ...result,
    pinia,
  }
}
