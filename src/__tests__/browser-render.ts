import { render } from 'vitest-browser-vue'
import { defineComponent, h } from 'vue'

import { createBrowserTestPlugins, isBrowserTestI18nPlugin } from './browser'

import type { ComponentObjectPropsOptions } from 'vue'

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
type BrowserStubProps = Record<string, unknown>
type BrowserStubPropsOptions = string[] | ComponentObjectPropsOptions<BrowserStubProps>
type BrowserPlugin = NonNullable<NonNullable<BrowserRenderOptions['global']>['plugins']>[number]

function unwrapBrowserPlugin(plugin: BrowserPlugin) {
  return Array.isArray(plugin) ? plugin[0] : plugin
}

function isPiniaPlugin(plugin: unknown): plugin is import('pinia').Pinia {
  return typeof plugin === 'object'
    && plugin !== null
    && 'install' in plugin
    && 'use' in plugin
    && 'state' in plugin
    && '_p' in plugin
    && '_a' in plugin
}

function normalizeBrowserStubValue(value: unknown) {
  if (Array.isArray(value)) {
    return String(value[0] ?? '')
  }

  return value
}

function resolveBrowserStubOption<TProps>(
  value: TProps | ((props: BrowserStubProps) => TProps),
  props: BrowserStubProps,
) {
  return typeof value === 'function'
    ? (value as (props: BrowserStubProps) => TProps)(props)
    : value
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

export function createBrowserTextStub(name: string, text: string, tag: string = 'div') {
  return defineComponent({
    name,
    setup() {
      return () => h(tag, text)
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

export function createBrowserValueStub(name: string, tag: string = 'div') {
  return defineComponent({
    name,
    props: {
      id: {
        type: String,
        default: undefined,
      },
      modelValue: {
        type: [Object, Array, Number, String, Boolean],
        default: undefined,
      },
    },
    setup(props, { attrs, slots }) {
      return () => h(tag, {
        ...(tag === 'button' ? { type: 'button' } : {}),
        ...attrs,
        id: props.id,
        value: normalizeBrowserStubValue(props.modelValue),
      }, slots.default?.())
    },
  })
}

export function createBrowserInputStub(name: string, tag: 'input' | 'textarea' = 'input') {
  return defineComponent({
    name,
    props: {
      disabled: {
        type: Boolean,
        default: undefined,
      },
      id: {
        type: String,
        default: undefined,
      },
      modelValue: {
        type: [Object, Array, Number, String, Boolean],
        default: undefined,
      },
      placeholder: {
        type: String,
        default: undefined,
      },
    },
    emits: ['update:modelValue'],
    setup(props, { attrs, emit, slots }) {
      return () => h(tag, {
        ...attrs,
        disabled: props.disabled,
        id: props.id,
        placeholder: props.placeholder,
        value: normalizeBrowserStubValue(props.modelValue),
        onInput: (event: Event) => emit('update:modelValue', (event.target as HTMLInputElement | HTMLTextAreaElement).value),
      }, slots.default?.())
    },
  })
}

export function createBrowserEmitStub(
  name: string,
  options: {
    eventName: string
    payload?: unknown
    tag?: string
    text?: string
  },
) {
  const tag = options.tag ?? 'button'

  return defineComponent({
    name,
    emits: [options.eventName],
    setup(_, { attrs, emit, slots }) {
      return () => h(tag, {
        ...(tag === 'button' ? { type: 'button' } : {}),
        ...attrs,
        onClick: () => emit(options.eventName, options.payload),
      }, options.text ?? slots.default?.())
    },
  })
}

export function createBrowserActionStub(
  name: string,
  options: {
    eventName: string
    includeDefaultSlot?: boolean
    namedSlots?: string[]
    payload?: unknown | ((props: BrowserStubProps) => unknown)
    props?: BrowserStubPropsOptions
    rootTag?: string
    testId?: string | ((props: BrowserStubProps) => string)
    text?: string | ((props: BrowserStubProps) => string)
    triggerTag?: string
  },
) {
  const rootTag = options.rootTag ?? 'div'
  const triggerTag = options.triggerTag ?? 'button'

  return defineComponent({
    name,
    props: options.props,
    emits: [options.eventName],
    setup(props, { attrs, emit, slots }) {
      return () => {
        const triggerChildren = options.text === undefined
          ? undefined
          : resolveBrowserStubOption(options.text, props)
        const payload = resolveBrowserStubOption(options.payload, props)
        const testId = resolveBrowserStubOption(options.testId, props)
        const children = [
          h(triggerTag, {
            ...(triggerTag === 'button' ? { type: 'button' } : {}),
            ...(testId === undefined ? {} : { 'data-testid': testId }),
            onClick: () => emit(options.eventName, payload),
          }, triggerChildren),
        ]

        if (options.includeDefaultSlot) {
          children.push(...(slots.default?.() ?? []))
        }

        for (const slotName of options.namedSlots ?? []) {
          children.push(...(slots[slotName]?.() ?? []))
        }

        return h(rootTag, attrs, children)
      }
    },
  })
}

export function createBrowserCheckboxStub(name: string) {
  return defineComponent({
    name,
    props: {
      id: {
        type: String,
        default: undefined,
      },
      modelValue: {
        type: Boolean,
        default: undefined,
      },
    },
    emits: ['update:modelValue'],
    setup(props, { attrs, emit }) {
      return () => h('input', {
        ...attrs,
        checked: props.modelValue,
        id: props.id,
        type: 'checkbox',
        onChange: (event: Event) => emit('update:modelValue', (event.target as HTMLInputElement).checked),
      })
    },
  })
}

export function renderInBrowser(component: BrowserRenderComponent, options: BrowserRenderOptions = {}) {
  const { browser, global, ...renderOptions } = options
  const globalPlugins = global?.plugins ?? []
  let explicitPinia: import('pinia').Pinia | undefined
  const normalizedGlobalPlugins = globalPlugins.filter((plugin) => {
    const unwrappedPlugin = unwrapBrowserPlugin(plugin)
    if (!isPiniaPlugin(unwrappedPlugin)) {
      return true
    }
    explicitPinia ??= unwrappedPlugin
    return false
  })
  const hasExplicitBrowserI18n = normalizedGlobalPlugins.some(plugin => isBrowserTestI18nPlugin(unwrapBrowserPlugin(plugin)))
  const resolvedPinia = browser?.pinia === undefined
    ? explicitPinia ?? true
    : browser.pinia
  const { plugins: browserPlugins, pinia: injectedPinia } = createBrowserTestPlugins({
    includeI18n: !hasExplicitBrowserI18n,
    i18nMode: browser?.i18nMode ?? 'lite',
    locale: browser?.locale,
    messages: browser?.messages,
    pinia: resolvedPinia,
  })
  const plugins = [...browserPlugins, ...normalizedGlobalPlugins]

  const result = render(component, {
    ...renderOptions,
    global: {
      ...global,
      plugins,
    },
  })

  return {
    ...result,
    pinia: injectedPinia ?? explicitPinia,
  }
}
