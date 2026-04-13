import { describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import { defineComponent, h } from 'vue'

import { renderInBrowser } from '~/__tests__/browser-render'

vi.mock('reka-ui', async () => {
  const { defineComponent, h } = await vi.importActual<typeof import('vue')>('vue')

  return {
    DialogPortal: defineComponent({
      name: 'StubDialogPortal',
      setup(_, { slots }) {
        return () => slots.default?.()
      },
    }),
    DialogOverlay: defineComponent({
      name: 'StubDialogOverlay',
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
          'data-testid': 'reka-dialog-overlay',
        })
      },
    }),
    DialogContent: defineComponent({
      name: 'StubRekaDialogContent',
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
          'data-testid': 'reka-dialog-content',
        }, slots.default?.())
      },
    }),
    DialogClose: defineComponent({
      name: 'StubDialogClose',
      setup(_, { attrs, slots }) {
        return () => h('button', {
          ...attrs,
          type: 'button',
        }, slots.default?.())
      },
    }),
    useForwardPropsEmits(props: unknown) {
      return props
    },
  }
})

import DialogContent from './DialogContent.vue'

describe('DialogContent', () => {
  it('会把非 props attrs 转发到内部内容节点', async () => {
    const Harness = defineComponent({
      name: 'DialogContentHarness',
      setup() {
        return () => h(DialogContent, {
          'data-dialog-content-probe': 'true',
          'data-testid': 'dialog-content-probe',
          style: {
            maxWidth: '42rem',
          },
        }, () => 'content')
      },
    })

    renderInBrowser(Harness)

    const content = await page.getByTestId('dialog-content-probe').element()
    expect(content.getAttribute('data-dialog-content-probe')).toBe('true')
    expect(content.getAttribute('data-testid')).toBe('dialog-content-probe')
    expect(content.style.maxWidth).toBe('42rem')
  })
})
