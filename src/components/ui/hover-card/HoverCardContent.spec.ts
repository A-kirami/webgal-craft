import { describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import { defineComponent, h } from 'vue'

import { renderInBrowser } from '~/__tests__/browser-render'

vi.mock('reka-ui', async () => {
  const { defineComponent, h } = await vi.importActual<typeof import('vue')>('vue')

  return {
    HoverCardPortal: defineComponent({
      name: 'StubHoverCardPortal',
      setup(_, { slots }) {
        return () => slots.default?.()
      },
    }),
    HoverCardContent: defineComponent({
      name: 'StubRekaHoverCardContent',
      props: {
        class: {
          type: [String, Array, Object],
          default: undefined,
        },
        sideOffset: {
          type: Number,
          default: undefined,
        },
      },
      setup(props, { attrs, slots }) {
        return () => h('div', {
          ...attrs,
          class: props.class,
          'data-side-offset': props.sideOffset,
          'data-testid': 'reka-hover-card-content',
        }, slots.default?.())
      },
    }),
    useForwardProps(props: unknown) {
      return props
    },
  }
})

import HoverCardContent from './HoverCardContent.vue'

describe('HoverCardContent', () => {
  it('会把非 props attrs 转发到内部内容节点', async () => {
    const Harness = defineComponent({
      name: 'HoverCardContentHarness',
      setup() {
        return () => h(HoverCardContent, {
          style: {
            maxWidth: 'calc(100vw - 2rem)',
          },
          'data-file-viewer-hover-preview': 'true',
        }, () => 'preview')
      },
    })

    renderInBrowser(Harness)

    const content = await page.getByTestId('reka-hover-card-content').element()
    expect(content.getAttribute('data-file-viewer-hover-preview')).toBe('true')
    expect(content.style.maxWidth).toContain('100vw')
    expect(content.style.maxWidth).toContain('2rem')
  })
})
