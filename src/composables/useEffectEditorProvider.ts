import { commandType } from 'webgal-parser/src/interface/sceneInterface'

import type { ISentence } from 'webgal-parser/src/interface/sceneInterface'

export type EffectEditorPreviewSchedule = 'continuous' | 'color' | 'immediate'

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

export interface EffectEditorOpenTarget {
  entryId: number
  scenePath: string
  baseSentence: ISentence
  baseLineNumber: number
  baseLineText: string
  effectTarget?: string
  onApply: (result: EffectEditorDraft) => void | Promise<void>
}

export interface EffectEditorSession {
  sessionId: number
  entryId: number
  scenePath: string
  baseSentence: ISentence
  baseLineNumber: number
  baseLineText: string
  effectTarget: string
  draft: EffectEditorDraft
  /** 打开编辑器时的初始草稿快照，用于"重置"操作的目标 */
  initialDraft: EffectEditorDraft
  /** 最近一次成功提交后的草稿快照，用于判断 dirty 状态和增量提交 */
  baseDraft: EffectEditorDraft
  dirty: boolean
  hasApplied: boolean
  missingTargetWarned: boolean
  previewErrorWarned: boolean
  onApply: (result: EffectEditorDraft) => void | Promise<void>
}

interface EffectPreviewEmitterOptions {
  emitPreview: (payload: EffectEditorPreviewPayload) => void
  emitTransform: (payload: EffectEditorTransformUpdatePayload) => void
}

const EFFECT_EDITOR_PROVIDER_KEY: InjectionKey<ReturnType<typeof createEffectEditorProvider>> = Symbol('effect-editor-provider')
type EffectEditorCloseAction = 'save' | 'discard' | 'cancel'

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

function isDraftEqual(left: EffectEditorDraft, right: EffectEditorDraft): boolean {
  return left.duration === right.duration
    && left.ease === right.ease
    && isTransformEqual(left.transform, right.transform)
}

export function createEffectEditorProvider() {
  const previewSettings = usePreviewSettingsStore()
  const editSettings = useEditSettingsStore()

  let isOpen = $ref(false)
  let session = $ref<EffectEditorSession>()
  let colorPreviewFrameId = $ref<number>()
  let nextSessionId = $ref(0)

  // 40ms 节流（约 25fps）：平衡实时预览流畅度与 IPC 通信开销。
  // trailing=true 确保拖拽结束时的最终值一定会触发预览
  const scheduleContinuousPreview = useThrottleFn(() => {
    previewQueue.enqueue()
  }, 40, true, true)

  function canSendPreview(): boolean {
    return previewSettings.enableLivePreview
      && previewSettings.enableRealtimeEffectPreview
  }

  function canAutoApply(): boolean {
    return editSettings.autoApplyEffectEditorChanges
  }

  function cancelScheduledPreview() {
    if (colorPreviewFrameId !== undefined) {
      cancelAnimationFrame(colorPreviewFrameId)
      colorPreviewFrameId = undefined
    }
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

    return true
  }

  const autoApplyQueue = createAsyncQueue(
    async () => {
      if (!session) {
        return
      }
      const currentSessionId = session.sessionId
      const draftSnapshot = cloneDraft(session.draft)
      if (!isDraftEqual(draftSnapshot, session.baseDraft)) {
        await commitDraft(currentSessionId, draftSnapshot, '自动应用效果编辑器变更失败')
      }
    },
    () => !!session && isOpen && canAutoApply(),
  )

  async function sendPreviewNow() {
    if (!session || !isOpen || !canSendPreview()) {
      return
    }

    if (!session.effectTarget) {
      if (!session.missingTargetWarned) {
        logger.warn('效果编辑器缺少 target，跳过实时预览')
      }
      session.missingTargetWarned = true
      return
    }

    try {
      const target = session.effectTarget
      const transformSnapshot = cloneTransform(session.draft.transform)
      await debugCommander.setEffect(target, transformSnapshot)
      session.previewErrorWarned = false
    } catch (error) {
      if (!session.previewErrorWarned) {
        logger.error(`发送效果实时预览失败: ${error}`)
        session.previewErrorWarned = true
      }
    }
  }

  const previewQueue = createAsyncQueue(
    sendPreviewNow,
    () => !!session && isOpen && canSendPreview(),
  )

  function requestPreview(payload: EffectEditorPreviewPayload) {
    if (!session || !isOpen) {
      return
    }

    if (payload.flush) {
      cancelScheduledPreview()
      previewQueue.enqueue()
      return
    }

    // 三种预览调度策略：
    // - immediate: 立即入队（用于离散操作如 segmented 切换）
    // - color: 通过 rAF 合并同帧内的多次颜色变更（color picker 高频触发）
    // - continuous（default）: 节流发送（用于拖拽滑块等连续操作）
    switch (payload.schedule) {
      case 'immediate': {
        previewQueue.enqueue()
        break
      }
      case 'color': {
        if (colorPreviewFrameId !== undefined) {
          return
        }
        colorPreviewFrameId = requestAnimationFrame(() => {
          colorPreviewFrameId = undefined
          previewQueue.enqueue()
        })
        break
      }
      default: {
        void scheduleContinuousPreview()
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

    const nextDraft: EffectEditorDraft = {
      transform: patch.transform ? cloneTransform(patch.transform) : cloneTransform(session.draft.transform),
      duration: patch.duration ?? session.draft.duration,
      ease: patch.ease ?? session.draft.ease,
    }

    session.draft = nextDraft
    session.dirty = !isDraftEqual(nextDraft, session.baseDraft)

    if (!options.deferAutoApply) {
      autoApplyQueue.enqueue()
    }
  }

  function resetToInitialDraft() {
    if (!session) {
      return
    }

    const currentSession = session
    updateDraft({
      transform: cloneTransform(currentSession.initialDraft.transform),
      duration: currentSession.initialDraft.duration,
      ease: currentSession.initialDraft.ease,
    }, {
      deferAutoApply: true,
    })

    autoApplyQueue.cancel()
    previewQueue.cancel()
    cancelScheduledPreview()

    // 还原时直接回放场景，避免仅 setEffect 导致预览残留。
    void rollbackPreview(currentSession)

    if (canAutoApply()) {
      autoApplyQueue.enqueue()
    }
  }

  async function rollbackPreview(currentSession: EffectEditorSession) {
    try {
      await debugCommander.syncScene(
        currentSession.scenePath,
        currentSession.baseLineNumber,
        currentSession.baseLineText,
        true,
      )
    } catch (error) {
      logger.error(`回滚效果预览失败: ${error}`)
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

  async function close(options: { forceDiscard?: boolean, skipRollback?: boolean } = {}): Promise<boolean> {
    if (!session) {
      isOpen = false
      return true
    }

    if (canAutoApply() && !options.forceDiscard) {
      await autoApplyQueue.flush()
      // flush 期间 onApply 回调可能导致 session 被外部清除（如文件切换），
      // 需要二次检查 session 是否仍然存在
      if (!session) {
        isOpen = false
        return true
      }
    }

    if (session.dirty && !options.forceDiscard) {
      const action = await confirmDiscardChanges()
      if (action === 'cancel') {
        return false
      }
      if (action === 'save') {
        return await apply()
      }
    }

    const currentSession = session

    autoApplyQueue.cancel()
    cancelScheduledPreview()

    // 仅在存在未提交更改时回放，避免"未改动关闭也刷新预览"。
    if (!options.skipRollback && !currentSession.hasApplied && currentSession.dirty) {
      await rollbackPreview(currentSession)
    }

    session = undefined
    isOpen = false
    return true
  }

  async function apply(): Promise<boolean> {
    if (!session) {
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
    const needCommit = !isDraftEqual(draftSnapshot, session.baseDraft)
    if (needCommit) {
      const committed = await commitDraft(
        currentSessionId,
        draftSnapshot,
        '应用效果编辑器变更失败',
      )
      if (!committed) {
        return false
      }
    }

    return await close({ forceDiscard: true, skipRollback: true })
  }

  async function open(target: EffectEditorOpenTarget): Promise<boolean> {
    if (isOpen) {
      const closed = await close()
      if (!closed) {
        return false
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

    session = {
      sessionId,
      entryId: target.entryId,
      scenePath: target.scenePath,
      baseSentence,
      baseLineNumber: target.baseLineNumber,
      baseLineText: target.baseLineText,
      effectTarget,
      draft: cloneDraft(initialDraft),
      initialDraft: cloneDraft(initialDraft),
      baseDraft: cloneDraft(initialDraft),
      dirty: false,
      hasApplied: false,
      missingTargetWarned: false,
      previewErrorWarned: false,
      onApply: target.onApply,
    }

    autoApplyQueue.cancel()
    previewQueue.cancel()
    isOpen = true
    return true
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
    resetToInitialDraft,
    requestPreview,
  }
}

export type EffectEditorProvider = ReturnType<typeof createEffectEditorProvider>

export function useEffectEditorProvider(): EffectEditorProvider {
  const provider = createEffectEditorProvider()
  provide(EFFECT_EDITOR_PROVIDER_KEY, provider)
  return provider
}

export function useInjectedEffectEditorProvider(): EffectEditorProvider | undefined {
  return inject(EFFECT_EDITOR_PROVIDER_KEY, undefined)
}
