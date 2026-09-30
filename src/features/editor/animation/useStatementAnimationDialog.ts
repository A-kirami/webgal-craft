import { commandType } from 'webgal-parser/src/interface/sceneInterface'

import { cloneAnimationFrames } from '~/domain/stage/animation-frame'
import { parseStatementAnimationFrames, STATEMENT_ANIMATION_EDITOR_OPEN_OVERRIDE_KEY } from '~/features/editor/animation/useStatementAnimationEditorBridge'
import { useModalStore } from '~/stores/modal'

import type { ISentence } from 'webgal-parser/src/interface/sceneInterface'
import type { AnimationFrame } from '~/domain/stage/types'

export function useStatementAnimationDialog() {
  let isOpen = $ref(false)
  let draftFrames = $ref<AnimationFrame[]>([])
  // 每次打开都是一次独立会话，宿主用它作为面板的 key：退场动画期间重新打开会复用同一个面板实例，
  // 面板里的撤销历史属于上一份草稿，必须随会话重建
  let sessionId = $ref(0)
  let applyCallback: ((frames: AnimationFrame[]) => void) | undefined
  let initialSnapshot = '[]'

  const { t } = useI18n()
  const modalStore = useModalStore()

  function snapshotFrames(frames: readonly AnimationFrame[]): string {
    return JSON.stringify(frames)
  }

  const currentSnapshot = $computed(() => snapshotFrames(draftFrames))
  const isDirty = $computed(() => currentSnapshot !== initialSnapshot)
  const isDefault = $computed(() => draftFrames.length === 0)

  function openDialog(
    parsed: ISentence,
    onApply: (frames: AnimationFrame[]) => void,
  ) {
    if (parsed.command !== commandType.setTempAnimation) {
      return
    }

    let frames: AnimationFrame[]

    try {
      frames = parseStatementAnimationFrames(parsed)
    } catch (error) {
      logger.warn(`高级动画语句内容解析失败，无法打开动画编辑器: ${error}`)
      toast.error(t('edit.visualEditor.animation.invalidJson'))
      return
    }

    draftFrames = cloneAnimationFrames(frames)
    initialSnapshot = snapshotFrames(frames)
    applyCallback = onApply
    sessionId += 1
    isOpen = true
  }

  function updateFrames(frames: AnimationFrame[]) {
    draftFrames = cloneAnimationFrames(frames)
  }

  function handleApply() {
    applyCallback?.(cloneAnimationFrames(draftFrames))
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

  function resetToDefault() {
    draftFrames = []
  }

  provide(STATEMENT_ANIMATION_EDITOR_OPEN_OVERRIDE_KEY, openDialog)

  return reactive({
    ...$$({
      isOpen,
      draftFrames,
      isDirty,
      isDefault,
      sessionId,
    }),
    updateFrames,
    handleApply,
    requestClose,
    resetToDefault,
  })
}
