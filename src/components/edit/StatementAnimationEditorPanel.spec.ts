/* eslint-disable vue/one-component-per-file */
import { describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import { render } from 'vitest-browser-vue'
import { defineComponent, h, nextTick, reactive, watchEffect } from 'vue'

import { createBrowserTestI18n } from '~/__tests__/browser'

import StatementAnimationEditorPanel from './StatementAnimationEditorPanel.vue'

import type { AnimationFrame } from '~/types/stage'

const globalStubs = {
  EffectDraftForm: defineComponent({
    name: 'StubEffectDraftForm',
    setup() {
      return () => h('div', 'Effect Draft Form')
    },
  }),
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
  it('当 frames 属性使用 Vue 响应式代理时也能新增关键帧', async () => {
    const handleUpdateFrames = vi.fn()
    const frames = reactive<AnimationFrame[]>([
      {
        duration: 200,
        position: {
          x: 10,
        },
      },
    ])

    render(StatementAnimationEditorPanel, {
      props: {
        frames,
        'onUpdate:frames': handleUpdateFrames,
      },
      global: {
        plugins: [createBrowserTestI18n()],
        stubs: globalStubs,
      },
    })

    await expect.element(page.getByRole('button', { name: 'edit.visualEditor.animation.toolbar.addFrame' })).toBeInTheDocument()
    await page.getByRole('button', { name: 'edit.visualEditor.animation.toolbar.addFrame' }).click()

    expect(handleUpdateFrames).toHaveBeenCalledTimes(1)
    expect(handleUpdateFrames).toHaveBeenLastCalledWith([
      {
        duration: 200,
        position: {
          x: 10,
        },
      },
      {
        duration: 0,
      },
    ])
  })

  it('在模态框场景中隐藏历史操作按钮', async () => {
    render(StatementAnimationEditorPanel, {
      props: {
        frames: [{
          duration: 200,
        }],
      },
      global: {
        plugins: [createBrowserTestI18n()],
        stubs: globalStubs,
      },
    })

    await expect.element(page.getByRole('button', { name: 'edit.visualEditor.animation.toolbar.addFrame' })).toBeInTheDocument()
    await expect.element(page.getByRole('button', { name: 'edit.visualEditor.animation.toolbar.undo' })).not.toBeInTheDocument()
    await expect.element(page.getByRole('button', { name: 'edit.visualEditor.animation.toolbar.redo' })).not.toBeInTheDocument()
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

    render(StatementAnimationEditorPanel, {
      props: {
        frames,
        'onUpdate:frames': handleUpdateFrames,
      },
      global: {
        plugins: [createBrowserTestI18n()],
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

  it('收到失效的 timeline resize 事件时保持当前选中帧不变', async () => {
    const { state, stub } = createAnimationEditorPaneStub()
    const handleUpdateFrames = vi.fn()

    render(StatementAnimationEditorPanel, {
      props: {
        'frames': [{
          duration: 200,
          alpha: 0.5,
        }],
        'onUpdate:frames': handleUpdateFrames,
      },
      global: {
        plugins: [createBrowserTestI18n()],
        stubs: {
          ...globalStubs,
          AnimationEditorPane: stub,
        },
      },
    })

    await page.getByRole('button', { name: 'resize-invalid' }).click()
    await nextTick()

    expect(state.selectedFrameId).toBe(1)
    expect(handleUpdateFrames).not.toHaveBeenCalled()
  })
})
