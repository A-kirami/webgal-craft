import { hasInjectionContext } from 'vue'
import { commandType } from 'webgal-parser/src/interface/sceneInterface'

import type { arg, ISentence } from 'webgal-parser/src/interface/sceneInterface'
import type { TransactionSource } from '~/models/transaction'

export interface StatementIdTarget {
  kind: 'statement'
  statementId: number
}

export interface TextLineTarget {
  kind: 'line'
  lineNumber: number
}

export type StatementUpdateTarget = StatementIdTarget | TextLineTarget

export interface StatementUpdatePayload {
  target: StatementUpdateTarget
  rawText: string
  parsed: ISentence
  source?: Extract<TransactionSource, 'visual' | 'effect-editor'>
}

interface UseStatementEditorOptions {
  entry: MaybeRefOrGetter<StatementEntry>
  updateTarget?: MaybeRefOrGetter<StatementUpdateTarget | undefined>
  previousSpeaker?: MaybeRefOrGetter<string | undefined>
  emitUpdate: (payload: StatementUpdatePayload) => void
  surface?: StatementEditorSurface
}

export function createStatementIdTarget(statementId: number): StatementIdTarget {
  return {
    kind: 'statement',
    statementId,
  }
}

export function createTextLineTarget(lineNumber: number): TextLineTarget {
  return {
    kind: 'line',
    lineNumber,
  }
}

export function isStatementInteractiveTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false
  }
  return !!target.closest('label, input, textarea, button, select, [role="combobox"], [role="switch"]')
}

export function useStatementEditor(options: UseStatementEditorOptions) {
  useEditorDynamicOptionsBootstrap()

  const entry = computed(() => toValue(options.entry))
  const updateTarget = computed(() => toValue(options.updateTarget) ?? createStatementIdTarget(entry.value.id))
  const previousSpeaker = computed(() => toValue(options.previousSpeaker) ?? '')

  // ─── 元信息（派生链） ───
  // 卡片内嵌场景：VisualEditorStatementCard 已 provide，直接复用；
  // 侧边栏 StatementEditorPanel 不在卡片组件树内，inject 返回 undefined，自动 fallback；
  const injected = hasInjectionContext() ? inject(statementMetaKey, undefined) : undefined
  const meta = injected ?? useStatementMeta(entry)
  const { parsed: sourceParsed, config, editorFields, argFields, contentField, theme, statementType, commandLabel } = meta

  const localDraft = ref<{ rawText: string, parsed: ISentence }>()
  const parsed = computed(() => localDraft.value?.parsed ?? sourceParsed.value)
  const commandNode = computed(() => parsed.value ? parseCommandNode(parsed.value) : undefined)

  // ─── 资源路径解析 ───
  const { fileMissingKeys } = useStatementFileMissing({
    parsed,
    contentField,
    argFields,
  })

  const { fileRootPaths } = useStatementFileRoots({
    editorFields,
  })

  // ─── 基础设施 ───
  watch(
    () => entry.value.rawText,
    (rawText) => {
      if (localDraft.value?.rawText !== rawText) {
        localDraft.value = undefined
      }
    },
  )

  function cloneSentence(sentence: ISentence): ISentence {
    return structuredClone(sentence)
  }

  function cloneArgs(args: arg[]): arg[] {
    return args.map(item => ({ ...item }))
  }

  function readEditableArgs(): arg[] {
    return parsed.value ? cloneArgs(parsed.value.args) : []
  }

  function dispatchUpdate(rawText: string, nextSentence: ISentence) {
    localDraft.value = {
      rawText,
      parsed: cloneSentence(nextSentence),
    }

    options.emitUpdate({
      target: updateTarget.value,
      rawText,
      parsed: nextSentence,
    })
  }

  function emitSentenceUpdate(nextSentence: ISentence) {
    dispatchUpdate(serializeSentence(nextSentence), nextSentence)
  }

  // ─── 说话人 / 旁白 ───
  const say = useStatementEditorSay({
    entry,
    parsed,
    commandNode,
    statementType,
    previousSpeaker,
    emitUpdate,
  })

  // ─── emitUpdate（依赖 say 的 isNoColonStatement / narrationMode）───
  function emitUpdate(patch: Partial<ISentence>) {
    // 当有类型化节点时，用 serializeCommandNode 重建 base，
    // 确保 commandRaw 已转换为简写形式（如 say → 角色名/空/null）
    const base = commandNode.value
      ? serializeCommandNode(commandNode.value)
      : (parsed.value ?? createEmptySentence())
    const newSentence: ISentence = { ...base, ...patch }

    if (patch.args) {
      newSentence.args = cloneArgs(patch.args)
    }

    emitSentenceUpdate(newSentence)
  }

  // ─── 内容处理 ───
  const contentComposable = useStatementEditorContent({
    parsed,
    commandNode,
    contentField,
    argFields,
    isNoColonSay: say.isNoColonStatement,
    emitUpdate,
  })

  // ─── 参数读写 ───
  const params = useStatementEditorParams({
    parsed,
    commandNode,
    argFields,
    fileMissingKeys,
    readEditableArgs,
    emitUpdate,
  })

  // ─── ParamRenderer 视图适配 ───
  const {
    canScrubArgField,
    handleArgLabelPointerDown,
    handleContentLabelPointerDown,
    commitSliderInput,
  } = useStatementEditorScrub({
    surface: options.surface ?? 'panel',
    contentField,
    readArgValue: params.getArgValue,
    readContentValue: () => parsed.value?.content ?? '',
    updateArgValue: (argField, value) => params.handleArgFieldChange(argField, value),
    updateContentValue: value => contentComposable.handleContentChange(value),
  })

  const fieldBindings = useStatementEditorFieldBindings({
    parsed,
    say,
    content: contentComposable,
    params,
    fileMissingKeys,
    scrub: {
      canScrubArgField,
      commitSliderInput,
      handleArgLabelPointerDown,
      handleContentLabelPointerDown,
    },
  })

  const hasVisibleAdvancedParams = computed(() => {
    return !!parsed.value
      && argFields.value.some(field => field.field.advanced && params.isArgVisible(field) && !field.field.managedByEffectEditor)
  })

  const hasEffectEditor = computed(() => {
    return !!parsed.value && !!config.value.hasEffectEditor
  })

  // ─── 视图层派生计算 ───

  const specialContentMode = computed(() => resolveStatementSpecialContentMode(parsed.value))

  const commandRenderFields = computed(() => {
    return editorFields.value.filter(field => !(specialContentMode.value && field.storage === 'content'))
  })

  const basicRenderFields = computed(() => {
    if (statementType.value === 'say') {
      return commandRenderFields.value.filter(field => field.storage !== 'commandRaw')
    }
    if (statementType.value === 'command') {
      return commandRenderFields.value
    }
    return []
  })

  const showEffectEditorButton = computed(() => statementType.value === 'command' && hasEffectEditor.value)
  const effectEditorAtTop = computed(() => showEffectEditorButton.value && parsed.value?.command === commandType.setTransform)
  const paramRendererSharedProps = computed(() => ({
    ...fieldBindings.paramRenderer.sharedProps.value,
    fileRootPaths: fileRootPaths.value,
  }))

  // ─── 杂项操作 ───
  function handleCommentChange(value: string) {
    emitUpdate({ content: value })
  }

  function handleRawTextChange(value: string) {
    const newParsed = ensureParsed({ ...entry.value, rawText: value })
    if (newParsed) {
      dispatchUpdate(value, newParsed)
    }
  }

  function handleInlineCommentChange(value: string) {
    if (!commandNode.value) {
      return
    }
    const updatedNode = updateCommandNodeInlineComment(commandNode.value, value)
    emitSentenceUpdate(serializeCommandNode(updatedNode))
  }

  return {
    parsed,
    config,
    editorFields,
    contentField,
    theme,
    statementType,
    commandLabel,
    hasVisibleAdvancedParams,
    hasEffectEditor,
    commandNode,

    say: {
      effectiveSpeaker: say.effectiveSpeaker,
      narrationMode: say.narrationMode,
      speakerPlaceholder: say.speakerPlaceholder,
      isNoColonStatement: say.isNoColonStatement,
      handleSpeakerChange: say.handleSpeakerChange,
      toggleNarrationMode: say.toggleNarrationMode,
    },

    content: {
      contentSelectValue: contentComposable.contentSelectValue,
      isCustomContent: contentComposable.isCustomContent,
      pipeToNewline: contentComposable.pipeToNewline,
      newlineToPipe: contentComposable.newlineToPipe,
      isMultilineTextField: contentComposable.isMultilineTextField,
      handleChange: contentComposable.handleContentChange,
      handleSelectChange: contentComposable.handleContentSelectChange,
      getSelectOptions: contentComposable.getContentFieldSelectOptions,
      specialContent: contentComposable.specialContent,
    },

    params: {
      argFields,
      resolveFieldArgField: params.resolveFieldArgField,
      getArgValue: params.getArgValue,
      getArgDynamicOptions: params.getArgDynamicOptions,
      getArgSelectOptions: params.getArgSelectOptions,
      getArgSelectValue: params.getArgSelectValue,
      isArgCustom: params.isArgCustom,
      handleArgSelectChange: params.handleArgSelectChange,
      isArgVisible: params.isArgVisible,
      handleArgFieldChange: params.handleArgFieldChange,
      isArgFileMissing: params.isArgFileMissing,
      getFieldValue: fieldBindings.getFieldValue,
      getFieldSelectValue: fieldBindings.getFieldSelectValue,
      getFieldSelectOptions: fieldBindings.getFieldSelectOptions,
      getFieldDynamicOptions: fieldBindings.getFieldDynamicOptions,
      isFieldCustom: fieldBindings.isFieldCustom,
      isFieldVisible: fieldBindings.isFieldVisible,
      isFieldFileMissing: fieldBindings.isFieldFileMissing,
      handleFieldValueChange: fieldBindings.handleFieldValueChange,
      handleFieldSelectChange: fieldBindings.handleFieldSelectChange,
      readArgRuntimeValue: params.readArgRuntimeValue,
    },

    misc: {
      handleCommentChange,
      handleRawTextChange,
      handleInlineCommentChange,
    },

    paramRenderer: {
      sharedProps: paramRendererSharedProps,
      handleUpdateValue: fieldBindings.paramRenderer.handleUpdateValue,
      handleUpdateSelect: fieldBindings.paramRenderer.handleUpdateSelect,
      handleLabelPointerDown: fieldBindings.paramRenderer.handleLabelPointerDown,
      handleCommitSlider: fieldBindings.paramRenderer.handleCommitSlider,
    },

    resource: {
      fileMissingKeys,
      fileRootPaths,
    },

    view: {
      specialContentMode,
      commandRenderFields,
      basicRenderFields,
      showEffectEditorButton,
      effectEditorAtTop,
    },
  }
}
