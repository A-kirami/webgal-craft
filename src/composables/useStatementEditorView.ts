import type { ISentence } from 'webgal-parser/src/interface/sceneInterface'

export interface UseStatementEditorViewOptions {
  entry: MaybeRefOrGetter<StatementEntry>
  previousSpeaker?: MaybeRefOrGetter<string | undefined>
  emitUpdate: (payload: { id: number, rawText: string, parsed: ISentence }) => void
  /** 编辑器表面类型，决定控件渲染变体 */
  surface: StatementEditorSurface
}

/**
 * 组合 useStatementEditor 与 ParamRenderer 适配层。
 * 视图派生计算（specialContentMode、basicRenderFields 等）已移入 useStatementEditor.view，
 * 本 composable 仅负责 scrub 交互和 ParamRenderer 事件桥接。
 */
export function useStatementEditorView(options: UseStatementEditorViewOptions) {
  const editor = useStatementEditor({
    entry: options.entry,
    previousSpeaker: options.previousSpeaker,
    emitUpdate: options.emitUpdate,
  })

  const { parsed, contentField, content, params } = editor

  const {
    canScrubArgField,
    handleArgLabelPointerDown,
    handleContentLabelPointerDown,
    commitSliderInput,
  } = useStatementEditorScrub({
    surface: options.surface,
    contentField,
    readArgValue: params.getArgValue,
    readContentValue: () => parsed.value?.content ?? '',
    updateArgValue: (argField, value) => params.handleArgFieldChange(argField, value),
    updateContentValue: value => content.handleChange(value),
  })

  // ─── ParamRenderer 事件处理 ───
  function canScrubField(field: EditorField): boolean {
    if (field.storage === 'content') {
      return field.field.type === 'number'
    }
    const argField = params.resolveFieldArgField(field)
    return argField ? canScrubArgField(argField) : false
  }

  function handleUpdateValue(item: { field: EditorField, value: string | number | boolean }) {
    params.handleFieldValueChange(item.field, item.value)
  }

  function handleUpdateSelect(item: { field: EditorField, value: string }) {
    params.handleFieldSelectChange(item.field, item.value)
  }

  function handleLabelPointerDown(item: { event: PointerEvent, field: EditorField }) {
    if (item.field.storage === 'content') {
      handleContentLabelPointerDown(item.event)
      return
    }
    const argField = params.resolveFieldArgField(item.field)
    if (argField) {
      handleArgLabelPointerDown(item.event, argField)
    }
  }

  function handleCommitSlider(item: { event: Event, field: EditorField }) {
    const argField = params.resolveFieldArgField(item.field)
    if (argField) {
      commitSliderInput(argField, item.event)
    }
  }

  const sharedProps = computed(() => ({
    parsed: parsed.value,
    fileRootPaths: editor.resource.fileRootPaths.value,
    getDynamicOptions: params.getFieldDynamicOptions,
    getFieldValue: params.getFieldValue,
    getFieldSelectValue: params.getFieldSelectValue,
    isFieldCustom: params.isFieldCustom,
    isFieldVisible: params.isFieldVisible,
    isFieldFileMissing: params.isFieldFileMissing,
    canScrub: canScrubField,
  }))

  return {
    ...editor,
    paramRenderer: {
      sharedProps,
      handleUpdateValue,
      handleUpdateSelect,
      handleLabelPointerDown,
      handleCommitSlider,
    },
  }
}
