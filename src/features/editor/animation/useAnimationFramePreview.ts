import { computed, reactive, toValue, watch } from 'vue'
import { commandType } from 'webgal-parser/src/interface/sceneInterface'

import { cloneAnimationFrame } from '~/domain/stage/animation-frame'
import { resolveAnimationFramePreviewNotice } from '~/features/editor/animation/useAnimationFramePreviewNotice'
import { resolveTransformBaselineSession } from '~/features/editor/transform-resolution/baseline-session'
import { debugCommander } from '~/services/debug-commander'
import { useEditSettingsStore } from '~/stores/edit-settings'
import { isEditableEditor, useEditorStore } from '~/stores/editor'
import { usePreferenceStore } from '~/stores/preference'
import { usePreviewSyncStore } from '~/stores/preview-sync'

import type { MaybeRefOrGetter } from 'vue'
import type { EngineRuntimeCapabilities } from '~/domain/engine/runtime-capabilities'
import type { TransformWriteMode } from '~/domain/engine/transform-args'
import type { AnimationFrame, Transform } from '~/domain/stage/types'
import type { TransformOverlaySession } from '~/features/editor/transform-overlay/provider'
import type {
  TransformBaselineSessionClient,
} from '~/features/editor/transform-resolution/baseline-session'
import type { TransformBaselineSource } from '~/features/editor/transform-resolution/model'
import type { JsonValue } from '~/types/editorPreviewProtocol'

export type AnimationFramePreviewNotice =
  | 'baseline-unavailable'
  | 'engine-unsupported'
  | 'live-preview-disabled'
  | 'preview-unavailable'
  | 'seek-failed'
  | 'v2-overrides'

export interface AnimationFramePreviewContext {
  command: commandType
  hasAnimationOverrides: boolean
  lineCommandString: string
  runtimeCapabilities: EngineRuntimeCapabilities
  scenePath: string
  sentenceId: number
  target: string
  writeMode: TransformWriteMode
}

interface UseAnimationFramePreviewOptions {
  baselineClient?: TransformBaselineSessionClient
  commitSelectedFrameTransform: (transform: Transform) => void
  /** 编辑文档的宿主的保存链路会自行重放场景；草稿宿主必须始终恢复，不能把恢复让给保存 */
  deferRestoreToAutoSave?: boolean
  context: MaybeRefOrGetter<AnimationFramePreviewContext | undefined>
  frames: MaybeRefOrGetter<readonly AnimationFrame[]>
  getRestoreLineCommandString: () => string
  isOpen: MaybeRefOrGetter<boolean>
  selectedFrameDuration: MaybeRefOrGetter<number | undefined>
  selectedFrameIndex: MaybeRefOrGetter<number>
  selectedFrameTime: MaybeRefOrGetter<number | undefined>
  selectedFrameTransform: MaybeRefOrGetter<Transform | undefined>
  sessionId: MaybeRefOrGetter<number>
}

function cloneTransform(transform: Transform | undefined): Transform {
  return structuredClone(toRaw(transform ?? {}))
}

function createFrameWithTransform(
  frame: AnimationFrame,
  transform: Transform,
  duration: number | undefined,
): AnimationFrame {
  const frameSnapshot = cloneAnimationFrame(frame)
  return {
    duration: duration ?? frameSnapshot.duration,
    ...(frameSnapshot.ease === undefined ? {} : { ease: frameSnapshot.ease }),
    ...cloneTransform(transform),
  }
}

function toJsonValue(value: unknown): JsonValue {
  return structuredClone(toRaw(value)) as JsonValue
}

function requestFrame(callback: () => void): () => void {
  if (typeof globalThis.requestAnimationFrame === 'function') {
    const frameId = globalThis.requestAnimationFrame(callback)
    return () => globalThis.cancelAnimationFrame(frameId)
  }

  const timeoutId = setTimeout(callback, 0)
  return () => clearTimeout(timeoutId)
}

/**
 * 动画帧级预览会话：建立语句前基线、把选中帧 seek 到预览、承接浮层拖拽写回。
 * 只在抽屉宿主启用；模态框没有可交互的预览面。
 */
export function useAnimationFramePreview(options: UseAnimationFramePreviewOptions) {
  const editSettings = useEditSettingsStore()
  const editorStore = useEditorStore()
  const preferenceStore = usePreferenceStore()
  const previewSyncStore = usePreviewSyncStore()
  const baselineClient = options.baselineClient ?? {
    queryBaseTransform: previewSyncStore.queryBaseTransform,
    queryTransformBaseline: previewSyncStore.queryTransformBaseline,
    syncScene: debugCommander.syncScene,
  }
  let baselineResolved = $ref(false)
  let baselineSource = $ref<TransformBaselineSource>('unknown')
  let baselineTransform = $ref<Transform>()
  let seekFailed = $ref(false)
  let resolutionRevision = 0
  let cancelScheduledFrame: (() => void) | undefined
  let seekTask: Promise<void> | undefined
  let seekPending = false
  let touchedPreview = false
  let hasPreviewTransform = false
  let previewTransform: Transform | undefined
  let previewTransformFactory: (() => Transform) | undefined

  const isOpen = computed(() => toValue(options.isOpen))
  const context = computed(() => toValue(options.context))
  const frames = computed(() => toValue(options.frames))
  const selectedFrameDuration = computed(() => toValue(options.selectedFrameDuration))
  const selectedFrameIndex = computed(() => toValue(options.selectedFrameIndex))
  const selectedFrameTime = computed(() => toValue(options.selectedFrameTime))
  const selectedFrameTransform = computed(() => toValue(options.selectedFrameTransform) ?? {})
  const hasFrame = computed(() => (
    selectedFrameIndex.value >= 0
    && selectedFrameTime.value !== undefined
  ))
  const hasAnimationOverrides = computed(() => context.value?.hasAnimationOverrides === true)
  const engineSupportsSeek = computed(() => context.value?.runtimeCapabilities.seekAnimation === true)
  const target = computed(() => context.value?.target.trim() ?? '')
  const baselineReady = computed(() => (
    baselineResolved
    && baselineSource !== 'unknown'
  ))
  const canUseFramePreview = computed(() => (
    isOpen.value
    && Boolean(context.value)
    && target.value !== ''
    && hasFrame.value
    && !hasAnimationOverrides.value
    && engineSupportsSeek.value
    && editSettings.enableLivePreview
    && previewSyncStore.isPreviewReady
  ))

  const session = computed<TransformOverlaySession | undefined>(() => {
    if (!isOpen.value) {
      return
    }

    return {
      baselineResolved: baselineReady.value,
      baselineSource,
      baselineTransform,
      draft: {
        transform: selectedFrameTransform.value,
      },
      effectTarget: canUseFramePreview.value && baselineReady.value ? target.value : '',
      sessionId: toValue(options.sessionId),
    }
  })

  // 预览面板关闭时用户没有帧预览意图，不展示任何帧预览降级提示。
  const notice = computed(() => resolveAnimationFramePreviewNotice({
    baselineResolved,
    baselineSource,
    context: context.value,
    enableLivePreview: editSettings.enableLivePreview,
    hasFrame: hasFrame.value,
    isOpen: isOpen.value,
    previewReady: previewSyncStore.isPreviewReady,
    seekFailed,
    showPreviewPanel: preferenceStore.showPreviewPanel,
  }))

  const canSeek = computed(() => (
    canUseFramePreview.value
    && baselineReady.value
    && !seekFailed
  ))

  function cancelScheduledSeek(): void {
    cancelScheduledFrame?.()
    cancelScheduledFrame = undefined
  }

  function clearPreviewTransform(): void {
    hasPreviewTransform = false
    previewTransform = undefined
    previewTransformFactory = undefined
  }

  function resolvePreviewTransform(): Transform | undefined {
    if (!hasPreviewTransform) {
      return
    }
    return previewTransformFactory ? previewTransformFactory() : previewTransform
  }

  function resetBaseline(): void {
    baselineResolved = false
    baselineSource = 'unknown'
    baselineTransform = undefined
  }

  function buildFrames(): AnimationFrame[] {
    const frameIndex = selectedFrameIndex.value
    const transform = resolvePreviewTransform() ?? selectedFrameTransform.value

    // 只发送到选中帧为止：同一时间戳上的后续跳变帧会让引擎采到后一帧，
    // 而帧级预览的语义是“选中帧自身走完 duration 后的状态”。
    return frames.value.slice(0, frameIndex + 1).map((frame, index) => (
      index === frameIndex
        ? createFrameWithTransform(frame, transform, selectedFrameDuration.value)
        : cloneAnimationFrame(frame)
    ))
  }

  function scheduleSeek(): void {
    if (!canSeek.value) {
      return
    }

    cancelScheduledSeek()
    cancelScheduledFrame = requestFrame(() => {
      cancelScheduledFrame = undefined
      flushSeek()
    })
  }

  function flushSeek(): void {
    if (seekTask) {
      seekPending = true
      return
    }

    seekTask = runSeekLoop().finally(() => {
      seekTask = undefined
    })
  }

  async function runSeekLoop(): Promise<void> {
    do {
      seekPending = false
      const currentContext = context.value
      const currentTime = selectedFrameTime.value
      if (!canSeek.value || !currentContext || currentTime === undefined) {
        return
      }

      const animation = toJsonValue(buildFrames())
      const seekOptions = currentContext.writeMode.writeDefault
        ? { baseTransform: {} }
        : {}

      touchedPreview = true
      try {
        // eslint-disable-next-line no-await-in-loop -- seek 必须按发送顺序执行，latest-only 由 pending 重跑实现
        await debugCommander.seekAnimation(target.value, animation, currentTime, seekOptions)
      } catch (error) {
        seekFailed = true
        logger.warn(`动画帧预览 seek 失败: ${String(error)}`)
        return
      }
    } while (seekPending)
  }

  async function resolveBaseline(): Promise<void> {
    const revision = ++resolutionRevision
    resetBaseline()
    seekFailed = false

    const currentContext = context.value
    if (!canUseFramePreview.value || !currentContext) {
      return
    }

    touchedPreview = true

    try {
      const result = await resolveTransformBaselineSession({
        client: baselineClient,
        request: {
          command: currentContext.command,
          lineCommandString: currentContext.lineCommandString,
          scenePath: currentContext.scenePath,
          sentenceId: currentContext.sentenceId,
          target: target.value,
          writeMode: currentContext.writeMode,
        },
      })

      if (revision !== resolutionRevision) {
        return
      }

      baselineSource = result.baselineSource
      baselineTransform = result.baselineTransform
    } catch (error) {
      if (revision !== resolutionRevision) {
        return
      }

      logger.warn(`解析动画帧预览基线失败，已降级为 unknown: ${String(error)}`)
    } finally {
      if (revision === resolutionRevision) {
        baselineResolved = true
        scheduleSeek()
      }
    }
  }

  function startSession(): void {
    clearPreviewTransform()
    cancelScheduledSeek()
    void resolveBaseline()
  }

  // 保存完成时编辑器会发一次 sync；动画会话再发恢复会重播两次，交给保存管线接管。
  function defersRestoreToAutoSave(currentContext: AnimationFramePreviewContext): boolean {
    const state = editorStore.currentState
    return editSettings.autoSave
      && editSettings.enableLivePreview
      && state !== undefined
      && isEditableEditor(state)
      && state.path === currentContext.scenePath
      && state.isDirty
  }

  async function closeSession(): Promise<void> {
    resolutionRevision++
    cancelScheduledSeek()
    clearPreviewTransform()
    resetBaseline()

    // seek 已经发出但尚未完成时，恢复 sync 必须排在它之后，否则会被迟到的 seek 覆盖。
    await seekTask

    const currentContext = context.value
    const shouldRestore = touchedPreview
    touchedPreview = false
    const shouldDefer = options.deferRestoreToAutoSave !== false
      && currentContext !== undefined
      && defersRestoreToAutoSave(currentContext)
    if (
      !shouldRestore
      || !currentContext
      || !previewSyncStore.isPreviewReady
      || shouldDefer
    ) {
      return
    }

    // 抽屉可能因为切换标签页/选中语句而关闭：此时预览已经属于新的上下文，不能再把它拉回旧场景
    const activeState = editorStore.currentState
    if (
      !activeState
      || !isEditableEditor(activeState)
      || activeState.path !== currentContext.scenePath
    ) {
      return
    }

    const lineCommandString = options.getRestoreLineCommandString()
    void debugCommander.syncScene(
      currentContext.scenePath,
      currentContext.sentenceId,
      lineCommandString,
      { force: true },
    ).catch((error: unknown) => {
      logger.warn(`恢复动画预览真实状态失败: ${String(error)}`)
    })
  }

  function updateDraft(patch: { transform: Transform }): void {
    if (!isOpen.value) {
      return
    }

    clearPreviewTransform()
    seekFailed = false
    options.commitSelectedFrameTransform(cloneTransform(patch.transform))
    scheduleSeek()
  }

  function updatePreviewTransform(transform: Transform | (() => Transform)): void {
    seekFailed = false
    hasPreviewTransform = true
    if (typeof transform === 'function') {
      previewTransform = undefined
      previewTransformFactory = transform
    } else {
      previewTransform = cloneTransform(transform)
      previewTransformFactory = undefined
    }
    scheduleSeek()
  }

  function requestPreview(): void {
    seekFailed = false
    scheduleSeek()
  }

  function cancelPreview(): void {
    clearPreviewTransform()
    seekFailed = false
    scheduleSeek()
  }

  watch(
    [isOpen, () => toValue(options.sessionId)],
    ([open, sessionId], [wasOpen, previousSessionId]) => {
      if (!open) {
        if (wasOpen) {
          void closeSession()
        }
        return
      }

      if (!wasOpen || previousSessionId !== sessionId) {
        startSession()
      }
    },
    // 引用动画面板随抽屉打开才挂载：创建时已是打开态，必须立即开始会话
    { immediate: true },
  )

  watch(
    () => previewSyncStore.isPreviewReady,
    (isReady, wasReady) => {
      if (!isOpen.value || isReady === wasReady) {
        return
      }

      if (!isReady) {
        resolutionRevision++
        resetBaseline()
        seekFailed = false
        cancelScheduledSeek()
        return
      }

      void resolveBaseline()
    },
  )

  watch(
    () => previewSyncStore.stageSnapshot,
    () => {
      if (isOpen.value) {
        // 场景重放（例如保存后的 sync）后允许重试失败的 seek
        seekFailed = false
        scheduleSeek()
      }
    },
  )

  watch(
    () => toValue(options.selectedFrameIndex),
    () => {
      clearPreviewTransform()
      seekFailed = false
      scheduleSeek()
    },
  )

  watch(hasFrame, (hasCurrentFrame) => {
    if (!isOpen.value) {
      return
    }

    if (!hasCurrentFrame) {
      resolutionRevision++
      cancelScheduledSeek()
      clearPreviewTransform()
      resetBaseline()
      seekFailed = false
      return
    }

    if (!baselineReady.value) {
      void resolveBaseline()
    }
  })

  watch(
    [
      () => toValue(options.selectedFrameDuration),
      () => toValue(options.selectedFrameTime),
      () => toValue(options.selectedFrameTransform),
      frames,
    ],
    () => {
      // 表单改动、撤销或提交已经写回了真实帧数据；继续沿用上一次浮层拖拽的 override
      // 会让预览停留在旧值，而浮层控件已经按新帧移动。
      clearPreviewTransform()
      scheduleSeek()
    },
    { deep: true },
  )

  tryOnScopeDispose(() => {
    resolutionRevision++
    cancelScheduledSeek()
  })

  return reactive({
    cancelPreview,
    close: closeSession,
    notice,
    requestPreview,
    session,
    updateDraft,
    updatePreviewTransform,
  })
}
