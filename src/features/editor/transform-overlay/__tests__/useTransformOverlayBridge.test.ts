import '~/__tests__/setup'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, reactive } from 'vue'
import { commandType } from 'webgal-parser/src/interface/sceneInterface'

import { useTransformOverlayBridge } from '../useTransformOverlayBridge'

import type { EffectScope } from 'vue'
import type { EffectEditorProvider, EffectEditorSession } from '~/features/editor/effect-editor/useEffectEditorProvider'
import type { ReferenceBoxQueryResultPayload } from '~/types/editorPreviewProtocol'

const previewSyncStore = vi.hoisted(() => ({
  isPreviewReady: true,
  queryReferenceBox: vi.fn<(target: string) => Promise<ReferenceBoxQueryResultPayload>>(),
}))

vi.mock('~/stores/preview-sync', () => ({
  usePreviewSyncStore: () => previewSyncStore,
}))

function createSession(options: {
  baselineResolved?: boolean
} = {}): EffectEditorSession {
  return reactive({
    sessionId: 1,
    command: commandType.changeFigure,
    effectTarget: 'fig-center',
    scenePath: 'scene/start.txt',
    sentenceId: 3,
    lineCommandString: 'changeFigure:figure.png;',
    draft: {
      duration: '',
      ease: '',
      transform: {},
    },
    initialDraft: {
      duration: '',
      ease: '',
      transform: {},
    },
    baseDraft: {
      duration: '',
      ease: '',
      transform: {},
    },
    dirty: false,
    hasApplied: false,
    missingTargetWarned: false,
    baselineResolved: options.baselineResolved ?? true,
    baselineSource: 'unknown',
    writeDefault: false,
    onApply() { /* no-op */ },
  }) as EffectEditorSession
}

function createProvider(session: EffectEditorSession | undefined): EffectEditorProvider {
  return {
    get isOpen() {
      return Boolean(session)
    },
    get session() {
      return session
    },
    get canApply() {
      return false
    },
    get canReset() {
      return false
    },
    open: vi.fn(),
    close: vi.fn(),
    apply: vi.fn(),
    cancelPreview: vi.fn(),
    updateDraft: vi.fn((patch, _options) => {
      if (!session) {
        return
      }
      if (patch.transform) {
        session.draft.transform = patch.transform
      }
    }),
    updatePreviewTransform: vi.fn(),
    resetToInitialDraft: vi.fn(),
    requestPreview: vi.fn(),
  } as unknown as EffectEditorProvider
}

let scope: EffectScope | undefined

function createBridge(options: Parameters<typeof useTransformOverlayBridge>[0]): ReturnType<typeof useTransformOverlayBridge> {
  scope?.stop()
  scope = effectScope()
  return scope.run(() => useTransformOverlayBridge(options))!
}

describe('useTransformOverlayBridge', () => {
  beforeEach(() => {
    previewSyncStore.isPreviewReady = true
    previewSyncStore.queryReferenceBox.mockReset()
    vi.useRealTimers()
  })

  afterEach(() => {
    scope?.stop()
    scope = undefined
    vi.useRealTimers()
  })

  it('引用框不可用时不会显示变换控件', async () => {
    previewSyncStore.queryReferenceBox.mockResolvedValueOnce({
      target: 'fig-center',
      status: 'missing',
    })

    const bridge = createBridge({
      provider: createProvider(createSession()),
    })

    await vi.waitFor(() => {
      expect(previewSyncStore.queryReferenceBox).toHaveBeenCalledWith('fig-center')
    })

    expect(bridge.referenceBox.value).toBeUndefined()
    expect(bridge.enabled.value).toBe(false)
  })

  it('预览未就绪时不会查询引用框', () => {
    previewSyncStore.isPreviewReady = false

    const bridge = createBridge({
      provider: createProvider(createSession()),
    })

    expect(previewSyncStore.queryReferenceBox).not.toHaveBeenCalled()
    expect(bridge.referenceBox.value).toBeUndefined()
    expect(bridge.enabled.value).toBe(false)
  })

  it('基线解析完成前不会显示变换控件', async () => {
    previewSyncStore.queryReferenceBox.mockResolvedValueOnce({
      target: 'fig-center',
      status: 'ready',
      box: {
        originX: 640,
        originY: 360,
        width: 200,
        height: 100,
        anchorX: 0.5,
        anchorY: 0.5,
        stageWidth: 1280,
        stageHeight: 720,
      },
    })

    const session = createSession({ baselineResolved: false })
    const bridge = createBridge({
      provider: createProvider(session),
    })

    expect(bridge.displayTransform.value).toBeDefined()
    expect(previewSyncStore.queryReferenceBox).not.toHaveBeenCalled()
    expect(bridge.referenceBox.value).toBeUndefined()
    expect(bridge.enabled.value).toBe(false)

    session.baselineResolved = true
    await vi.waitFor(() => {
      expect(bridge.referenceBox.value).toBeDefined()
    })

    expect(bridge.enabled.value).toBe(true)
  })

  it('拖拽中的显示变换只更新交互态和预览覆盖，不写入响应式 draft', () => {
    const provider = createProvider(createSession())
    const bridge = createBridge({
      provider,
    })
    const firstDisplayTransform = {
      position: { x: 24, y: 12 },
      scale: { x: 1, y: 1 },
      rotation: 0,
    }
    const nextDisplayTransform = {
      position: { x: 48, y: 24 },
      scale: { x: 1, y: 1 },
      rotation: 0,
    }

    bridge.updateDisplayTransform(firstDisplayTransform)
    bridge.updateDisplayTransform(nextDisplayTransform)

    const previewTransformArg: unknown = vi.mocked(provider.updatePreviewTransform).mock.calls.at(-1)?.[0]
    expect(provider.updateDraft).not.toHaveBeenCalled()
    expect(bridge.displayTransform.value).toEqual(nextDisplayTransform)
    expect(typeof previewTransformArg).toBe('function')
    expect((previewTransformArg as () => unknown)()).toEqual({
      position: { x: 48, y: 24 },
    })
    expect(provider.requestPreview).toHaveBeenCalledWith({
      flush: undefined,
      schedule: 'frame',
    })
  })

  it('拖拽中的表单显示变换会节流到最新值但不延迟浮层显示', () => {
    vi.useFakeTimers()

    const provider = createProvider(createSession())
    const bridge = createBridge({
      provider,
    })
    const firstDisplayTransform = {
      position: { x: 24, y: 12 },
      scale: { x: 1, y: 1 },
      rotation: 0,
    }
    const nextDisplayTransform = {
      position: { x: 48, y: 24 },
      scale: { x: 1, y: 1 },
      rotation: 0,
    }

    bridge.updateDisplayTransform(firstDisplayTransform)

    expect(bridge.displayTransform.value).toEqual(firstDisplayTransform)
    expect(bridge.formDisplayTransform.value).toEqual(firstDisplayTransform)

    bridge.updateDisplayTransform(nextDisplayTransform)

    expect(bridge.displayTransform.value).toEqual(nextDisplayTransform)
    expect(bridge.formDisplayTransform.value).toEqual(firstDisplayTransform)

    vi.advanceTimersByTime(32)

    expect(bridge.formDisplayTransform.value).toEqual(nextDisplayTransform)
  })

  it('拖拽提交会立即刷新表单显示并丢弃待处理的节流值', () => {
    vi.useFakeTimers()

    const provider = createProvider(createSession())
    const bridge = createBridge({
      provider,
    })
    const firstDisplayTransform = {
      position: { x: 24, y: 12 },
      scale: { x: 1, y: 1 },
      rotation: 0,
    }
    const pendingDisplayTransform = {
      position: { x: 48, y: 24 },
      scale: { x: 1, y: 1 },
      rotation: 0,
    }
    const finalDisplayTransform = {
      position: { x: 64, y: 32 },
      scale: { x: 1, y: 1 },
      rotation: 0,
    }

    bridge.updateDisplayTransform(firstDisplayTransform)
    bridge.updateDisplayTransform(pendingDisplayTransform)
    bridge.updateDisplayTransform(finalDisplayTransform, { flush: true })

    expect(bridge.formDisplayTransform.value).toEqual(finalDisplayTransform)

    vi.advanceTimersByTime(32)

    expect(bridge.formDisplayTransform.value).toEqual(finalDisplayTransform)
  })

  it('销毁时会取消待处理的表单显示节流任务', () => {
    vi.useFakeTimers()

    const provider = createProvider(createSession())
    const bridge = createBridge({
      provider,
    })
    const firstDisplayTransform = {
      position: { x: 24, y: 12 },
      scale: { x: 1, y: 1 },
      rotation: 0,
    }
    const nextDisplayTransform = {
      position: { x: 48, y: 24 },
      scale: { x: 1, y: 1 },
      rotation: 0,
    }

    bridge.updateDisplayTransform(firstDisplayTransform)
    bridge.updateDisplayTransform(nextDisplayTransform)

    scope?.stop()
    scope = undefined
    vi.advanceTimersByTime(32)

    expect(bridge.formDisplayTransform.value).toBeUndefined()
  })

  it('拖拽提交时才写入正式草稿并清理交互态', () => {
    const provider = createProvider(createSession())
    const bridge = createBridge({
      provider,
    })
    const nextDisplayTransform = {
      position: { x: 24, y: 12 },
      scale: { x: 1, y: 1 },
      rotation: 0,
    }

    bridge.updateDisplayTransform(nextDisplayTransform)
    bridge.updateDisplayTransform(nextDisplayTransform, { flush: true })

    expect(provider.updateDraft).toHaveBeenCalledTimes(1)
    expect(provider.updateDraft).toHaveBeenLastCalledWith(
      { transform: { position: { x: 24, y: 12 } } },
      { deferAutoApply: false },
    )
    expect(bridge.displayTransform.value).toEqual(nextDisplayTransform)
    expect(provider.updatePreviewTransform).toHaveBeenLastCalledWith({
      position: { x: 24, y: 12 },
    })
    expect(provider.requestPreview).toHaveBeenLastCalledWith({
      flush: true,
      schedule: 'immediate',
    })
  })

  it('取消拖拽会清理交互态并请求恢复预览场景', () => {
    const provider = createProvider(createSession())
    const bridge = createBridge({
      provider,
    })
    const nextDisplayTransform = {
      position: { x: 24, y: 12 },
      scale: { x: 1, y: 1 },
      rotation: 0,
    }

    bridge.updateDisplayTransform(nextDisplayTransform)
    expect(bridge.displayTransform.value).toEqual(nextDisplayTransform)

    bridge.cancelDisplayTransform()

    expect(bridge.displayTransform.value).toEqual({
      position: { x: 0, y: 0 },
      scale: { x: 1, y: 1 },
      rotation: 0,
    })
    expect(provider.cancelPreview).toHaveBeenCalledOnce()
  })

  it('没有会话时取消拖拽不会请求恢复预览场景', () => {
    const provider = createProvider(undefined)
    const bridge = createBridge({
      provider,
    })

    bridge.cancelDisplayTransform()

    expect(provider.cancelPreview).not.toHaveBeenCalled()
  })

  it('右侧表单更新会写入草稿和预览覆盖，但不重复调度预览', () => {
    const provider = createProvider(createSession())
    const bridge = createBridge({
      provider,
    })

    bridge.handlePanelTransformUpdate({
      value: {
        alpha: 0.8,
        position: { x: 32, y: 16 },
      },
      deferAutoApply: true,
      flush: false,
    })

    expect(provider.updateDraft).toHaveBeenCalledWith(
      {
        transform: {
          alpha: 0.8,
          position: { x: 32, y: 16 },
        },
      },
      { deferAutoApply: true },
    )
    expect(provider.updatePreviewTransform).toHaveBeenCalledWith({
      alpha: 0.8,
      position: { x: 32, y: 16 },
    })
    expect(provider.requestPreview).not.toHaveBeenCalled()
  })
})
