import { computed } from 'vue'
import { commandType } from 'webgal-parser/src/interface/sceneInterface'

import { detectAnimationDocumentFormat } from '~/domain/document/animation-document-codec'
import { serializeSentence } from '~/domain/script/serialize'
import { cloneAnimationFrames } from '~/domain/stage/animation-frame'
import { useAnimationFramePreview } from '~/features/editor/animation/useAnimationFramePreview'
import {
  applyAnimationEditorResultToSentence,
  parseStatementAnimationFrames,
  STATEMENT_ANIMATION_EDITOR_OPEN_OVERRIDE_KEY,
} from '~/features/editor/animation/useStatementAnimationEditorBridge'
import { useStatementAnimationEditorPanel } from '~/features/editor/animation/useStatementAnimationEditorPanel'
import { useModalStore } from '~/stores/modal'

import type { ISentence } from 'webgal-parser/src/interface/sceneInterface'
import type { AnimationFrame } from '~/domain/stage/types'
import type { AnimationFramePreviewContext } from '~/features/editor/animation/useAnimationFramePreview'

interface UseStatementAnimationDialogOptions {
  /** 只有非模态抽屉存在可交互预览面；模态宿主持有编辑器但不建立预览会话 */
  enableFramePreview?: boolean
}

export function useStatementAnimationDialog(options: UseStatementAnimationDialogOptions = {}) {
  let isOpen = $ref(false)
  let draftFrames = $ref<AnimationFrame[]>([])
  // 每次打开都是一次独立会话，宿主用 sessionId 重建面板实例并重置撤销历史
  let sessionId = $ref(0)
  let previewContext = $ref<AnimationFramePreviewContext>()
  let applyCallback: ((frames: AnimationFrame[]) => void) | undefined
  let parsedSentence: ISentence | undefined
  let restoreLineCommandString = ''
  let initialSnapshot = '[]'

  const { t } = useI18n()
  const modalStore = useModalStore()
  const controller = useStatementAnimationEditorPanel({
    emitFrames: (frames) => {
      draftFrames = cloneAnimationFrames(frames)
    },
    frames: () => draftFrames,
  })
  const selectedFrameTime = computed(() => {
    return controller.session.keyframes
      .find(frame => frame.id === controller.session.selectedFrameId)
      ?.cumulativeTime
  })

  const preview = options.enableFramePreview
    ? useAnimationFramePreview({
        commitSelectedFrameTransform: transform => controller.handleTransformUpdate({
          flush: true,
          value: transform,
        }),
        context: () => previewContext,
        frames: () => draftFrames,
        getRestoreLineCommandString: () => restoreLineCommandString,
        isOpen: () => isOpen,
        selectedFrameDuration: () => controller.session.selectedFrameResolvedDuration,
        selectedFrameIndex: () => controller.session.selectedFrameIndex,
        selectedFrameTime: () => selectedFrameTime.value,
        selectedFrameTransform: () => controller.session.selectedFrameState?.transform,
        sessionId: () => sessionId,
      })
    : undefined

  function snapshotFrames(frames: readonly AnimationFrame[]): string {
    return JSON.stringify(frames)
  }

  const currentSnapshot = $computed(() => snapshotFrames(draftFrames))
  const isDirty = $computed(() => currentSnapshot !== initialSnapshot)

  function openDialog(
    parsed: ISentence,
    onApply: (frames: AnimationFrame[]) => void,
    framePreviewContext?: AnimationFramePreviewContext,
  ) {
    if (parsed.command !== commandType.setTempAnimation) {
      return
    }

    let frames: AnimationFrame[]

    try {
      if (detectAnimationDocumentFormat(parsed.content) === 'v2-object') {
        toast.warning(t('edit.visualEditor.animation.v2ReadOnly'))
        return
      }

      frames = parseStatementAnimationFrames(parsed)
    } catch (error) {
      logger.warn(`高级动画语句内容解析失败，无法打开动画编辑器: ${error}`)
      toast.error(t('edit.visualEditor.animation.invalidJson'))
      return
    }

    draftFrames = cloneAnimationFrames(frames)
    initialSnapshot = snapshotFrames(frames)
    previewContext = framePreviewContext
    applyCallback = onApply
    parsedSentence = parsed
    restoreLineCommandString = serializeSentence(parsed)
    controller.resetHistory()
    controller.session.resetSelectedFrameDrafts()
    // 打开时预览已停在语句执行后的终态（最后一帧）；默认选末帧可避免打开抽屉瞬间跳回首帧
    controller.session.selectedFrameId = frames.length > 0 ? frames.length : 1
    sessionId += 1
    isOpen = true
  }

  function handleApply() {
    const appliedFrames = cloneAnimationFrames(draftFrames)
    if (parsedSentence) {
      restoreLineCommandString = serializeSentence(applyAnimationEditorResultToSentence(parsedSentence, appliedFrames))
    }
    applyCallback?.(appliedFrames)
    isOpen = false
  }

  function requestClose() {
    if (!isDirty) {
      isOpen = false
      return
    }

    modalStore.open('SaveChangesModal', {
      title: t('modals.confirmAnimationChanges.title'),
      description: t('modals.confirmAnimationChanges.description'),
      saveLabel: t('common.confirm'),
      dontSaveLabel: t('modals.confirmAnimationChanges.discard'),
      onSave: handleApply,
      onDontSave: () => {
        isOpen = false
      },
    })
  }

  provide(STATEMENT_ANIMATION_EDITOR_OPEN_OVERRIDE_KEY, openDialog)

  return reactive({
    ...$$({
      isOpen,
      draftFrames,
      isDirty,
      sessionId,
    }),
    controller,
    preview,
    handleApply,
    requestClose,
  })
}
