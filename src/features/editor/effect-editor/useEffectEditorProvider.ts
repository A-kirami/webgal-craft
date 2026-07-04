import { commandType } from 'webgal-parser/src/interface/sceneInterface'

import { readSentenceArgString } from '~/domain/script/sentence'
import { serializeSentence } from '~/domain/script/serialize'
import { fieldsToTransform, isTransformEqual, parseTransformJson } from '~/features/editor/effect-editor/effect-editor-config'
import { resolveTransformBaselineSession } from '~/features/editor/transform-resolution/baseline-session'
import { debugCommander } from '~/services/debug-commander'
import { useEditSettingsStore } from '~/stores/edit-settings'
import { useModalStore } from '~/stores/modal'
import { usePreviewSyncStore } from '~/stores/preview-sync'
import { createAsyncQueue } from '~/utils/async-queue'

import type { ISentence } from 'webgal-parser/src/interface/sceneInterface'
import type { Transform } from '~/domain/stage/types'
import type { EmitTransformOptions } from '~/features/editor/effect-editor/types'
import type { TransformBaselineSessionClient } from '~/features/editor/transform-resolution/baseline-session'
import type { TransformBaselineSource } from '~/features/editor/transform-resolution/model'

export type EffectEditorPreviewSchedule = 'continuous' | 'color' | 'frame' | 'immediate'

export interface EffectEditorPreviewPayload {
  schedule: EffectEditorPreviewSchedule
  flush?: boolean
}

export interface EffectEditorTransformUpdatePayload {
  value: Transform
  deferAutoApply?: boolean
  flush?: boolean
}

export interface EffectEditorDraft {
  transform: Transform
  duration: string
  ease: string
}

type EffectEditorPreviewTransform = Transform | (() => Transform)

export interface EffectEditorOpenTarget {
  baseSentence: ISentence
  effectTarget?: string
  scenePath: string
  sentenceId: number
  onApply: (result: EffectEditorDraft) => void | Promise<void>
}

export interface EffectEditorSession {
  sessionId: number
  command: commandType
  effectTarget: string
  scenePath: string
  sentenceId: number
  lineCommandString: string
  draft: EffectEditorDraft
  /** 打开编辑器时的初始草稿快照，用于"重置"操作的目标 */
  initialDraft: EffectEditorDraft
  /** 最近一次成功提交后的草稿快照，用于判断 dirty 状态和增量提交 */
  baseDraft: EffectEditorDraft
  dirty: boolean
  hasApplied: boolean
  missingTargetWarned: boolean
  baselineResolved: boolean
  baselineSource: TransformBaselineSource
  baselineTransform?: Transform
  writeDefault: boolean
  onApply: (result: EffectEditorDraft) => void | Promise<void>
}

interface CreateEffectEditorProviderOptions {
  baselineClient?: TransformBaselineSessionClient
}

interface EffectPreviewEmitterOptions {
  emitPreview: (payload: EffectEditorPreviewPayload) => void
  emitTransform: (payload: EffectEditorTransformUpdatePayload) => void
}

const EFFECT_EDITOR_PROVIDER_KEY: InjectionKey<ReturnType<typeof createEffectEditorProvider>> = Symbol('effect-editor-provider')
type EffectEditorCloseAction = 'save' | 'discard' | 'cancel'
type EffectPreviewRequestKind = 'preview' | 'commit' | 'restore'
type PreviewRuntimeSyncState = 'ready' | 'terminal-unsynced'
const CONTINUOUS_PREVIEW_THROTTLE_MS = 40

interface EffectPreviewOwnerRequest {
  draftSnapshot: EffectEditorDraft
  errorMessage: string
  kind: EffectPreviewRequestKind
  resolve: (accepted: boolean) => void
  sessionId: number
  target: string
}

function cloneTransform(transform: Transform): Transform {
  return structuredClone(toRaw(transform))
}

function cloneDraft(draft: EffectEditorDraft): EffectEditorDraft {
  return {
    transform: cloneTransform(draft.transform),
    duration: draft.duration,
    ease: draft.ease,
  }
}

export function createEffectPreviewEmitter(options: EffectPreviewEmitterOptions) {
  function emitPreview(schedule: EffectEditorPreviewSchedule, flush: boolean = false) {
    options.emitPreview({ schedule, flush })
  }

  function emitTransform(fields: Record<string, string>, emitOptions: EmitTransformOptions) {
    options.emitTransform({
      value: fieldsToTransform(fields),
      deferAutoApply: emitOptions.deferAutoApply,
      flush: emitOptions.flush,
    })
    emitPreview(emitOptions.schedule, emitOptions.flush)
  }

  return {
    emitPreview,
    emitTransform,
  }
}

function cloneBaseSentence(sentence: ISentence): ISentence {
  return {
    command: sentence.command,
    commandRaw: sentence.commandRaw,
    content: sentence.content,
    args: sentence.args.map(arg => ({ key: arg.key, value: arg.value })),
    sentenceAssets: [],
    subScene: [],
    inlineComment: sentence.inlineComment ?? '',
  }
}

function readTransformJson(sentence: ISentence): string {
  if (sentence.command === commandType.setTransform) {
    return sentence.content
  }
  return readSentenceArgString(sentence, 'transform')
}

function resolveEffectTarget(target: EffectEditorOpenTarget): string {
  return target.effectTarget?.trim() || readSentenceArgString(target.baseSentence, 'target').trim()
}

function resolveWriteDefault(sentence: ISentence): boolean {
  return sentence.args.some(arg => arg.key === 'writeDefault' && arg.value === true)
}

function isDraftEqual(left: EffectEditorDraft, right: EffectEditorDraft): boolean {
  return left.duration === right.duration
    && left.ease === right.ease
    && isTransformEqual(left.transform, right.transform)
}

function needsPreviewBaselineReset(
  previousDraft: EffectEditorDraft,
  nextDraft: EffectEditorDraft,
  isVisualPreviewDirty: boolean,
): boolean {
  return isVisualPreviewDirty || !isTransformEqual(previousDraft.transform, nextDraft.transform)
}

export function createEffectEditorProvider(options: CreateEffectEditorProviderOptions = {}) {
  const editSettings = useEditSettingsStore()
  const previewSyncStore = usePreviewSyncStore()
  const baselineClient = options.baselineClient ?? {
    queryBaseTransform: previewSyncStore.queryBaseTransform,
    queryTransformBaseline: previewSyncStore.queryTransformBaseline,
    syncScene: debugCommander.syncScene,
  }

  let isOpen = $ref(false)
  let session = $ref<EffectEditorSession>()
  let cancelFramePreview: (() => void) | undefined
  let cancelBaselineResolution = $ref<(() => void) | undefined>()
  let nextSessionId = $ref(0)
  let draftUndoStack: EffectEditorDraft[] = []
  let draftRedoStack: EffectEditorDraft[] = []
  let pendingDraftHistoryBefore: EffectEditorDraft | undefined
  let effectClipboard: EffectEditorDraft | undefined
  let previewTransformOverride: EffectEditorPreviewTransform | undefined
  let previewTask: Promise<void> | undefined
  let previewRequestQueue: EffectPreviewOwnerRequest[] = []
  let visualPreviewDirty = false
  let previewSyncState: PreviewRuntimeSyncState = 'ready'
  let previewSyncStateWarned = false
  let continuousPreviewTimerId: ReturnType<typeof setTimeout> | undefined
  let lastContinuousPreviewAt = 0
  let isClosing = false

  function clearContinuousPreviewTimer(): void {
    if (continuousPreviewTimerId === undefined) {
      return
    }

    clearTimeout(continuousPreviewTimerId)
    continuousPreviewTimerId = undefined
  }

  function sendContinuousPreviewNow(): void {
    clearContinuousPreviewTimer()
    lastContinuousPreviewAt = Date.now()
    scheduleFramePreviewBoundary()
  }

  function scheduleContinuousPreview(): void {
    const elapsed = Date.now() - lastContinuousPreviewAt
    if (elapsed >= CONTINUOUS_PREVIEW_THROTTLE_MS) {
      sendContinuousPreviewNow()
      return
    }

    if (continuousPreviewTimerId !== undefined) {
      return
    }

    continuousPreviewTimerId = setTimeout(() => {
      continuousPreviewTimerId = undefined
      sendContinuousPreviewNow()
    }, CONTINUOUS_PREVIEW_THROTTLE_MS - elapsed)
  }

  function canSendPreview(): boolean {
    return editSettings.enableLivePreview
      && editSettings.enableRealtimeEffectPreview
  }

  function canAutoApply(): boolean {
    return editSettings.autoApplyEffectEditorChanges
  }

  function shouldCommitRuntimeTransform(draftSnapshot: EffectEditorDraft, baseDraft: EffectEditorDraft): boolean {
    return visualPreviewDirty || !isTransformEqual(draftSnapshot.transform, baseDraft.transform)
  }

  function markPreviewTerminalUnsynced(): void {
    previewSyncState = 'terminal-unsynced'
    previewSyncStateWarned = false
  }

  function resetPreviewSyncState(): void {
    previewSyncState = 'ready'
    previewSyncStateWarned = false
  }

  function isPreviewTerminalSyncFailure(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error)
    return message.includes('preview state reset')
  }

  function isPreviewTerminalUnsynced(): boolean {
    return previewSyncState === 'terminal-unsynced'
  }

  function warnPreviewTerminalUnsynced(): void {
    if (previewSyncStateWarned) {
      return
    }

    logger.warn('效果编辑器运行时预览状态未同步，请先重试应用或重新打开效果编辑器')
    previewSyncStateWarned = true
  }

  function ensureCanEditPreviewSession(): boolean {
    if (!isPreviewTerminalUnsynced()) {
      return true
    }

    warnPreviewTerminalUnsynced()
    return false
  }

  function warnMissingEffectTarget(currentSession: EffectEditorSession): void {
    if (!currentSession.missingTargetWarned) {
      logger.warn('效果编辑器缺少 target，跳过实时预览')
    }
    currentSession.missingTargetWarned = true
  }

  function cancelScheduledPreview() {
    clearContinuousPreviewTimer()
    cancelFramePreview?.()
    cancelFramePreview = undefined
  }

  function clearDraftHistory(): void {
    draftUndoStack = []
    draftRedoStack = []
    pendingDraftHistoryBefore = undefined
  }

  function discardSessionState(): void {
    previewTransformOverride = undefined
    session = undefined
    isOpen = false
    clearDraftHistory()
    resetPreviewSyncState()
  }

  function pushDraftUndoSnapshot(previousDraft: EffectEditorDraft, nextDraft: EffectEditorDraft): void {
    if (isDraftEqual(previousDraft, nextDraft)) {
      return
    }

    const snapshot = cloneDraft(previousDraft)
    const lastSnapshot = draftUndoStack.at(-1)
    if (!lastSnapshot || !isDraftEqual(lastSnapshot, snapshot)) {
      draftUndoStack.push(snapshot)
    }
    draftRedoStack = []
  }

  function applyDraftSnapshot(draftSnapshot: EffectEditorDraft): void {
    if (!session) {
      return
    }

    previewTransformOverride = undefined
    const nextDraft = cloneDraft(draftSnapshot)
    session.draft = nextDraft
    session.dirty = !isDraftEqual(nextDraft, session.baseDraft)
  }

  function cancelScheduledBaselineResolution(): void {
    cancelBaselineResolution?.()
    cancelBaselineResolution = undefined
  }

  function scheduleSessionBaselineResolution(
    currentSessionId: number,
    target: EffectEditorOpenTarget,
    lineCommandString: string,
  ): void {
    cancelScheduledBaselineResolution()

    const run = () => {
      cancelBaselineResolution = undefined
      void resolveSessionBaseline(currentSessionId, target, lineCommandString)
    }

    if (typeof requestAnimationFrame === 'function') {
      const frameId = requestAnimationFrame(run)
      cancelBaselineResolution = () => cancelAnimationFrame(frameId)
      return
    }

    const timeoutId = setTimeout(run, 0)
    cancelBaselineResolution = () => clearTimeout(timeoutId)
  }

  function scheduleFramePreviewBoundary(): void {
    if (cancelFramePreview) {
      return
    }

    const run = () => {
      cancelFramePreview = undefined
      enqueuePreview()
    }

    const frameId = requestAnimationFrame(run)
    cancelFramePreview = () => cancelAnimationFrame(frameId)
  }

  function requestFramePreview(): void {
    scheduleFramePreviewBoundary()
  }

  function requestColorPreview(): void {
    scheduleFramePreviewBoundary()
  }

  async function commitDraft(
    currentSessionId: number,
    draftSnapshot: EffectEditorDraft,
    errorMessage: string,
  ): Promise<boolean> {
    const currentSession = session
    if (!currentSession || currentSession.sessionId !== currentSessionId) {
      return false
    }

    try {
      await currentSession.onApply(draftSnapshot)
    } catch (error) {
      logger.error(`${errorMessage}: ${error}`)
      return false
    }

    if (!session || session.sessionId !== currentSessionId) {
      return true
    }

    const nextBaseDraft = cloneDraft(draftSnapshot)
    session.baseDraft = nextBaseDraft
    session.dirty = !isDraftEqual(session.draft, nextBaseDraft)
    session.hasApplied = true
    visualPreviewDirty = false
    resetPreviewSyncState()

    return true
  }

  const autoApplyQueue = createAsyncQueue(
    async () => {
      if (!session) {
        return
      }
      if (isPreviewTerminalUnsynced()) {
        return
      }
      const currentSessionId = session.sessionId
      const currentSession = session
      const draftSnapshot = cloneDraft(session.draft)
      if (!isDraftEqual(draftSnapshot, session.baseDraft)) {
        if (shouldCommitRuntimeTransform(draftSnapshot, session.baseDraft)) {
          const runtimeCommitted = await commitPreviewAfterIdle(
            currentSession,
            draftSnapshot,
            '自动应用效果编辑器运行时预览提交失败',
          )
          if (!runtimeCommitted) {
            return
          }
        }

        await commitDraft(currentSessionId, draftSnapshot, '自动应用效果编辑器变更失败')
      }
    },
    () => !!session && isOpen && canAutoApply(),
  )

  function discardPreviewSession(): void {
    autoApplyQueue.cancel()
    cancelQueuedPreview()
    cancelScheduledPreview()
    cancelScheduledBaselineResolution()
    previewTransformOverride = undefined
    visualPreviewDirty = false
    discardSessionState()
  }

  function discardQueuedPreviewRequests(
    shouldDiscard: (request: EffectPreviewOwnerRequest) => boolean,
  ): void {
    const keptRequests: EffectPreviewOwnerRequest[] = []
    for (const request of previewRequestQueue) {
      if (shouldDiscard(request)) {
        request.resolve(false)
      } else {
        keptRequests.push(request)
      }
    }
    previewRequestQueue = keptRequests
  }

  function resolvePhaseForRequest(kind: EffectPreviewRequestKind) {
    return kind === 'commit' ? 'commit' : 'preview'
  }

  function handlePreviewRequestFailure(
    request: EffectPreviewOwnerRequest,
    error: unknown,
  ): void {
    const currentSession = session
    if (
      currentSession?.sessionId === request.sessionId
      && request.kind !== 'preview'
      && isPreviewTerminalSyncFailure(error)
    ) {
      markPreviewTerminalUnsynced()
    }

    logger.error(`${request.errorMessage}: ${error}`)
  }

  async function sendPreviewOwnerRequest(request: EffectPreviewOwnerRequest): Promise<boolean> {
    const currentSession = session
    if (!currentSession || currentSession.sessionId !== request.sessionId) {
      return false
    }
    if (isPreviewTerminalUnsynced()) {
      return false
    }

    const transformSnapshot = cloneTransform(request.draftSnapshot.transform)
    const phase = resolvePhaseForRequest(request.kind)
    if (phase === 'preview') {
      visualPreviewDirty = true
    }

    try {
      await debugCommander.setEffect(request.target, transformSnapshot, { phase })
    } catch (error) {
      handlePreviewRequestFailure(request, error)
      return false
    }

    if (request.kind === 'restore') {
      visualPreviewDirty = false
      resetPreviewSyncState()
    } else if (request.kind === 'commit' && session?.sessionId === request.sessionId) {
      visualPreviewDirty = !isTransformEqual(request.draftSnapshot.transform, session.baseDraft.transform)
      resetPreviewSyncState()
    }

    return true
  }

  async function consumeQueuedPreview(): Promise<void> {
    while (previewRequestQueue.length > 0) {
      const request = previewRequestQueue.shift()!
      // eslint-disable-next-line no-await-in-loop -- 单发送循环 ordering 是协议语义的一部分
      const accepted = await sendPreviewOwnerRequest(request)
      request.resolve(accepted)
      if (!accepted && request.kind !== 'preview' && isPreviewTerminalUnsynced()) {
        discardQueuedPreviewRequests(() => true)
        break
      }
    }
  }

  function runPreviewQueue(): Promise<void> {
    if (previewTask) {
      return previewTask
    }

    previewTask = (async () => {
      try {
        await consumeQueuedPreview()
      } finally {
        previewTask = undefined
      }
    })()

    return previewTask
  }

  function enqueuePreviewOwnerRequest(
    request: Omit<EffectPreviewOwnerRequest, 'resolve'>,
  ): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      const nextRequest: EffectPreviewOwnerRequest = {
        ...request,
        resolve,
      }

      if (nextRequest.kind === 'preview') {
        discardQueuedPreviewRequests(queuedRequest => queuedRequest.kind === 'preview')
      } else if (nextRequest.kind === 'commit') {
        discardQueuedPreviewRequests(queuedRequest => queuedRequest.kind === 'preview')
      } else {
        discardQueuedPreviewRequests(() => true)
      }

      previewRequestQueue.push(nextRequest)
      void runPreviewQueue()
    })
  }

  function enqueuePreview(): void {
    if (!session || !isOpen || !canSendPreview()) {
      return
    }
    if (!ensureCanEditPreviewSession()) {
      return
    }
    if (!session.effectTarget) {
      warnMissingEffectTarget(session)
      return
    }

    void enqueuePreviewOwnerRequest({
      draftSnapshot: clonePreviewDraftSnapshot(session),
      errorMessage: '发送效果实时预览失败',
      kind: 'preview',
      sessionId: session.sessionId,
      target: session.effectTarget,
    })
  }

  function syncExplicitHistoryDraft(): void {
    if (!session || !isOpen || !canSendPreview()) {
      autoApplyQueue.enqueue()
      return
    }
    if (!ensureCanEditPreviewSession()) {
      autoApplyQueue.enqueue()
      return
    }
    if (!session.effectTarget) {
      warnMissingEffectTarget(session)
      autoApplyQueue.enqueue()
      return
    }

    void enqueuePreviewOwnerRequest({
      draftSnapshot: cloneDraft(session.draft),
      errorMessage: '发送效果历史操作预览失败',
      kind: 'preview',
      sessionId: session.sessionId,
      target: session.effectTarget,
    }).then((accepted) => {
      if (accepted) {
        autoApplyQueue.enqueue()
      }
    })
  }

  async function waitForPreviewIdle(): Promise<void> {
    while (previewTask) {
      // eslint-disable-next-line no-await-in-loop -- rollback 必须排在已发送 preview 之后
      await previewTask
    }
  }

  function cancelQueuedPreview(): void {
    discardQueuedPreviewRequests(() => true)
  }

  function requestPreview(payload: EffectEditorPreviewPayload) {
    if (!session || !isOpen) {
      return
    }
    if (!payload.flush && canAutoApply() && pendingDraftHistoryBefore === undefined && !hasPreviewTransformOverride()) {
      return
    }
    if (!canSendPreview()) {
      return
    }
    if (!ensureCanEditPreviewSession()) {
      return
    }

    if (payload.flush) {
      cancelScheduledPreview()
      if (canAutoApply()) {
        autoApplyQueue.enqueue()
        return
      }

      const draftSnapshot = cloneDraft(session.draft)
      if (!shouldCommitRuntimeTransform(draftSnapshot, session.baseDraft)) {
        return
      }

      if (!session.effectTarget) {
        warnMissingEffectTarget(session)
        return
      }

      void enqueuePreviewOwnerRequest({
        draftSnapshot,
        errorMessage: '提交效果编辑器运行时预览失败',
        kind: 'commit',
        sessionId: session.sessionId,
        target: session.effectTarget,
      })
      return
    }

    // 预览调度策略：
    // - immediate: 进入全局帧边界（用于离散操作如 segmented 切换）
    // - frame: 通过 rAF 合并同帧内的多次交互态更新（如变换控件拖拽）
    // - color: 通过 rAF 合并同帧内的多次颜色变更（color picker 高频触发）
    // - continuous（default）: 节流发送（用于拖拽滑块等连续操作）
    switch (payload.schedule) {
      case 'immediate': {
        requestFramePreview()
        break
      }
      case 'frame': {
        requestFramePreview()
        break
      }
      case 'color': {
        requestColorPreview()
        break
      }
      default: {
        scheduleContinuousPreview()
        break
      }
    }
  }

  function updateDraft(
    patch: Partial<EffectEditorDraft>,
    options: { deferAutoApply?: boolean } = {},
  ) {
    if (!session) {
      return
    }
    if (!ensureCanEditPreviewSession()) {
      return
    }

    const nextTransform = patch.transform === undefined
      ? cloneTransform(session.draft.transform)
      : cloneTransform(patch.transform)

    const nextDraft: EffectEditorDraft = {
      transform: nextTransform,
      duration: patch.duration ?? session.draft.duration,
      ease: patch.ease ?? session.draft.ease,
    }
    const previousDraft = cloneDraft(session.draft)
    const changed = !isDraftEqual(previousDraft, nextDraft)
    const shouldFinalizePendingHistory = !options.deferAutoApply && pendingDraftHistoryBefore !== undefined

    if (!changed && !shouldFinalizePendingHistory) {
      return
    }

    if (options.deferAutoApply) {
      if (!pendingDraftHistoryBefore) {
        pendingDraftHistoryBefore = previousDraft
      }
    } else {
      pushDraftUndoSnapshot(pendingDraftHistoryBefore ?? previousDraft, nextDraft)
      pendingDraftHistoryBefore = undefined
    }

    if (changed) {
      applyDraftSnapshot(nextDraft)
    }

    if (!options.deferAutoApply) {
      autoApplyQueue.enqueue()
    }
  }

  function hasPreviewTransformOverride(): boolean {
    return previewTransformOverride !== undefined
  }

  function resolvePreviewTransform(currentSession: EffectEditorSession): Transform {
    const override = previewTransformOverride

    return typeof override === 'function'
      ? override()
      : (override ?? currentSession.draft.transform)
  }

  function clonePreviewDraftSnapshot(currentSession: EffectEditorSession): EffectEditorDraft {
    return {
      ...cloneDraft(currentSession.draft),
      transform: cloneTransform(resolvePreviewTransform(currentSession)),
    }
  }

  function updatePreviewTransform(transform: EffectEditorPreviewTransform): void {
    if (!session) {
      return
    }
    if (!ensureCanEditPreviewSession()) {
      return
    }

    previewTransformOverride = typeof transform === 'function'
      ? transform
      : cloneTransform(transform)
  }

  function resetToInitialDraft() {
    if (!session) {
      return
    }
    if (!ensureCanEditPreviewSession()) {
      return
    }

    const currentSession = session
    const previousDraft = cloneDraft(currentSession.draft)
    const nextDraft = cloneDraft(currentSession.initialDraft)
    const shouldResetPreview = needsPreviewBaselineReset(previousDraft, nextDraft, visualPreviewDirty)

    pushDraftUndoSnapshot(previousDraft, nextDraft)
    pendingDraftHistoryBefore = undefined
    applyDraftSnapshot(nextDraft)

    autoApplyQueue.cancel()
    cancelQueuedPreview()
    cancelScheduledPreview()

    if (canAutoApply()) {
      autoApplyQueue.enqueue()
      return
    }

    if (shouldResetPreview) {
      void restorePreviewAfterIdle(currentSession, nextDraft, '重置效果预览失败')
    }
  }

  async function resolveSessionBaseline(
    currentSessionId: number,
    target: EffectEditorOpenTarget,
    lineCommandString: string,
  ): Promise<void> {
    const currentSession = session
    if (!currentSession || currentSession.sessionId !== currentSessionId) {
      return
    }

    try {
      const result = await resolveTransformBaselineSession({
        client: baselineClient,
        request: {
          command: currentSession.command,
          lineCommandString,
          scenePath: target.scenePath,
          sentenceId: target.sentenceId,
          target: currentSession.effectTarget,
          writeDefault: currentSession.writeDefault,
        },
      })

      if (!session || session.sessionId !== currentSessionId) {
        return
      }

      session.baselineSource = result.baselineSource
      session.baselineTransform = result.baselineTransform
    } catch (error) {
      if (!session || session.sessionId !== currentSessionId) {
        return
      }

      logger.warn(`解析效果编辑器 transform baseline 失败，已降级为 unknown: ${error}`)
      session.baselineSource = 'unknown'
      session.baselineTransform = undefined
    } finally {
      if (session && session.sessionId === currentSessionId) {
        session.baselineResolved = true
      }
    }
  }

  function undoDraft(): boolean {
    if (!session) {
      return false
    }
    if (!ensureCanEditPreviewSession()) {
      return false
    }

    const targetDraft = draftUndoStack.pop()
    if (!targetDraft) {
      return false
    }

    pendingDraftHistoryBefore = undefined
    draftRedoStack.push(cloneDraft(session.draft))
    applyDraftSnapshot(targetDraft)
    syncExplicitHistoryDraft()
    return true
  }

  function redoDraft(): boolean {
    if (!session) {
      return false
    }
    if (!ensureCanEditPreviewSession()) {
      return false
    }

    const targetDraft = draftRedoStack.pop()
    if (!targetDraft) {
      return false
    }

    pendingDraftHistoryBefore = undefined
    draftUndoStack.push(cloneDraft(session.draft))
    applyDraftSnapshot(targetDraft)
    syncExplicitHistoryDraft()
    return true
  }

  function copyCurrentEffect(): boolean {
    if (!session) {
      return false
    }

    effectClipboard = cloneDraft(session.draft)
    return true
  }

  function pasteCurrentEffect(): boolean {
    if (!session || !effectClipboard) {
      return false
    }
    if (!ensureCanEditPreviewSession()) {
      return false
    }

    const previousDraft = cloneDraft(session.draft)
    const nextDraft = cloneDraft(effectClipboard)
    if (isDraftEqual(previousDraft, nextDraft)) {
      return false
    }

    pushDraftUndoSnapshot(previousDraft, nextDraft)
    pendingDraftHistoryBefore = undefined
    applyDraftSnapshot(nextDraft)
    syncExplicitHistoryDraft()
    return true
  }

  function cancelDraftHistoryBatch(): EffectEditorDraft | undefined {
    const currentSession = session
    if (!currentSession || !pendingDraftHistoryBefore) {
      return undefined
    }

    const rollbackDraft = cloneDraft(pendingDraftHistoryBefore)
    pendingDraftHistoryBefore = undefined
    applyDraftSnapshot(rollbackDraft)
    return rollbackDraft
  }

  async function restorePreviewAfterIdle(
    currentSession: EffectEditorSession,
    draftSnapshot: EffectEditorDraft,
    errorMessage: string,
  ): Promise<boolean> {
    cancelScheduledPreview()
    cancelQueuedPreview()
    await waitForPreviewIdle()
    return restoreEffectPreview(currentSession, draftSnapshot, errorMessage)
  }

  async function commitPreviewAfterIdle(
    currentSession: EffectEditorSession,
    draftSnapshot: EffectEditorDraft,
    errorMessage: string,
  ): Promise<boolean> {
    cancelScheduledPreview()
    cancelQueuedPreview()
    await waitForPreviewIdle()
    return commitEffectPreview(currentSession, draftSnapshot, errorMessage)
  }

  async function commitEffectPreview(
    currentSession: EffectEditorSession,
    draftSnapshot: EffectEditorDraft,
    errorMessage: string,
  ): Promise<boolean> {
    if (!currentSession.effectTarget) {
      warnMissingEffectTarget(currentSession)
      return true
    }

    return await enqueuePreviewOwnerRequest({
      draftSnapshot: cloneDraft(draftSnapshot),
      errorMessage,
      kind: 'commit',
      sessionId: currentSession.sessionId,
      target: currentSession.effectTarget,
    })
  }

  async function restoreEffectPreview(
    currentSession: EffectEditorSession,
    draftSnapshot: EffectEditorDraft,
    errorMessage: string,
  ): Promise<boolean> {
    if (!currentSession.effectTarget) {
      warnMissingEffectTarget(currentSession)
      return false
    }

    return await enqueuePreviewOwnerRequest({
      draftSnapshot: cloneDraft(draftSnapshot),
      errorMessage,
      kind: 'restore',
      sessionId: currentSession.sessionId,
      target: currentSession.effectTarget,
    })
  }

  async function cancelPreview(): Promise<void> {
    const currentSession = session
    if (!currentSession) {
      cancelScheduledPreview()
      cancelQueuedPreview()
      return
    }

    cancelScheduledPreview()
    cancelQueuedPreview()
    previewTransformOverride = undefined
    const rollbackDraft = cancelDraftHistoryBatch() ?? cloneDraft(currentSession.draft)
    if (isClosing) {
      return
    }

    if (visualPreviewDirty) {
      await restoreEffectPreview(currentSession, rollbackDraft, '恢复效果编辑器交互预览失败')
    }
  }

  async function confirmDiscardChanges(): Promise<EffectEditorCloseAction> {
    const modalStore = useModalStore()

    return new Promise<EffectEditorCloseAction>((resolve) => {
      modalStore.open('DiscardEffectChangesModal', {
        onApply: () => resolve('save'),
        onDiscard: () => resolve('discard'),
        onCancel: () => resolve('cancel'),
      }, `effect-editor-discard-${Date.now()}`)
    })
  }

  async function close(options: { forceDiscard?: boolean, skipPreviewReset?: boolean } = {}): Promise<boolean> {
    if (!session) {
      cancelScheduledBaselineResolution()
      isOpen = false
      clearDraftHistory()
      return true
    }
    if (isPreviewTerminalUnsynced()) {
      warnPreviewTerminalUnsynced()
      return false
    }

    const pendingRollbackDraft = options.skipPreviewReset ? undefined : cancelDraftHistoryBatch()
    if (pendingRollbackDraft) {
      cancelQueuedPreview()
      cancelScheduledPreview()
    }

    if (canAutoApply() && !options.forceDiscard) {
      await autoApplyQueue.flush()
      // flush 期间 onApply 回调可能导致 session 被外部清除（如文件切换），
      // 需要二次检查 session 是否仍然存在
      if (!session) {
        isOpen = false
        clearDraftHistory()
        return true
      }
    }

    if (session.dirty && !options.forceDiscard) {
      const action = await confirmDiscardChanges()
      if (action === 'cancel') {
        if (pendingRollbackDraft && visualPreviewDirty && session) {
          await restorePreviewAfterIdle(session, pendingRollbackDraft, '恢复效果编辑器交互预览失败')
        }
        return false
      }
      if (action === 'save') {
        return await apply()
      }
    }

    const currentSession = session
    const closeRestoreDraft = cloneDraft(currentSession.baseDraft)
    isClosing = true

    try {
      autoApplyQueue.cancel()
      cancelQueuedPreview()
      cancelScheduledPreview()
      cancelScheduledBaselineResolution()
      await waitForPreviewIdle()

      if (!options.skipPreviewReset && visualPreviewDirty) {
        const restored = await restoreEffectPreview(currentSession, closeRestoreDraft, '恢复效果编辑器关闭后的预览失败')
        if (!restored) {
          return false
        }
      }

      discardSessionState()
      return true
    } finally {
      isClosing = false
    }
  }

  async function apply(): Promise<boolean> {
    if (!session) {
      return false
    }
    if (!ensureCanEditPreviewSession()) {
      return false
    }

    if (canAutoApply()) {
      await autoApplyQueue.flush()
      if (!session) {
        return false
      }
    }

    const currentSessionId = session.sessionId
    const draftSnapshot = cloneDraft(session.draft)
    const needDraftCommit = !isDraftEqual(draftSnapshot, session.baseDraft)
    if (needDraftCommit) {
      if (shouldCommitRuntimeTransform(draftSnapshot, session.baseDraft)) {
        const runtimeCommitted = await commitPreviewAfterIdle(
          session,
          draftSnapshot,
          '提交效果编辑器运行时预览失败',
        )
        if (!runtimeCommitted) {
          return false
        }
      }

      const committed = await commitDraft(
        currentSessionId,
        draftSnapshot,
        '应用效果编辑器变更失败',
      )
      if (!committed) {
        return false
      }
    }

    if (session && !isDraftEqual(session.draft, draftSnapshot)) {
      enqueuePreview()
      return false
    }

    return await close({ forceDiscard: true, skipPreviewReset: true })
  }

  async function open(target: EffectEditorOpenTarget): Promise<boolean> {
    if (isOpen) {
      if (isPreviewTerminalUnsynced()) {
        discardPreviewSession()
      } else {
        const closed = await close()
        if (!closed) {
          return false
        }
      }
    }

    const baseSentence = cloneBaseSentence(target.baseSentence)
    const initialDraft: EffectEditorDraft = {
      transform: parseTransformJson(readTransformJson(baseSentence)),
      duration: readSentenceArgString(baseSentence, 'duration'),
      ease: readSentenceArgString(baseSentence, 'ease'),
    }
    const effectTarget = resolveEffectTarget(target)
    const sessionId = ++nextSessionId
    const lineCommandString = serializeSentence(baseSentence)

    session = {
      sessionId,
      command: baseSentence.command,
      effectTarget,
      scenePath: target.scenePath,
      sentenceId: target.sentenceId,
      lineCommandString,
      draft: cloneDraft(initialDraft),
      initialDraft: cloneDraft(initialDraft),
      baseDraft: cloneDraft(initialDraft),
      dirty: false,
      hasApplied: false,
      missingTargetWarned: false,
      baselineResolved: false,
      baselineSource: 'unknown',
      writeDefault: resolveWriteDefault(baseSentence),
      onApply: target.onApply,
    }

    autoApplyQueue.cancel()
    clearDraftHistory()
    cancelQueuedPreview()
    isOpen = true
    previewTransformOverride = undefined
    visualPreviewDirty = false
    resetPreviewSyncState()
    clearContinuousPreviewTimer()
    lastContinuousPreviewAt = 0
    isClosing = false
    scheduleSessionBaselineResolution(sessionId, target, lineCommandString)
    return true
  }

  async function dispose(): Promise<void> {
    const closed = await close({ forceDiscard: true })
    if (!closed) {
      discardPreviewSession()
    }
  }

  if (getCurrentScope()) {
    onScopeDispose(() => {
      void dispose()
    })
  }

  return {
    get isOpen() {
      return isOpen
    },
    get session() {
      return session
    },
    get canApply() {
      return Boolean(session?.dirty)
    },
    get canReset() {
      return Boolean(session && !isDraftEqual(session.draft, session.initialDraft))
    },
    open,
    close,
    apply,
    updateDraft,
    updatePreviewTransform,
    resetToInitialDraft,
    requestPreview,
    undoDraft,
    redoDraft,
    copyCurrentEffect,
    pasteCurrentEffect,
    cancelPreview,
  }
}

export type EffectEditorProvider = ReturnType<typeof createEffectEditorProvider>

export function useEffectEditorProvider(): EffectEditorProvider {
  const injectedProvider = useInjectedEffectEditorProvider()
  if (injectedProvider) {
    return injectedProvider
  }

  const provider = createEffectEditorProvider()
  provide(EFFECT_EDITOR_PROVIDER_KEY, provider)
  return provider
}

export function useInjectedEffectEditorProvider(): EffectEditorProvider | undefined {
  return inject(EFFECT_EDITOR_PROVIDER_KEY, undefined)
}
