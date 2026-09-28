import { commandType } from 'webgal-parser/src/interface/sceneInterface'

import { readSentenceArgString } from '~/domain/script/sentence'
import { parseTransformJson, serializeTransform } from '~/features/editor/effect-editor/effect-editor-config'
import { flipTransformScaleAxis } from '~/features/editor/effect-editor/transform-flip'
import { EFFECT_EDITOR_OPEN_OVERRIDE_KEY } from '~/features/editor/effect-editor/useStatementEffectEditorBridge'
import { useModalStore } from '~/stores/modal'

import type { ISentence } from 'webgal-parser/src/interface/sceneInterface'
import type { Transform } from '~/domain/stage/types'
import type { EffectEditorResult } from '~/features/editor/effect-editor/effect-editor-result'
import type { TransformScaleAxis } from '~/features/editor/effect-editor/transform-flip'
import type { EffectEditorDraft, EffectEditorTransformUpdatePayload } from '~/features/editor/effect-editor/useEffectEditorProvider'

/**
 * 为模态框上下文提供效果编辑器的二级 Dialog 支持。
 * 通过 provide override key，让 bridge 在模态框中使用嵌套 Dialog 而非 Sheet。
 */
export function useEffectEditorDialog() {
  let isOpen = $ref(false)
  let draftTransform = $ref<Transform>(parseTransformJson(''))
  let draftDuration = $ref('')
  let draftEase = $ref('')
  let applyCallback: ((result: EffectEditorResult) => void) | undefined

  // 打开时的初始值快照，用于脏检测
  let initialSnapshot = ''

  // 模态框里没有撤销/重做（宿主 CommandDefaultsModal / StatementGroupModal 自己也没有），
  // 只保留跨语句复用的效果剪贴板
  let effectClipboard: EffectEditorDraft | undefined

  const { t } = useI18n()
  const modalStore = useModalStore()

  function snapshotDraft(transform: Transform, duration: string, ease: string): string {
    return `${serializeTransform(transform)}|${duration}|${ease}`
  }

  const currentSnapshot = $computed(() => snapshotDraft(draftTransform, draftDuration, draftEase))
  const defaultSnapshot = snapshotDraft(parseTransformJson(''), '', '')
  const isDirty = $computed(() => currentSnapshot !== initialSnapshot)
  const isDefault = $computed(() => currentSnapshot === defaultSnapshot)

  function captureDraft(): EffectEditorDraft {
    return {
      transform: structuredClone(toRaw(draftTransform)),
      duration: draftDuration,
      ease: draftEase,
    }
  }

  function restoreDraft(draft: EffectEditorDraft): void {
    draftTransform = structuredClone(draft.transform)
    draftDuration = draft.duration
    draftEase = draft.ease
  }

  function openDialog(
    parsed: ISentence,
    onApply: (result: EffectEditorResult) => void,
  ) {
    const transformJson = parsed.command === commandType.setTransform
      ? parsed.content
      : readSentenceArgString(parsed, 'transform')

    const transform = parseTransformJson(transformJson)
    const duration = readSentenceArgString(parsed, 'duration')
    const ease = readSentenceArgString(parsed, 'ease')

    draftTransform = structuredClone(toRaw(transform))
    draftDuration = duration
    draftEase = ease
    initialSnapshot = snapshotDraft(transform, duration, ease)
    applyCallback = onApply
    isOpen = true
  }

  function handleTransformUpdate(payload: EffectEditorTransformUpdatePayload) {
    draftTransform = payload.value
  }

  function updateDuration(value: string) {
    draftDuration = value
  }

  function updateEase(value: string) {
    draftEase = value
  }

  function copyCurrentEffect(): boolean {
    effectClipboard = captureDraft()
    return true
  }

  function pasteCurrentEffect(): boolean {
    if (!effectClipboard) {
      return false
    }

    if (currentSnapshot === snapshotDraft(effectClipboard.transform, effectClipboard.duration, effectClipboard.ease)) {
      return false
    }

    restoreDraft(effectClipboard)
    return true
  }

  /** 翻转缩放轴。模态框里的草稿本身就是显式值，没有 baseline 需要参与解析。 */
  function flipScaleAxis(axis: TransformScaleAxis): void {
    draftTransform = flipTransformScaleAxis({
      axis,
      transform: draftTransform,
    })
  }

  function handleApply() {
    applyCallback?.({
      transform: structuredClone(toRaw(draftTransform)),
      duration: draftDuration,
      ease: draftEase,
    })
    isOpen = false
  }

  function handleCancel() {
    isOpen = false
  }

  /** 尝试关闭：有未保存更改时通过 SaveChangesModal 确认 */
  function requestClose() {
    if (!isDirty) {
      isOpen = false
      return
    }
    modalStore.open('SaveChangesModal', {
      title: t('modals.confirmEffectChanges.title'),
      description: t('modals.confirmEffectChanges.description'),
      saveLabel: t('common.confirm'),
      dontSaveLabel: t('modals.confirmEffectChanges.discard'),
      onSave: handleApply,
      onDontSave: () => {
        isOpen = false
      },
    })
  }

  /** 重置为默认值（空白效果） */
  function resetToDefault() {
    draftTransform = parseTransformJson('')
    draftDuration = ''
    draftEase = ''
  }

  // 注入 override，让子组件中的 bridge 使用此 Dialog
  provide(EFFECT_EDITOR_OPEN_OVERRIDE_KEY, openDialog)

  return reactive({
    ...$$({
      isOpen,
      draftTransform,
      draftDuration,
      draftEase,
      isDirty,
      isDefault,
    }),
    handleTransformUpdate,
    updateDuration,
    updateEase,
    handleApply,
    handleCancel,
    requestClose,
    resetToDefault,
    copyCurrentEffect,
    pasteCurrentEffect,
    flipScaleAxis,
  })
}
