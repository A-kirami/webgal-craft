/* eslint-disable vue/one-component-per-file */
import { describe, expect, it } from 'vitest'
import { page } from 'vitest/browser'
import { render } from 'vitest-browser-vue'
import { defineComponent, h } from 'vue'

import { createBrowserTestI18n } from '~/__tests__/browser'

import AnimationEditorPane from './AnimationEditorPane.vue'

const globalStubs = {
  AnimationTimeline: defineComponent({
    name: 'StubAnimationTimeline',
    setup() {
      return () => h('div', 'Animation Timeline')
    },
  }),
  Badge: defineComponent({
    name: 'StubBadge',
    setup(_, { slots }) {
      return () => h('span', slots.default?.())
    },
  }),
  Button: defineComponent({
    name: 'StubButton',
    emits: ['click'],
    setup(_, { attrs, emit, slots }) {
      return () => h('button', {
        ...attrs,
        type: 'button',
        onClick: (event: MouseEvent) => emit('click', event),
      }, slots.default?.())
    },
  }),
  EffectDraftForm: defineComponent({
    name: 'StubEffectDraftForm',
    setup() {
      return () => h('div', 'Effect Draft Form')
    },
  }),
}

describe('AnimationEditorPane', () => {
  it('不渲染页面级标题和描述', async () => {
    render(AnimationEditorPane, {
      props: {
        canDeleteFrame: true,
        keyframes: [{
          cumulativeTime: 200,
          duration: 200,
          id: 1,
        }],
        selectedFrameId: 1,
        timelineZoomPercent: 100,
        totalDuration: 200,
      },
      global: {
        plugins: [createBrowserTestI18n()],
        stubs: globalStubs,
      },
    })

    await expect.element(page.getByRole('button', { name: 'edit.visualEditor.animation.toolbar.addFrame' })).toBeInTheDocument()
    const textContent = document.body.textContent ?? ''

    expect(textContent).not.toContain('edit.visualEditor.animation.title')
    expect(textContent).not.toContain('edit.visualEditor.animation.description')
    expect(textContent).toContain('edit.visualEditor.animation.timelineTitle')
  })
})
