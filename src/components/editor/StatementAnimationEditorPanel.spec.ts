import { describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'

import {
  createBrowserClickStub,
  createBrowserContainerStub,
  createBrowserTextStub,
  renderInBrowser,
} from '~/__tests__/browser-render'
import { useShortcutContextRegistry } from '~/features/editor/shortcut/shortcut-context-registry'
import { useShortcutContext } from '~/features/editor/shortcut/useShortcutContext'
import { useShortcutDispatcher } from '~/features/editor/shortcut/useShortcutDispatcher'

import EditorDrawer from './EditorDrawer.vue'
import StatementAnimationEditorPanel from './StatementAnimationEditorPanel.vue'

import type { AnimationFrame } from '~/domain/stage/types'

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

function createShortcutHarness(options: { enableHistoryShortcuts: boolean, isModalOpen: boolean }) {
  const frames = reactive<AnimationFrame[]>([
    {
      duration: 120,
    },
    {
      duration: 180,
    },
  ])
  const handleUpdateFrames = vi.fn((nextFrames: AnimationFrame[]) => {
    frames.splice(0, frames.length, ...nextFrames)
  })
  const { stub } = createAnimationEditorPaneStub()

  const harness = defineComponent({
    name: 'AnimationShortcutHarness',
    setup() {
      useShortcutDispatcher({
        bindings: [],
        executeContext: undefined,
        platform: 'windows',
      })

      // 模态宿主打开期间窗口级 isModalOpen 为 true，面板自己的绑定必须显式放行模态场景
      useShortcutContext({ isModalOpen: options.isModalOpen })

      return () => h(StatementAnimationEditorPanel, {
        'enableHistoryShortcuts': options.enableHistoryShortcuts,
        frames,
        'onUpdate:frames': handleUpdateFrames,
      })
    },
  })

  return { frames, harness, stub }
}

async function renderShortcutHarness(options: { enableHistoryShortcuts: boolean, isModalOpen: boolean }) {
  const fixture = createShortcutHarness(options)

  await renderInBrowser(fixture.harness, {
    global: {
      stubs: {
        ...globalStubs,
        AnimationEditorPane: fixture.stub,
      },
    },
  })

  const panelElement = await page.getByTestId('statement-animation-editor-panel').element()
  panelElement.focus()

  await vi.waitFor(() => {
    expect(useShortcutContextRegistry().resolveContext().panelFocus).toBe('animationEditor')
  })

  return fixture
}

describe('StatementAnimationEditorPanel', () => {
  it('关闭抽屉且宿主未接管焦点时把焦点还给触发元素', async () => {
    const harness = defineComponent({
      name: 'AnimationDrawerFocusHarness',
      setup() {
        const isOpen = ref(false)

        return () => h('div', [
          h('button', {
            'data-testid': 'drawer-trigger',
            'onClick': () => {
              isOpen.value = true
            },
            'type': 'button',
          }, 'open'),
          h(EditorDrawer, {
            'open': isOpen.value,
            'panelFocus': 'animationEditor',
            'onUpdate:open': (value: boolean) => {
              if (!value) {
                isOpen.value = false
              }
            },
          }, {
            default: () => h(StatementAnimationEditorPanel, {
              frames: [{ duration: 200 }],
            }),
          }),
        ])
      },
    })

    await renderInBrowser(harness, {
      global: {
        stubs: globalStubs,
      },
    })

    await page.getByTestId('drawer-trigger').click()
    await expect.element(page.getByTestId('statement-animation-editor-panel')).toBeVisible()
    expect(document.activeElement).toBe(document.querySelector('[data-testid="statement-animation-editor-panel"]'))

    await page.getByRole('button', { name: 'Close' }).click()
    await expect.element(page.getByTestId('statement-animation-editor-panel')).not.toBeInTheDocument()

    await vi.waitFor(() => {
      expect(document.activeElement).toBe(document.querySelector('[data-testid="drawer-trigger"]'))
    })
  })

  it('在模态框场景中隐藏历史操作按钮', async () => {
    await renderInBrowser(StatementAnimationEditorPanel, {
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

  it('页脚按钮分别发出取消与应用事件', async () => {
    const onApply = vi.fn()
    const onCancel = vi.fn()

    await renderInBrowser(StatementAnimationEditorPanel, {
      props: {
        frames: [{
          duration: 200,
        }],
        onApply,
        onCancel,
      },
      global: {
        stubs: globalStubs,
      },
    })

    await page.getByRole('button', { name: 'common.cancel' }).click()
    await page.getByRole('button', { name: 'common.confirm' }).click()

    expect(onCancel).toHaveBeenCalledOnce()
    expect(onApply).toHaveBeenCalledOnce()
  })

  it('宿主提供自己的页脚时可以隐藏面板页脚', async () => {
    await renderInBrowser(StatementAnimationEditorPanel, {
      props: {
        frames: [{
          duration: 200,
        }],
        showFooter: false,
      },
      global: {
        stubs: globalStubs,
      },
    })

    await expect.element(page.getByRole('button', { name: 'common.confirm' })).not.toBeInTheDocument()
  })

  it('抽屉场景下响应撤销、重做与删除帧快捷键', async () => {
    const { frames } = await renderShortcutHarness({ enableHistoryShortcuts: true, isModalOpen: false })

    await page.getByRole('button', { name: 'select-frame-2' }).click()
    await nextTick()

    globalThis.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete' }))
    await vi.waitFor(() => {
      expect(frames).toHaveLength(1)
    })

    globalThis.dispatchEvent(new KeyboardEvent('keydown', { ctrlKey: true, key: 'z' }))
    await vi.waitFor(() => {
      expect(frames).toHaveLength(2)
    })

    globalThis.dispatchEvent(new KeyboardEvent('keydown', { ctrlKey: true, shiftKey: true, key: 'Z' }))
    await vi.waitFor(() => {
      expect(frames).toHaveLength(1)
    })
  })

  it('模态框宿主没有撤销体系时只响应删除帧快捷键', async () => {
    const { frames } = await renderShortcutHarness({ enableHistoryShortcuts: false, isModalOpen: true })

    const handled: boolean[] = []
    globalThis.addEventListener('keydown', (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === 'z') {
        handled.push(event.defaultPrevented)
      }
    })

    await page.getByRole('button', { name: 'select-frame-2' }).click()
    await nextTick()

    globalThis.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete' }))
    await vi.waitFor(() => {
      expect(frames).toHaveLength(1)
    })

    globalThis.dispatchEvent(new KeyboardEvent('keydown', { ctrlKey: true, key: 'z' }))
    globalThis.dispatchEvent(new KeyboardEvent('keydown', { ctrlKey: true, shiftKey: true, key: 'Z' }))

    // 模态框宿主自己没有撤销体系，面板不应单独接管这两个键
    expect(handled).toEqual([false, false])
    expect(frames).toHaveLength(1)
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

    await renderInBrowser(StatementAnimationEditorPanel, {
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
