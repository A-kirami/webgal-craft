import { commandType } from 'webgal-parser/src/interface/sceneInterface'

import { parseStatementAnimationFrames, STATEMENT_ANIMATION_EDITOR_OPEN_OVERRIDE_KEY } from '~/composables/useStatementAnimationEditorBridge'
import { cloneAnimationFrames } from '~/helper/animation-frame'
import { useModalStore } from '~/stores/modal'

import type { ISentence } from 'webgal-parser/src/interface/sceneInterface'
import type { AnimationFrame } from '~/types/stage'

export function useStatementAnimationDialog() {
  let isOpen = $ref(false)
  let draftFrames = $ref<AnimationFrame[]>([])
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
    notify.success(t('edit.visualEditor.commandPanel.resetSuccess'))
  }

  provide(STATEMENT_ANIMATION_EDITOR_OPEN_OVERRIDE_KEY, openDialog)

  return reactive({
    ...$$({
      isOpen,
      draftFrames,
      isDirty,
      isDefault,
    }),
    updateFrames,
    handleApply,
    requestClose,
    resetToDefault,
  })
}
