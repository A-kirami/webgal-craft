import { describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import { defineComponent, h } from 'vue'

import { renderInBrowser } from '~/__tests__/browser-render'

vi.mock('reka-ui', async () => {
  const { defineComponent, h } = await vi.importActual<typeof import('vue')>('vue')

  return {
    AlertDialogPortal: defineComponent({
      name: 'StubAlertDialogPortal',
      setup(_, { slots }) {
        return () => slots.default?.()
      },
    }),
    AlertDialogOverlay: defineComponent({
      name: 'StubAlertDialogOverlay',
      props: {
        class: {
          type: [String, Array, Object],
          default: undefined,
        },
      },
      setup(props, { attrs }) {
        return () => h('div', {
          ...attrs,
          class: props.class,
          'data-testid': 'reka-alert-dialog-overlay',
        })
      },
    }),
    AlertDialogContent: defineComponent({
      name: 'StubRekaAlertDialogContent',
      props: {
        class: {
          type: [String, Array, Object],
          default: undefined,
        },
      },
      setup(props, { attrs, slots }) {
        return () => h('div', {
          ...attrs,
          class: props.class,
          'data-testid': 'reka-alert-dialog-content',
        }, slots.default?.())
      },
    }),
    useForwardPropsEmits(props: unknown) {
      return props
    },
  }
})

import AlertDialogContent from './AlertDialogContent.vue'

describe('AlertDialogContent', () => {
  it('会把非 props attrs 转发到内部内容节点', async () => {
    const Harness = defineComponent({
      name: 'AlertDialogContentHarness',
      setup() {
        return () => h(AlertDialogContent, {
          'data-alert-dialog-probe': 'true',
          'data-testid': 'alert-dialog-probe',
          style: {
            maxWidth: '36rem',
          },
        }, () => 'content')
      },
    })

    renderInBrowser(Harness)

    const content = await page.getByTestId('alert-dialog-probe').element()
    expect(content.getAttribute('data-alert-dialog-probe')).toBe('true')
    expect(content.getAttribute('data-testid')).toBe('alert-dialog-probe')
    expect(content.style.maxWidth).toBe('36rem')
  })
})
