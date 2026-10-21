import { beforeEach, describe, expect, it, vi } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { defineComponent, h, onMounted, ref } from 'vue'
import { commandType } from 'webgal-parser/src/interface/sceneInterface'

import { renderInBrowser } from '~/__tests__/browser-render'
import { LATEST_ENGINE_RUNTIME_CAPABILITIES } from '~/domain/engine/runtime-capabilities'
import { REFERENCED_ANIMATION_PREVIEW_KEY } from '~/features/editor/animation/referenced-animation-editor-context'
import { useShortcutContext } from '~/features/editor/shortcut/useShortcutContext'
import { useShortcutDispatcher } from '~/features/editor/shortcut/useShortcutDispatcher'

import ReferencedAnimationEditorPanel from './ReferencedAnimationEditorPanel.vue'

import type { AnimationFrame } from '~/domain/stage/types'
import type { AnimationFramePreviewContext } from '~/features/editor/animation/useAnimationFramePreview'
import type { TransformOverlayProvider } from '~/features/editor/transform-overlay/provider'

const {
  debugCommanderMock,
  editSettingsState,
  loggerWarnMock,
  preferenceState,
  previewSyncState,
} = vi.hoisted(() => ({
  debugCommanderMock: {
    seekAnimation: vi.fn<
      (target: string, animation: unknown, time: number, options?: unknown) => Promise<void>
    >(async () => undefined),
    syncScene: vi.fn(async () => undefined),
  },
  editSettingsState: {
    autoSave: false,
    enableLivePreview: true,
  },
  loggerWarnMock: vi.fn(),
  preferenceState: {
    showPreviewPanel: true,
  },
  previewSyncState: {
    isPreviewReady: true as boolean,
    queryBaseTransform: vi.fn(),
    queryTransformBaseline: vi.fn(),
    stageSnapshot: undefined as unknown,
  },
}))

vi.mock('~/stores/editor', () => ({
  isEditableEditor: (state: { projection?: string }) => 'projection' in state,
  useEditorStore: () => ({
    currentState: undefined,
  }),
}))

vi.mock('~/services/debug-commander', () => ({
  debugCommander: debugCommanderMock,
}))

vi.mock('~/stores/edit-settings', () => ({
  useEditSettingsStore: () => editSettingsState,
}))

vi.mock('~/stores/preference', () => ({
  usePreferenceStore: () => preferenceState,
}))

vi.mock('~/stores/preview-sync', () => ({
  usePreviewSyncStore: () => previewSyncState,
}))

vi.mock('@tauri-apps/plugin-log', () => ({
  warn: loggerWarnMock,
}))

const AnimationEditorPaneStub = defineComponent({
  name: 'StubAnimationEditorPane',
  props: {
    canRedo: {
      type: Boolean,
      required: false,
    },
    canUndo: {
      type: Boolean,
      required: false,
    },
    keyframes: {
      type: Array,
      required: false,
    },
    selectedFrameId: {
      type: Number,
      required: false,
    },
  },
  emits: ['add-frame', 'delete-frame', 'redo', 'undo'],
  setup(_, { emit }) {
    return () => h('div', { 'data-testid': 'animation-editor-pane' }, [
      h('button', {
        type: 'button',
        onClick: () => emit('undo'),
      }, 'pane-undo'),
      h('button', {
        type: 'button',
        onClick: () => emit('redo'),
      }, 'pane-redo'),
      h('button', {
        type: 'button',
        onClick: () => emit('add-frame'),
      }, 'pane-add-frame'),
      h('button', {
        type: 'button',
        onClick: () => emit('delete-frame'),
      }, 'pane-delete-frame'),
    ])
  },
})

const FRAME_PREVIEW_CONTEXT: AnimationFramePreviewContext = {
  command: commandType.setAnimation,
  hasAnimationOverrides: false,
  lineCommandString: 'setAnimation:walk/fade -target=fig-center;',
  runtimeCapabilities: {
    ...LATEST_ENGINE_RUNTIME_CAPABILITIES,
    seekAnimation: true,
  },
  scenePath: '/games/demo/game/scene/start.txt',
  sentenceId: 7,
  target: 'fig-center',
  writeMode: {
    transformFrom: 'current',
    writeDefault: false,
    writeFullEffect: false,
  },
}

function createFrames(): AnimationFrame[] {
  return [{ duration: 0 }, { duration: 200 }]
}

function createPreviewRegistry() {
  return {
    register: vi.fn<(provider: TransformOverlayProvider) => void>(),
    unregister: vi.fn<(provider: TransformOverlayProvider) => void>(),
  }
}

function createPanelHost(options: {
  framePreview?: AnimationFramePreviewContext
  onUpdateFramePreviewNotice?: (notice: string | undefined) => void
} = {}) {
  const frames = ref<AnimationFrame[]>(createFrames())
  const emitted: AnimationFrame[][] = []
  const Host = defineComponent({
    name: 'ReferencedAnimationPanelHost',
    setup() {
      return () => h(ReferencedAnimationEditorPanel, {
        'framePreview': options.framePreview,
        'frames': frames.value,
        'onUpdate:frames': (next: AnimationFrame[]) => {
          frames.value = next
          emitted.push(next)
        },
        'onUpdate:framePreviewNotice': options.onUpdateFramePreviewNotice,
      })
    },
  })

  return { emitted, frames, Host }
}

async function renderPanelHost(
  host: ReturnType<typeof createPanelHost>,
  options: { registry?: ReturnType<typeof createPreviewRegistry> } = {},
) {
  await renderInBrowser(host.Host, {
    global: {
      provide: options.registry
        ? { [REFERENCED_ANIMATION_PREVIEW_KEY as symbol]: options.registry }
        : undefined,
      stubs: {
        AnimationEditorPane: AnimationEditorPaneStub,
      },
    },
  })
}

const overlayShortcutFallback = vi.fn()

function createShortcutHost(options: { overlay?: boolean } = {}) {
  const frames = ref<AnimationFrame[]>(createFrames())
  const emitted: AnimationFrame[][] = []
  const overlayRef = ref<HTMLButtonElement>()

  const Host = defineComponent({
    name: 'ReferencedPanelShortcutHost',
    setup() {
      useShortcutDispatcher({
        bindings: options.overlay
          ? [{
              allowInEditorDrawer: true,
              execute: overlayShortcutFallback,
              i18nKey: 'shortcut.effect.undo',
              id: 'effect.undo',
              keys: 'Mod+Z',
              when: { panelFocus: 'transformOverlay' },
            }]
          : [],
        executeContext: undefined,
      })

      if (options.overlay) {
        useShortcutContext({ editorDrawerOpen: true })
        useShortcutContext({ panelFocus: 'transformOverlay' }, {
          target: overlayRef,
          trackFocus: true,
        })
        onMounted(() => overlayRef.value?.focus())
      }

      return () => h('div', [
        h(ReferencedAnimationEditorPanel, {
          'framePreview': options.overlay ? FRAME_PREVIEW_CONTEXT : undefined,
          'frames': frames.value,
          'onUpdate:frames': (next: AnimationFrame[]) => {
            frames.value = next
            emitted.push(next)
          },
        }),
        options.overlay
          ? h('button', {
              'ref': overlayRef,
              'data-testid': 'fake-transform-overlay',
              'type': 'button',
            }, 'overlay')
          : undefined,
      ])
    },
  })

  return { emitted, frames, Host }
}

beforeEach(() => {
  vi.clearAllMocks()
  editSettingsState.enableLivePreview = true
  previewSyncState.isPreviewReady = true
  previewSyncState.queryBaseTransform.mockReset()
  previewSyncState.queryBaseTransform.mockResolvedValue({
    status: 'ready',
    transform: { position: { x: 0, y: 0 } },
  })
  previewSyncState.queryTransformBaseline.mockReset()
  previewSyncState.queryTransformBaseline.mockResolvedValue({
    status: 'ready',
    transform: { position: { x: 100, y: 0 } },
  })
  debugCommanderMock.seekAnimation.mockClear()
  debugCommanderMock.syncScene.mockClear()
})

describe('ReferencedAnimationEditorPanel', () => {
  it('帧操作与撤销重做都只改草稿，不写文档', async () => {
    const host = createPanelHost()
    await renderPanelHost(host)

    await page.getByRole('button', { name: 'pane-add-frame' }).click()
    expect(host.emitted.at(-1)).toHaveLength(3)
    expect(host.emitted.at(-1)?.[2]).toEqual(expect.objectContaining({ duration: 500 }))

    await page.getByRole('button', { name: 'pane-undo' }).click()
    expect(host.emitted.at(-1)).toEqual(createFrames())

    await page.getByRole('button', { name: 'pane-redo' }).click()
    expect(host.emitted.at(-1)).toHaveLength(3)
  })

  it('沿用语句上下文把选中帧 seek 到预览，浮层拖拽写回草稿当前帧', async () => {
    const registry = createPreviewRegistry()
    const host = createPanelHost({
      framePreview: FRAME_PREVIEW_CONTEXT,
    })
    await renderPanelHost(host, { registry })

    await vi.waitFor(() => {
      expect(debugCommanderMock.seekAnimation).toHaveBeenCalled()
    })

    const seekCall = debugCommanderMock.seekAnimation.mock.calls.at(-1)
    expect(seekCall?.[0]).toBe('fig-center')
    expect(seekCall?.[1]).toEqual([{ duration: 0 }, { duration: 200 }])
    expect(seekCall?.[2]).toBe(200)

    expect(registry.register).toHaveBeenCalledTimes(1)
    const provider = registry.register.mock.calls[0]?.[0] as TransformOverlayProvider

    await vi.waitFor(() => {
      expect(provider.session?.effectTarget).toBe('fig-center')
    })

    provider.updateDraft({ transform: { position: { x: 42 } } })

    expect(host.emitted.at(-1)?.[1]).toEqual(expect.objectContaining({
      duration: 200,
      position: { x: 42 },
    }))
  })

  it('预览不可用时通过模型把降级原因交给抽屉头部', async () => {
    editSettingsState.enableLivePreview = false
    const onUpdateFramePreviewNotice = vi.fn()
    const host = createPanelHost({
      framePreview: FRAME_PREVIEW_CONTEXT,
      onUpdateFramePreviewNotice,
    })
    await renderPanelHost(host)

    await vi.waitFor(() => {
      expect(onUpdateFramePreviewNotice).toHaveBeenCalledWith(
        'edit.visualEditor.animation.framePreview.livePreviewDisabled',
      )
    })
  })

  it('编辑面获得焦点时响应撤销、重做与翻转快捷键', async () => {
    const host = createShortcutHost()
    await renderInBrowser(host.Host, {
      global: {
        stubs: {
          AnimationEditorPane: AnimationEditorPaneStub,
        },
      },
    })

    // 测试 iframe 不会像真实窗口那样自动获得焦点，手动聚焦以模拟抽屉内编辑面
    const panel = document.querySelector<HTMLElement>('[data-testid="referenced-animation-editor-panel"]')
    panel?.focus()
    expect(document.activeElement).toBe(panel)

    await userEvent.keyboard('{Shift>}H{/Shift}')
    await vi.waitFor(() => {
      expect(host.emitted.at(-1)?.[1]).toEqual(expect.objectContaining({
        scale: { x: -1 },
      }))
    })

    await userEvent.keyboard('{Control>}z{/Control}')
    await vi.waitFor(() => {
      expect(host.emitted.at(-1)).toEqual(createFrames())
    })

    await userEvent.keyboard('{Control>}{Shift>}z{/Shift}{/Control}')
    await vi.waitFor(() => {
      expect(host.emitted.at(-1)?.[1]).toEqual(expect.objectContaining({
        scale: { x: -1 },
      }))
    })
  })

  it('浮层拖拽后焦点在预览控件时仍响应撤销、重做与翻转快捷键', async () => {
    const host = createShortcutHost({ overlay: true })
    await renderInBrowser(host.Host, {
      global: {
        stubs: {
          AnimationEditorPane: AnimationEditorPaneStub,
        },
      },
    })

    // 测试 iframe 不会像真实窗口那样自动获得焦点，手动聚焦以模拟浮层拖拽后的焦点
    const overlay = document.querySelector<HTMLElement>('[data-testid="fake-transform-overlay"]')
    overlay?.focus()
    expect(document.activeElement).toBe(overlay)

    await userEvent.keyboard('{Shift>}H{/Shift}')
    await vi.waitFor(() => {
      expect(host.emitted.at(-1)?.[1]).toEqual(expect.objectContaining({
        scale: { x: -1 },
      }))
    })

    await userEvent.keyboard('{Control>}z{/Control}')
    await vi.waitFor(() => {
      expect(host.emitted.at(-1)).toEqual(createFrames())
    })
    expect(overlayShortcutFallback).not.toHaveBeenCalled()

    await userEvent.keyboard('{Control>}{Shift>}z{/Shift}{/Control}')
    await vi.waitFor(() => {
      expect(host.emitted.at(-1)?.[1]).toEqual(expect.objectContaining({
        scale: { x: -1 },
      }))
    })
  })

  it('面板注册动画文件焦点上下文并暴露测试锚点', async () => {
    const registry = createPreviewRegistry()
    const host = createPanelHost()
    await renderPanelHost(host, { registry })

    const panel = document.querySelector('[data-testid="referenced-animation-editor-panel"]')
    expect(panel).not.toBeNull()
    expect(panel?.getAttribute('tabindex')).toBe('-1')
    expect(registry.register).toHaveBeenCalledTimes(1)
  })
})
