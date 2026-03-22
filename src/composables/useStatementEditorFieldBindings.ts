import { commandType } from 'webgal-parser/src/interface/sceneInterface'

import { useStatementEditorContent } from '~/composables/useStatementEditorContent'
import { useStatementEditorParams } from '~/composables/useStatementEditorParams'
import { useStatementEditorSay } from '~/composables/useStatementEditorSay'
import { useStatementEditorScrub } from '~/composables/useStatementEditorScrub'
import { EditorField, readArgFieldStorageKey } from '~/helper/command-registry/schema'
import { resolveDynamicOptions } from '~/helper/dynamic-options'

import type { ISentence } from 'webgal-parser/src/interface/sceneInterface'

interface UseStatementEditorFieldBindingsOptions {
  parsed: ComputedRef<ISentence | undefined>
  say: Pick<
    ReturnType<typeof useStatementEditorSay>,
    'effectiveSpeaker' | 'handleSpeakerChange' | 'isNoColonStatement'
  >
  content: Pick<
    ReturnType<typeof useStatementEditorContent>,
    | 'contentSelectValue'
    | 'getContentFieldSelectOptions'
    | 'handleContentChange'
    | 'handleContentSelectChange'
    | 'isCustomContent'
    | 'isMultilineTextField'
    | 'newlineToPipe'
    | 'pipeToNewline'
  >
  params: Pick<
    ReturnType<typeof useStatementEditorParams>,
    | 'createDynamicOptionsContext'
    | 'getArgDynamicOptions'
    | 'getArgSelectOptions'
    | 'getArgSelectValue'
    | 'getArgValue'
    | 'handleArgFieldChange'
    | 'handleArgSelectChange'
    | 'isArgCustom'
    | 'isArgVisible'
    | 'resolveFieldArgField'
  >
  fileMissingKeys: Ref<Set<string>>
  scrub: Pick<
    ReturnType<typeof useStatementEditorScrub>,
    | 'canScrubArgField'
    | 'commitSliderInput'
    | 'handleArgLabelPointerDown'
    | 'handleContentLabelPointerDown'
  >
}

export function useStatementEditorFieldBindings(
  options: UseStatementEditorFieldBindingsOptions,
) {
  function getFieldValue(field: EditorField): string | boolean | number {
    if (field.storage === 'arg') {
      return options.params.getArgValue(field.argField)
    }
    if (field.storage === 'commandRaw') {
      if (options.parsed.value?.command === commandType.say && options.say.isNoColonStatement.value) {
        return ''
      }
      if (options.parsed.value?.command === commandType.say) {
        return options.say.effectiveSpeaker.value
      }
      return options.parsed.value?.commandRaw ?? ''
    }
    if (options.content.isMultilineTextField(field.field)) {
      return options.content.pipeToNewline(options.parsed.value?.content ?? '')
    }
    return options.parsed.value?.content ?? ''
  }

  function getFieldSelectValue(field: EditorField): string {
    if (field.storage === 'arg') {
      return options.params.getArgSelectValue(field.argField)
    }
    if (field.storage !== 'content' || field.field.type !== 'choice') {
      return ''
    }
    return options.content.contentSelectValue.value
  }

  function getFieldDynamicOptions(field: EditorField): { label: string, value: string }[] {
    if (field.storage === 'arg') {
      return options.params.getArgDynamicOptions(field.argField)
    }
    if (field.storage === 'content' && field.field.type === 'choice') {
      const key = field.field.dynamicOptionsKey
      if (!key) {
        return []
      }
      const result = resolveDynamicOptions(key, options.params.createDynamicOptionsContext())
      return result?.options ?? []
    }
    return []
  }

  function getFieldSelectOptions(field: EditorField): { label: string, value: string }[] {
    if (field.storage === 'arg') {
      return options.params.getArgSelectOptions(field.argField)
    }
    if (field.storage === 'content' && field.field.type === 'choice') {
      return options.content.getContentFieldSelectOptions(field.field)
    }
    return []
  }

  function isFieldCustom(field: EditorField): boolean {
    if (field.storage === 'arg') {
      return options.params.isArgCustom(field.argField)
    }
    if (field.storage === 'content' && field.field.type === 'choice') {
      return field.field.customizable === true
        && options.content.isCustomContent.value
    }
    return false
  }

  function isFieldVisible(field: EditorField): boolean {
    if (field.field.managedByEffectEditor) {
      return false
    }
    if (field.storage === 'arg') {
      return options.params.isArgVisible(field.argField)
    }
    if (field.field.visibleWhenContent && !field.field.visibleWhenContent(options.parsed.value?.content ?? '')) {
      return false
    }
    return true
  }

  function isFieldFileMissing(field: EditorField): boolean {
    if (field.field.type !== 'file') {
      return false
    }
    if (field.storage === 'content') {
      return options.fileMissingKeys.value.has('__content__')
    }
    if (field.storage === 'arg') {
      return options.fileMissingKeys.value.has(readArgFieldStorageKey(field.argField))
    }
    return false
  }

  function handleFieldValueChange(field: EditorField, value: string | number | boolean) {
    if (field.storage === 'arg') {
      options.params.handleArgFieldChange(field.argField, value)
      return
    }
    if (field.storage === 'commandRaw') {
      options.say.handleSpeakerChange(String(value))
      return
    }
    if (field.field.type === 'switch') {
      const mapped = value === true
        ? (field.field.onValue ?? '')
        : (field.field.offValue ?? '')
      options.content.handleContentChange(mapped)
      return
    }
    if (options.content.isMultilineTextField(field.field)) {
      options.content.handleContentChange(options.content.newlineToPipe(String(value)))
      return
    }
    options.content.handleContentChange(typeof value === 'boolean' ? String(value) : value)
  }

  function handleFieldSelectChange(field: EditorField, value: string) {
    if (field.storage === 'arg') {
      options.params.handleArgSelectChange(field.argField, value)
      return
    }
    if (field.storage === 'content') {
      options.content.handleContentSelectChange(value)
      return
    }
    options.say.handleSpeakerChange(value)
  }

  function canScrubField(field: EditorField): boolean {
    if (field.storage === 'content') {
      return field.field.type === 'number'
    }

    const argField = options.params.resolveFieldArgField(field)
    return argField ? options.scrub.canScrubArgField(argField) : false
  }

  function handleParamRendererValueUpdate(
    item: { field: EditorField, value: string | number | boolean },
  ) {
    handleFieldValueChange(item.field, item.value)
  }

  function handleParamRendererSelectUpdate(item: { field: EditorField, value: string }) {
    handleFieldSelectChange(item.field, item.value)
  }

  function handleParamRendererLabelPointerDown(item: { event: PointerEvent, field: EditorField }) {
    if (item.field.storage === 'content') {
      options.scrub.handleContentLabelPointerDown(item.event)
      return
    }

    const argField = options.params.resolveFieldArgField(item.field)
    if (argField) {
      options.scrub.handleArgLabelPointerDown(item.event, argField)
    }
  }

  function handleParamRendererCommitSlider(item: { event: Event, field: EditorField }) {
    const argField = options.params.resolveFieldArgField(item.field)
    if (argField) {
      options.scrub.commitSliderInput(argField, item.event)
    }
  }

  const paramRendererSharedProps = computed(() => ({
    parsed: options.parsed.value,
    getDynamicOptions: getFieldDynamicOptions,
    getFieldValue,
    getFieldSelectValue,
    isFieldCustom,
    isFieldVisible,
    isFieldFileMissing,
    canScrub: canScrubField,
  }))

  return {
    getFieldValue,
    getFieldSelectValue,
    getFieldDynamicOptions,
    getFieldSelectOptions,
    isFieldCustom,
    isFieldVisible,
    isFieldFileMissing,
    handleFieldValueChange,
    handleFieldSelectChange,
    paramRenderer: {
      sharedProps: paramRendererSharedProps,
      handleCommitSlider: handleParamRendererCommitSlider,
      handleLabelPointerDown: handleParamRendererLabelPointerDown,
      handleUpdateSelect: handleParamRendererSelectUpdate,
      handleUpdateValue: handleParamRendererValueUpdate,
    },
  }
}
