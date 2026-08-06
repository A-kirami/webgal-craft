import { commandType } from 'webgal-parser/src/interface/sceneInterface'

import { resolveAutocompleteOptions } from '~/features/editor/command-registry/autocomplete-options'
import { EditorField, readArgFieldStorageKey } from '~/features/editor/command-registry/schema'
import { resolveDynamicOptions } from '~/features/editor/dynamic-options/dynamic-options'
import { useStatementEditorContent } from '~/features/editor/statement-editor/useStatementEditorContent'
import { useStatementEditorParams } from '~/features/editor/statement-editor/useStatementEditorParams'
import { useStatementEditorSay } from '~/features/editor/statement-editor/useStatementEditorSay'
import { useStatementEditorScrub } from '~/features/editor/statement-editor/useStatementEditorScrub'

import type { ISentence } from 'webgal-parser/src/interface/sceneInterface'
import type { EngineRuntimeCapabilities } from '~/domain/engine/runtime-capabilities'
import type { ResolvedAutocompleteOption } from '~/features/editor/command-registry/autocomplete-options'
import type { EditorFieldDiagnostic } from '~/features/editor/diagnostics/types'
import type { SceneAutocompleteOptions } from '~/features/editor/statement-editor/scene-autocomplete'
import type { ResourceReferenceSource } from '~/services/resource-index/reference-query'

interface UseStatementEditorFieldBindingsOptions {
  parsed: ComputedRef<ISentence | undefined>
  autocompleteOptions: ComputedRef<SceneAutocompleteOptions>
  say: Pick<
    ReturnType<typeof useStatementEditorSay>,
    'effectiveSpeaker' | 'handleSpeakerChange' | 'isNoColonStatement'
  >
  runtimeCapabilities: ComputedRef<EngineRuntimeCapabilities>
  content: Pick<
    ReturnType<typeof useStatementEditorContent>,
    | 'contentSelectValue'
    | 'getContentFieldSelectOptions'
    | 'handleContentChange'
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
    | 'isArgVisible'
    | 'resolveFieldArgField'
  >
  getFieldDiagnostics: (field: ResourceReferenceSource) => readonly EditorFieldDiagnostic[]
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
  const { t } = useI18n()

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

  function getFieldAutocompleteOptions(field: EditorField): ResolvedAutocompleteOption[] {
    if (field.field.type !== 'text' || !field.field.autocomplete) {
      return []
    }

    return resolveAutocompleteOptions(field.field.autocomplete, {
      content: options.parsed.value?.content,
      sceneOptions: options.autocompleteOptions.value,
      allowExtendedFigurePositions: options.runtimeCapabilities.value.figurePositions,
      t,
    })
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

  function resolveFieldDiagnosticSource(field: EditorField): ResourceReferenceSource | undefined {
    if (field.storage === 'content') {
      return { kind: 'content' }
    }
    if (field.storage === 'arg') {
      return {
        kind: 'argument',
        key: readArgFieldStorageKey(field.argField),
      }
    }
    return
  }

  function getFieldDiagnostics(field: EditorField): readonly EditorFieldDiagnostic[] {
    const source = resolveFieldDiagnosticSource(field)
    return source ? options.getFieldDiagnostics(source) : []
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
      options.params.handleArgFieldChange(field.argField, value)
      return
    }
    if (field.storage === 'content') {
      options.content.handleContentChange(value)
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
    getAutocompleteOptions: getFieldAutocompleteOptions,
    getDynamicOptions: getFieldDynamicOptions,
    getFieldSelectOptions,
    getFieldValue,
    getFieldSelectValue,
    getFieldDiagnostics,
    isFieldVisible,
    canScrub: canScrubField,
  }))

  return {
    getFieldValue,
    getFieldSelectValue,
    getFieldAutocompleteOptions,
    getFieldDynamicOptions,
    getFieldSelectOptions,
    isFieldVisible,
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
