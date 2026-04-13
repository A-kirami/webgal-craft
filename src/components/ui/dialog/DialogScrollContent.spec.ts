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
      setup(props, { attrs, slots }) {
        return () => h('div', {
          ...attrs,
          class: props.class,
          'data-testid': 'reka-dialog-scroll-overlay',
        }, slots.default?.())
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
          'data-testid': 'reka-dialog-scroll-content',
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

import DialogScrollContent from './DialogScrollContent.vue'

describe('DialogScrollContent', () => {
  it('会把非 props attrs 转发到内部内容节点', async () => {
    const Harness = defineComponent({
      name: 'DialogScrollContentHarness',
      setup() {
        return () => h(DialogScrollContent, {
          'data-dialog-scroll-probe': 'true',
          'data-testid': 'dialog-scroll-probe',
          style: {
            maxHeight: '80vh',
          },
        }, () => 'content')
      },
    })

    renderInBrowser(Harness)

    const content = await page.getByTestId('dialog-scroll-probe').element()
    expect(content.getAttribute('data-dialog-scroll-probe')).toBe('true')
    expect(content.getAttribute('data-testid')).toBe('dialog-scroll-probe')
    expect(content.style.maxHeight).toBe('80vh')
  })
})
