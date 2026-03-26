import { describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'

import {
  createBrowserClickStub,
  createBrowserContainerStub,
  createBrowserTextStub,
  renderInBrowser,
} from '~/__tests__/browser-render'

import StatementAnimationEditorPanel from './StatementAnimationEditorPanel.vue'

import type { AnimationFrame } from '~/types/stage'

const globalStubs = {
  EffectDraftForm: createBrowserTextStub('StubEffectDraftForm', 'Effect Draft Form'),
  AnimationTimeline: createBrowserTextStub('StubAnimationTimeline', 'Animation Timeline'),
  Badge: createBrowserContainerStub('StubBadge', 'span'),
  Button: createBrowserClickStub('StubButton'),
}

function createAnimationEditorPaneStub() {
  const state = reactive<{
    selectedFrame: Record<string, unknown> | undefined
    selectedFrameId: number | undefined
  }>({
    selectedFrame: undefined,
    selectedFrameId: undefined,
  })

  const stub = defineComponent({
    name: 'StubAnimationEditorPane',
    props: {
      selectedFrame: {
        type: Object,
        default: undefined,
      },
      selectedFrameId: {
        type: Number,
        default: undefined,
      },
    },
    emits: ['delete-frame', 'resize-duration', 'select-frame', 'update:selected-frame-transform'],
    setup(props, { emit }) {
      watchEffect(() => {
        state.selectedFrame = props.selectedFrame as Record<string, unknown> | undefined
        state.selectedFrameId = props.selectedFrameId
      })

      return () => h('div', [
        h('button', {
          type: 'button',
          onClick: () => emit('select-frame', 2),
        }, 'select-frame-2'),
        h('button', {
          type: 'button',
          onClick: () => emit('update:selected-frame-transform', {
            flush: false,
            value: { alpha: 1 },
          }),
        }, 'draft-transform'),
        h('button', {
          type: 'button',
          onClick: () => emit('delete-frame'),
        }, 'delete-frame'),
        h('button', {
          type: 'button',
          onClick: () => emit('resize-duration', {
            id: 99,
            duration: 320,
            flush: true,
          }),
        }, 'resize-invalid'),
      ])
    },
  })

  return {
    state,
    stub,
  }
}

describe('StatementAnimationEditorPanel', () => {
  it('在模态框场景中隐藏历史操作按钮', async () => {
    renderInBrowser(StatementAnimationEditorPanel, {
      props: {
        frames: [{
          duration: 200,
        }],
      },
      global: {
        stubs: globalStubs,
      },
    })

    await expect.element(page.getByRole('button', { name: 'edit.visualEditor.animation.toolbar.addFrame' })).toBeInTheDocument()
    const textContent = document.body.textContent ?? ''

    expect(textContent).not.toContain('edit.visualEditor.animation.toolbar.undo')
    expect(textContent).not.toContain('edit.visualEditor.animation.toolbar.redo')
  })

  it('删除当前帧前会先清空草稿，避免旧草稿挂到重排后的帧上', async () => {
    const { state, stub } = createAnimationEditorPaneStub()
    const frames = reactive<AnimationFrame[]>([
      {
        duration: 120,
        position: { x: 10 },
      },
      {
        duration: 180,
        alpha: 0.5,
      },
      {
        duration: 240,
        position: { x: 30 },
      },
    ])
    const handleUpdateFrames = vi.fn((nextFrames: AnimationFrame[]) => {
      frames.splice(0, frames.length, ...nextFrames)
    })

    renderInBrowser(StatementAnimationEditorPanel, {
      props: {
        frames,
        'onUpdate:frames': handleUpdateFrames,
      },
      global: {
        stubs: {
          ...globalStubs,
          AnimationEditorPane: stub,
        },
      },
    })

    await page.getByRole('button', { name: 'select-frame-2' }).click()
    await nextTick()
    await page.getByRole('button', { name: 'draft-transform' }).click()
    await nextTick()
    await page.getByRole('button', { name: 'delete-frame' }).click()
    await nextTick()

    expect(handleUpdateFrames).toHaveBeenCalledTimes(1)
    expect(state.selectedFrameId).toBe(2)
    expect(state.selectedFrame?.transform).toEqual({
      position: { x: 30 },
    })
  })
})
