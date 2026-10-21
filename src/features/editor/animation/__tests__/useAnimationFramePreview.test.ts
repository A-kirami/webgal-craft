import { afterEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, reactive, ref } from 'vue'
import { commandType } from 'webgal-parser/src/interface/sceneInterface'

import { LATEST_ENGINE_RUNTIME_CAPABILITIES } from '~/domain/engine/runtime-capabilities'
import { useAnimationFramePreview } from '~/features/editor/animation/useAnimationFramePreview'

import type { EffectScope } from 'vue'
import type { TransformWriteMode } from '~/domain/engine/transform-args'
import type { AnimationFrame, Transform } from '~/domain/stage/types'
import type {
  BaseTransformQueryResult,
  TransformBaselineQueryResult,
} from '~/features/editor/transform-resolution/baseline-session'

const { debugCommanderMock, loggerWarnMock } = vi.hoisted(() => ({
  debugCommanderMock: {
    seekAnimation: vi.fn(async (..._args: unknown[]) => undefined),
    syncScene: vi.fn(async (..._args: unknown[]) => undefined),
  },
  loggerWarnMock: vi.fn(),
}))

vi.mock('@tauri-apps/plugin-log', () => ({
  warn: loggerWarnMock,
}))

vi.mock('~/services/debug-commander', () => ({
  debugCommander: debugCommanderMock,
}))

const previewSyncStore = reactive<{
  isPreviewReady: boolean
  stageSnapshot?: {
    sceneName: string
    sentenceId: number
    stageState: Record<string, never>
  }
}>({
  isPreviewReady: true,
  stageSnapshot: undefined,
})

const editSettings = reactive({
  autoSave: true,
  enableLivePreview: true,
})

const editorStore = reactive<{
  currentState?: {
    isDirty: boolean
    kind: 'scene'
    lastSavedTime?: Date
    path: string
    projection: 'visual'
  }
}>({
  currentState: undefined,
})

const preferenceStore = reactive({
  showPreviewPanel: true,
})

vi.mock('~/stores/preview-sync', () => ({
  usePreviewSyncStore: () => previewSyncStore,
}))

vi.mock('~/stores/edit-settings', () => ({
  useEditSettingsStore: () => editSettings,
}))

vi.mock('~/stores/editor', () => ({
  isEditableEditor: (state: { projection?: unknown }) => 'projection' in state,
  useEditorStore: () => editorStore,
}))

vi.mock('~/stores/preference', () => ({
  usePreferenceStore: () => preferenceStore,
}))

const CURRENT_WRITE_MODE: TransformWriteMode = {
  transformFrom: 'current',
  writeDefault: false,
  writeFullEffect: false,
}

const BASE_TRANSFORM: Transform = {
  position: { x: 0, y: 20 },
  scale: { x: 1, y: 1 },
}

function createBaselineClient(options: {
  baseTransform?: BaseTransformQueryResult
  transformBaseline?: TransformBaselineQueryResult
} = {}) {
  return {
    queryBaseTransform: vi.fn(async () => options.baseTransform ?? {
      status: 'ready' as const,
      transform: BASE_TRANSFORM,
    }),
    queryTransformBaseline: vi.fn(async () => options.transformBaseline ?? {
      status: 'ready' as const,
      transform: { position: { x: 500 } },
    }),
    syncScene: vi.fn(async () => { /* no-op */ }),
  }
}

interface HarnessOptions {
  baselineClient?: ReturnType<typeof createBaselineClient>
  deferRestoreToAutoSave?: boolean
  frames?: AnimationFrame[]
  hasAnimationOverrides?: boolean
  runtimeCapabilities?: typeof LATEST_ENGINE_RUNTIME_CAPABILITIES
  writeMode?: TransformWriteMode
}

function createHarness(options: HarnessOptions = {}) {
  const scope = effectScope()
  const isOpen = ref(false)
  const frames = ref<AnimationFrame[]>(options.frames ?? [
    { duration: 120, position: { x: 10 } },
    { duration: 180, alpha: 0.5 },
  ])
  const selectedFrameDuration = ref<number>()
  const selectedFrameIndex = ref(0)
  const selectedFrameTime = ref<number | undefined>(120)
  const selectedFrameTransform = ref<Transform>({ position: { x: 10 } })
  const context = ref({
    command: commandType.setTempAnimation,
    hasAnimationOverrides: options.hasAnimationOverrides ?? false,
    lineCommandString: 'setTempAnimation:[{"duration":120}];',
    runtimeCapabilities: options.runtimeCapabilities ?? {
      ...LATEST_ENGINE_RUNTIME_CAPABILITIES,
      seekAnimation: true,
    },
    scenePath: '/game/scene.txt',
    sentenceId: 7,
    target: 'fig-center',
    writeMode: options.writeMode ?? CURRENT_WRITE_MODE,
  })
  const commitSelectedFrameTransform = vi.fn((transform: Transform) => {
    selectedFrameTransform.value = transform
  })
  const baselineClient = options.baselineClient ?? createBaselineClient()
  // 真实编辑器里抽屉打开时当前活动文档就是场景；恢复 sync 只在场景仍活跃时发送
  editorStore.currentState = {
    isDirty: false,
    kind: 'scene',
    path: '/game/scene.txt',
    projection: 'visual',
  }

  const provider = scope.run(() => useAnimationFramePreview({
    baselineClient,
    commitSelectedFrameTransform,
    deferRestoreToAutoSave: options.deferRestoreToAutoSave,
    context,
    frames,
    getRestoreLineCommandString: () => 'setTempAnimation:[{"duration":120,"position":{"x":10}}];',
    isOpen,
    selectedFrameDuration,
    selectedFrameIndex,
    selectedFrameTime,
    selectedFrameTransform,
    sessionId: () => 1,
  }))

  if (!provider) {
    throw new TypeError('expected animation frame preview provider')
  }

  return {
    baselineClient,
    commitSelectedFrameTransform,
    context,
    frames,
    isOpen,
    provider,
    restoreScene: debugCommanderMock.syncScene,
    scope,
    seekAnimation: debugCommanderMock.seekAnimation,
    selectedFrameDuration,
    selectedFrameIndex,
    selectedFrameTime,
    selectedFrameTransform,
  }
}

const scopes: EffectScope[] = []

function createTrackedHarness(options: HarnessOptions = {}) {
  const harness = createHarness(options)
  scopes.push(harness.scope)
  return harness
}

async function openHarness(harness: ReturnType<typeof createHarness>) {
  harness.isOpen.value = true
  await nextTick()
}

function createDeferred<T>(): {
  promise: Promise<T>
  resolve: (value: T) => void
} {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((next) => {
    resolve = next
  })

  return {
    promise,
    resolve,
  }
}

afterEach(() => {
  while (scopes.length > 0) {
    scopes.pop()?.stop()
  }
  previewSyncStore.isPreviewReady = true
  previewSyncStore.stageSnapshot = undefined
  editSettings.autoSave = true
  editSettings.enableLivePreview = true
  editorStore.currentState = undefined
  preferenceStore.showPreviewPanel = true
  debugCommanderMock.seekAnimation.mockClear()
  debugCommanderMock.syncScene.mockClear()
  loggerWarnMock.mockClear()
})

describe('useAnimationFramePreview', () => {
  it('打开后建立语句前基线并把选中帧 seek 到预览', async () => {
    const harness = createTrackedHarness()
    await openHarness(harness)

    await vi.waitFor(() => {
      expect(harness.seekAnimation).toHaveBeenCalledTimes(1)
    })

    expect(harness.baselineClient.queryBaseTransform).toHaveBeenCalledOnce()
    expect(harness.baselineClient.queryTransformBaseline).toHaveBeenCalledWith('fig-center', expect.any(String))
    expect(harness.baselineClient.syncScene).toHaveBeenCalledWith(
      '/game/scene.txt',
      7,
      'setTempAnimation:[{"duration":120}];',
      {
        transformBaselineRevision: expect.any(String),
        settleMode: 'immediate',
      },
    )
    expect(harness.seekAnimation).toHaveBeenCalledWith(
      'fig-center',
      [{ duration: 120, position: { x: 10 } }],
      120,
      {},
    )
    expect(harness.provider.session).toMatchObject({
      baselineResolved: true,
      baselineSource: 'protocol',
      effectTarget: 'fig-center',
    })
    expect(harness.provider.session?.baselineTransform).toEqual({
      position: { x: 500, y: 20 },
      scale: { x: 1, y: 1 },
    })
    expect(harness.provider.notice).toBeUndefined()
  })

  it('同一时间戳上的零时长帧只 seek 到选中帧，避免采到后面的跳变帧', async () => {
    const harness = createTrackedHarness({
      frames: [
        { duration: 0, position: { x: 0 } },
        { duration: 0, position: { x: 500 } },
      ],
    })
    harness.selectedFrameTime.value = 0
    harness.selectedFrameTransform.value = { position: { x: 0 } }
    await openHarness(harness)

    await vi.waitFor(() => {
      expect(harness.seekAnimation).toHaveBeenCalledWith(
        'fig-center',
        [{ duration: 0, position: { x: 0 } }],
        0,
        {},
      )
    })

    harness.selectedFrameIndex.value = 1
    harness.selectedFrameTime.value = 0
    harness.selectedFrameTransform.value = { position: { x: 500 } }
    await nextTick()

    await vi.waitFor(() => {
      expect(harness.seekAnimation).toHaveBeenLastCalledWith(
        'fig-center',
        [
          { duration: 0, position: { x: 0 } },
          { duration: 0, position: { x: 500 } },
        ],
        0,
        {},
      )
    })
  })

  it('帧属性改动会丢弃上一次浮层拖拽的预览覆盖值', async () => {
    const harness = createTrackedHarness()
    await openHarness(harness)
    await vi.waitFor(() => expect(harness.seekAnimation).toHaveBeenCalledTimes(1))

    harness.provider.updatePreviewTransform({ alpha: 0.8 })
    await vi.waitFor(() => {
      expect(harness.seekAnimation).toHaveBeenLastCalledWith(
        'fig-center',
        [{ duration: 120, alpha: 0.8 }],
        120,
        {},
      )
    })

    harness.selectedFrameTransform.value = { alpha: 0.3 }
    await nextTick()

    await vi.waitFor(() => {
      expect(harness.seekAnimation).toHaveBeenLastCalledWith(
        'fig-center',
        [{ duration: 120, alpha: 0.3 }],
        120,
        {},
      )
    })
  })

  it('切换帧和拖动浮层都会按最新时间与显式字段重发 seek', async () => {
    const harness = createTrackedHarness()
    await openHarness(harness)
    await vi.waitFor(() => expect(harness.seekAnimation).toHaveBeenCalledTimes(1))

    harness.selectedFrameIndex.value = 1
    harness.selectedFrameTime.value = 300
    harness.selectedFrameTransform.value = { alpha: 0.5 }
    await nextTick()

    await vi.waitFor(() => {
      expect(harness.seekAnimation).toHaveBeenLastCalledWith(
        'fig-center',
        [
          { duration: 120, position: { x: 10 } },
          { duration: 180, alpha: 0.5 },
        ],
        300,
        {},
      )
    })

    harness.provider.updatePreviewTransform({ alpha: 0.8 })
    await vi.waitFor(() => {
      expect(harness.seekAnimation).toHaveBeenLastCalledWith(
        'fig-center',
        [
          { duration: 120, position: { x: 10 } },
          { duration: 180, alpha: 0.8 },
        ],
        300,
        {},
      )
    })
  })

  it('时长草稿会同时进入 seek 的时间与当前关键帧', async () => {
    const harness = createTrackedHarness()
    await openHarness(harness)
    await vi.waitFor(() => expect(harness.seekAnimation).toHaveBeenCalledTimes(1))

    harness.selectedFrameDuration.value = 200
    harness.selectedFrameTime.value = 200
    await nextTick()

    await vi.waitFor(() => {
      expect(harness.seekAnimation).toHaveBeenLastCalledWith(
        'fig-center',
        [{ duration: 200, position: { x: 10 } }],
        200,
        {},
      )
    })
  })

  it('浮层提交只写回当前帧并继续按新草稿 seek', async () => {
    const harness = createTrackedHarness()
    await openHarness(harness)
    await vi.waitFor(() => expect(harness.seekAnimation).toHaveBeenCalledTimes(1))

    harness.provider.updateDraft({
      transform: { position: { x: 48, y: 24 } },
    })
    harness.provider.updatePreviewTransform({ position: { x: 48, y: 24 } })
    harness.provider.requestPreview()

    expect(harness.commitSelectedFrameTransform).toHaveBeenCalledWith({
      position: { x: 48, y: 24 },
    })

    await vi.waitFor(() => {
      expect(harness.seekAnimation).toHaveBeenLastCalledWith(
        'fig-center',
        [{ duration: 120, position: { x: 48, y: 24 } }],
        120,
        {},
      )
    })
  })

  it('transformFrom=default 时给 seek 传空基准对象', async () => {
    const harness = createTrackedHarness({
      baselineClient: createBaselineClient({
        transformBaseline: { status: 'unavailable' },
      }),
      writeMode: {
        transformFrom: 'default',
        writeDefault: true,
        writeFullEffect: true,
      },
    })
    await openHarness(harness)

    await vi.waitFor(() => {
      expect(harness.seekAnimation).toHaveBeenCalledWith(
        'fig-center',
        expect.any(Array),
        120,
        { baseTransform: {} },
      )
    })
    expect(harness.baselineClient.queryTransformBaseline).not.toHaveBeenCalled()
    expect(harness.provider.session?.baselineSource).toBe('base')
  })

  it('舞台快照变化后会重发当前帧 seek', async () => {
    const harness = createTrackedHarness()
    await openHarness(harness)
    await vi.waitFor(() => expect(harness.seekAnimation).toHaveBeenCalledTimes(1))

    previewSyncStore.stageSnapshot = {
      sceneName: 'scene',
      sentenceId: 7,
      stageState: {},
    }

    await vi.waitFor(() => {
      expect(harness.seekAnimation).toHaveBeenCalledTimes(2)
    })
  })

  it('seek 失败后舞台快照变化会重试并清除失败提示', async () => {
    debugCommanderMock.seekAnimation.mockRejectedValueOnce(new Error('seek failed'))
    const harness = createTrackedHarness()
    await openHarness(harness)

    await vi.waitFor(() => {
      expect(harness.provider.notice).toBe('seek-failed')
    })

    previewSyncStore.stageSnapshot = {
      sceneName: 'scene',
      sentenceId: 7,
      stageState: {},
    }

    await vi.waitFor(() => {
      expect(harness.seekAnimation).toHaveBeenCalledTimes(2)
      expect(harness.provider.notice).toBeUndefined()
    })
  })

  it('场景保存不会额外建立一次 sync，交给编辑器保存管线重放', async () => {
    const harness = createTrackedHarness()
    editorStore.currentState = {
      isDirty: false,
      kind: 'scene',
      lastSavedTime: new Date(1),
      path: '/game/scene.txt',
      projection: 'visual',
    }
    await openHarness(harness)
    await vi.waitFor(() => expect(harness.baselineClient.syncScene).toHaveBeenCalledTimes(1))

    editorStore.currentState.lastSavedTime = new Date(2)
    await nextTick()

    expect(harness.baselineClient.syncScene).toHaveBeenCalledTimes(1)
  })

  it('场景已脏且自动保存开启时，关闭不再重复发送恢复 sync', async () => {
    const harness = createTrackedHarness()
    await openHarness(harness)
    await vi.waitFor(() => expect(harness.seekAnimation).toHaveBeenCalledTimes(1))

    editorStore.currentState = {
      isDirty: true,
      kind: 'scene',
      path: '/game/scene.txt',
      projection: 'visual',
    }
    harness.isOpen.value = false
    await nextTick()

    expect(harness.restoreScene).not.toHaveBeenCalled()
  })

  it('草稿宿主关闭时即使自动保存开启也恢复真实状态', async () => {
    const harness = createTrackedHarness({ deferRestoreToAutoSave: false })
    editSettings.autoSave = true
    await openHarness(harness)
    await vi.waitFor(() => expect(harness.seekAnimation).toHaveBeenCalledTimes(1))

    editorStore.currentState = {
      isDirty: true,
      kind: 'scene',
      path: '/game/scene.txt',
      projection: 'visual',
    }
    harness.isOpen.value = false
    await nextTick()

    await vi.waitFor(() => expect(harness.restoreScene).toHaveBeenCalledOnce())
  })

  it('关闭会话会等待进行中的 seek 完成后才恢复', async () => {
    const deferred = createDeferred<undefined>()
    debugCommanderMock.seekAnimation.mockImplementationOnce(() => deferred.promise)
    const harness = createTrackedHarness()
    await openHarness(harness)
    await vi.waitFor(() => expect(harness.seekAnimation).toHaveBeenCalledOnce())

    harness.isOpen.value = false
    await nextTick()
    expect(harness.restoreScene).not.toHaveBeenCalled()

    deferred.resolve(undefined)
    await vi.waitFor(() => expect(harness.restoreScene).toHaveBeenCalledOnce())
  })

  it('自动保存关闭时，关闭仍立即恢复真实状态', async () => {
    const harness = createTrackedHarness()
    editSettings.autoSave = false
    await openHarness(harness)
    await vi.waitFor(() => expect(harness.seekAnimation).toHaveBeenCalledTimes(1))

    editorStore.currentState = {
      isDirty: true,
      kind: 'scene',
      path: '/game/scene.txt',
      projection: 'visual',
    }
    harness.isOpen.value = false
    await nextTick()

    expect(harness.restoreScene).toHaveBeenCalledOnce()
  })

  it('关闭会话时发送不带修订号的 sync 恢复真实状态', async () => {
    const harness = createTrackedHarness()
    await openHarness(harness)
    await vi.waitFor(() => expect(harness.seekAnimation).toHaveBeenCalledTimes(1))

    harness.isOpen.value = false
    await nextTick()

    await vi.waitFor(() => {
      expect(harness.restoreScene).toHaveBeenCalledWith(
        '/game/scene.txt',
        7,
        'setTempAnimation:[{"duration":120,"position":{"x":10}}];',
        { force: true },
      )
    })
    expect(harness.provider.session).toBeUndefined()
  })

  it('打开时没有帧，添加首帧后会补建基线并 seek', async () => {
    const harness = createTrackedHarness({ frames: [] })
    harness.selectedFrameIndex.value = -1
    harness.selectedFrameTime.value = undefined
    await openHarness(harness)

    expect(harness.baselineClient.syncScene).not.toHaveBeenCalled()
    expect(harness.provider.session?.effectTarget).toBe('')

    harness.frames.value = [{ duration: 120, alpha: 0.5 }]
    harness.selectedFrameIndex.value = 0
    harness.selectedFrameTime.value = 120
    harness.selectedFrameTransform.value = { alpha: 0.5 }
    await nextTick()

    await vi.waitFor(() => {
      expect(harness.seekAnimation).toHaveBeenCalledWith(
        'fig-center',
        [{ duration: 120, alpha: 0.5 }],
        120,
        {},
      )
    })
    expect(harness.provider.session?.effectTarget).toBe('fig-center')
  })

  it('实时预览关闭时禁用浮层并给出提示', async () => {
    editSettings.enableLivePreview = false
    const harness = createTrackedHarness()
    await openHarness(harness)

    expect(harness.provider.notice).toBe('live-preview-disabled')
    expect(harness.provider.session?.effectTarget).toBe('')
    expect(harness.baselineClient.syncScene).not.toHaveBeenCalled()
  })

  it('预览面板关闭时不显示帧预览降级提示', async () => {
    preferenceStore.showPreviewPanel = false
    const harness = createTrackedHarness({
      runtimeCapabilities: {
        ...LATEST_ENGINE_RUNTIME_CAPABILITIES,
        seekAnimation: false,
      },
    })
    await openHarness(harness)

    expect(harness.provider.notice).toBeUndefined()

    preferenceStore.showPreviewPanel = true
    await nextTick()

    expect(harness.provider.notice).toBe('engine-unsupported')
  })

  it('引擎不支持 seek-animation 时给出提示且不建立基线', async () => {
    const harness = createTrackedHarness({
      runtimeCapabilities: {
        ...LATEST_ENGINE_RUNTIME_CAPABILITIES,
        seekAnimation: false,
      },
    })
    await openHarness(harness)

    expect(harness.provider.notice).toBe('engine-unsupported')
    expect(harness.baselineClient.syncScene).not.toHaveBeenCalled()
    expect(harness.seekAnimation).not.toHaveBeenCalled()
  })

  it('基线不可用时给出提示并禁用浮层', async () => {
    const harness = createTrackedHarness({
      baselineClient: createBaselineClient({
        transformBaseline: { status: 'unavailable' },
      }),
    })
    await openHarness(harness)

    await vi.waitFor(() => {
      expect(harness.provider.notice).toBe('baseline-unavailable')
    })
    expect(harness.provider.session?.effectTarget).toBe('')
    expect(harness.seekAnimation).not.toHaveBeenCalled()
  })

  it('带 relative 或 inherit 参数的语句不进入 v1 帧预览', async () => {
    const harness = createTrackedHarness({ hasAnimationOverrides: true })
    await openHarness(harness)

    expect(harness.provider.notice).toBe('v2-overrides')
    expect(harness.baselineClient.syncScene).not.toHaveBeenCalled()
    expect(harness.seekAnimation).not.toHaveBeenCalled()
  })

  it('预览未就绪时给出提示，就绪后自动重建基线', async () => {
    previewSyncStore.isPreviewReady = false
    const harness = createTrackedHarness()
    await openHarness(harness)

    expect(harness.provider.notice).toBe('preview-unavailable')
    expect(harness.baselineClient.syncScene).not.toHaveBeenCalled()

    previewSyncStore.isPreviewReady = true
    await vi.waitFor(() => {
      expect(harness.seekAnimation).toHaveBeenCalledOnce()
    })
  })
})
