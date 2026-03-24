/* eslint-disable vue/one-component-per-file */
import { describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import { render } from 'vitest-browser-vue'
import { defineComponent, h, onMounted } from 'vue'

import { createBrowserTestI18n } from '~/__tests__/browser'

import StatementAnimationSubDialog from './StatementAnimationSubDialog.vue'

const globalStubs = {
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
  Dialog: defineComponent({
    name: 'StubDialog',
    setup(_, { slots }) {
      return () => h('div', slots.default?.())
    },
  }),
  DialogDescription: defineComponent({
    name: 'StubDialogDescription',
    setup(_, { slots }) {
      return () => h('p', slots.default?.())
    },
  }),
  DialogFooter: defineComponent({
    name: 'StubDialogFooter',
    setup(_, { slots }) {
      return () => h('footer', slots.default?.())
    },
  }),
  DialogHeader: defineComponent({
    name: 'StubDialogHeader',
    setup(_, { slots }) {
      return () => h('header', slots.default?.())
    },
  }),
  DialogScrollContent: defineComponent({
    name: 'StubDialogScrollContent',
    setup(_, { slots }) {
      return () => h('div', slots.default?.())
    },
  }),
  DialogTitle: defineComponent({
    name: 'StubDialogTitle',
    setup(_, { slots }) {
      return () => h('h2', slots.default?.())
    },
  }),
  StatementAnimationEditorPanel: defineComponent({
    name: 'StubStatementAnimationEditorPanel',
    setup() {
      return () => h('div', 'Statement Animation Editor Panel')
    },
  }),
}

function createDialogScrollContentStub() {
  const state = {
    defaultPrevented: undefined as boolean | undefined,
  }

  const stub = defineComponent({
    name: 'StubDialogScrollContent',
    emits: ['openAutoFocus'],
    setup(_, { emit, slots }) {
      onMounted(() => {
        const event = new Event('open-auto-focus', { cancelable: true })
        emit('openAutoFocus', event)
        state.defaultPrevented = event.defaultPrevented
      })

      return () => h('div', slots.default?.())
    },
  })

  return {
    state,
    stub,
  }
}

describe('StatementAnimationSubDialog', () => {
  it('在弹窗头部复用共享的动画说明文案', async () => {
    render(StatementAnimationSubDialog, {
      props: {
        animationDialog: {
          draftFrames: [],
          handleApply: vi.fn(),
          isDefault: true,
          isDirty: false,
          isOpen: true,
          requestClose: vi.fn(),
          resetToDefault: vi.fn(),
          updateFrames: vi.fn(),
        },
      },
      global: {
        plugins: [createBrowserTestI18n()],
        stubs: globalStubs,
      },
    })

    await expect.element(page.getByText('edit.visualEditor.animation.title')).toBeInTheDocument()
    await expect.element(page.getByText('edit.visualEditor.animation.description')).toBeInTheDocument()
    await expect.element(page.getByText('edit.visualEditor.commandDescriptions.setTempAnimation')).not.toBeInTheDocument()
  })

  it('打开时不会阻止对话框内容接管键盘焦点', async () => {
    const { state, stub } = createDialogScrollContentStub()

    render(StatementAnimationSubDialog, {
      props: {
        animationDialog: {
          draftFrames: [],
          handleApply: vi.fn(),
          isDefault: true,
          isDirty: false,
          isOpen: true,
          requestClose: vi.fn(),
          resetToDefault: vi.fn(),
          updateFrames: vi.fn(),
        },
      },
      global: {
        plugins: [createBrowserTestI18n()],
        stubs: {
          ...globalStubs,
          DialogScrollContent: stub,
        },
      },
    })

    await expect.poll(() => state.defaultPrevented).toBe(false)
  })
})
