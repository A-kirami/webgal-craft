import { usePreviewSyncStore } from '~/stores/preview-sync'

import {
  deriveDisplayTransform,
  materializeDisplayTransform,
} from './model'

import type { DisplayTransform } from './model'
import type {
  EffectEditorProvider,
  EffectEditorTransformUpdatePayload,
} from '~/features/editor/effect-editor/useEffectEditorProvider'
import type { ReferenceBoxQueryResultPayload } from '~/types/editorPreviewProtocol'

export interface UseTransformOverlayBridgeOptions {
  provider: EffectEditorProvider
}

const FORM_DISPLAY_THROTTLE_MS = 32

export function useTransformOverlayBridge(options: UseTransformOverlayBridgeOptions) {
  const previewSyncStore = usePreviewSyncStore()

  let referenceBoxResult = $ref<ReferenceBoxQueryResultPayload>()
  let liveDisplayTransform = $ref<DisplayTransform>()
  let formDisplayTransform = $ref<DisplayTransform>()
  let pendingFormDisplayTransform = $ref<DisplayTransform>()
  let formDisplayTimeoutId: ReturnType<typeof setTimeout> | undefined
  let queryRevision = 0

  const session = computed(() => options.provider.session)
  const referenceBox = computed(() => referenceBoxResult?.status === 'ready' ? referenceBoxResult.box : undefined)
  const draftDisplayTransform = computed<DisplayTransform | undefined>(() => {
    const currentSession = session.value
    if (!currentSession) {
      return
    }

    return deriveDisplayTransform({
      baselineSource: currentSession.baselineSource,
      baselineTransform: currentSession.baselineTransform,
      explicitDraftTransform: currentSession.draft.transform,
    })
  })
  const displayTransform = computed<DisplayTransform | undefined>(() => liveDisplayTransform ?? draftDisplayTransform.value)
  const displayFormTransform = computed<DisplayTransform | undefined>(() => formDisplayTransform)
  const enabled = computed(() => Boolean(
    session.value?.effectTarget
    && session.value.baselineResolved
    && referenceBox.value
    && displayTransform.value,
  ))

  async function queryReferenceBox(): Promise<void> {
    const currentSession = session.value
    if (
      !currentSession?.effectTarget
      || !currentSession.baselineResolved
      || !previewSyncStore.isPreviewReady
    ) {
      queryRevision++
      referenceBoxResult = undefined
      return
    }

    const revision = ++queryRevision
    const result = await previewSyncStore.queryReferenceBox(currentSession.effectTarget)

    if (revision !== queryRevision) {
      return
    }

    referenceBoxResult = result
  }

  function cancelScheduledFormDisplayTransform(): void {
    if (formDisplayTimeoutId === undefined) {
      return
    }

    clearTimeout(formDisplayTimeoutId)
    formDisplayTimeoutId = undefined
  }

  function resetFormDisplayTransform(): void {
    cancelScheduledFormDisplayTransform()
    pendingFormDisplayTransform = undefined
    formDisplayTransform = undefined
  }

  function applyFormDisplayTransform(nextDisplayTransform: DisplayTransform): void {
    cancelScheduledFormDisplayTransform()
    pendingFormDisplayTransform = undefined
    formDisplayTransform = nextDisplayTransform
  }

  function flushPendingFormDisplayTransform(): void {
    formDisplayTimeoutId = undefined
    if (!pendingFormDisplayTransform) {
      return
    }

    formDisplayTransform = pendingFormDisplayTransform
    pendingFormDisplayTransform = undefined
  }

  function scheduleFormDisplayTransform(nextDisplayTransform: DisplayTransform): void {
    if (!formDisplayTransform) {
      formDisplayTransform = nextDisplayTransform
      return
    }

    pendingFormDisplayTransform = nextDisplayTransform
    if (formDisplayTimeoutId !== undefined) {
      return
    }

    formDisplayTimeoutId = setTimeout(flushPendingFormDisplayTransform, FORM_DISPLAY_THROTTLE_MS)
  }

  function updateDisplayTransform(
    nextDisplayTransform: DisplayTransform,
    options_: { flush?: boolean } = {},
  ): void {
    const currentSession = session.value
    if (!currentSession) {
      return
    }

    const baseDisplayTransform = draftDisplayTransform.value
    if (!baseDisplayTransform) {
      return
    }

    if (options_.flush) {
      const nextDraftTransform = materializeDisplayTransform({
        currentDisplayTransform: baseDisplayTransform,
        explicitDraftTransform: currentSession.draft.transform,
        nextDisplayTransform,
      })
      liveDisplayTransform = undefined
      options.provider.updateDraft(
        { transform: nextDraftTransform },
        { deferAutoApply: false },
      )
      options.provider.updatePreviewTransform(nextDraftTransform)
      applyFormDisplayTransform(nextDisplayTransform)
    } else {
      liveDisplayTransform = nextDisplayTransform
      scheduleFormDisplayTransform(nextDisplayTransform)
      options.provider.updatePreviewTransform(() => {
        const latestDisplayTransform = liveDisplayTransform ?? nextDisplayTransform
        return materializeDisplayTransform({
          currentDisplayTransform: baseDisplayTransform,
          explicitDraftTransform: currentSession.draft.transform,
          nextDisplayTransform: latestDisplayTransform,
        })
      })
    }

    options.provider.requestPreview({
      flush: options_.flush,
      schedule: options_.flush ? 'immediate' : 'frame',
    })
  }

  function handlePanelTransformUpdate(payload: EffectEditorTransformUpdatePayload): void {
    const currentSession = session.value
    if (!currentSession) {
      return
    }

    liveDisplayTransform = undefined
    resetFormDisplayTransform()
    options.provider.updateDraft(
      { transform: payload.value },
      { deferAutoApply: payload.deferAutoApply },
    )
    options.provider.updatePreviewTransform(payload.value)
  }

  function cancelDisplayTransform(): void {
    liveDisplayTransform = undefined
    resetFormDisplayTransform()
    if (!session.value) {
      return
    }

    void options.provider.cancelPreview()
  }

  watch(
    () => [
      session.value?.sessionId,
      session.value?.effectTarget,
      session.value?.baselineResolved,
      previewSyncStore.isPreviewReady,
    ],
    () => {
      liveDisplayTransform = undefined
      resetFormDisplayTransform()
      void queryReferenceBox()
    },
    { immediate: true },
  )

  watch(
    () => session.value?.draft.transform,
    () => {
      liveDisplayTransform = undefined
      resetFormDisplayTransform()
    },
    { deep: true },
  )

  tryOnScopeDispose(resetFormDisplayTransform)

  return {
    displayTransform,
    enabled,
    formDisplayTransform: displayFormTransform,
    cancelDisplayTransform,
    handlePanelTransformUpdate,
    referenceBox,
    updateDisplayTransform,
  }
}
