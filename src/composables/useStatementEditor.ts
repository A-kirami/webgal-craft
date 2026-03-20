import { hasInjectionContext } from 'vue'
import { commandType } from 'webgal-parser/src/interface/sceneInterface'

import type { arg, ISentence } from 'webgal-parser/src/interface/sceneInterface'

export interface StatementUpdatePayload {
  id: number
  rawText: string
  parsed: ISentence
}

interface UseStatementEditorOptions {
  entry: MaybeRefOrGetter<StatementEntry>
  previousSpeaker?: MaybeRefOrGetter<string | undefined>
  emitUpdate: (payload: StatementUpdatePayload) => void
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
  const previousSpeaker = computed(() => toValue(options.previousSpeaker) ?? '')

  // ─── 元信息（派生链） ───
  // 卡片内嵌场景：VisualEditorStatementCard 已 provide，直接复用；
  // 侧边栏 StatementEditorPanel 不在卡片组件树内，inject 返回 undefined，自动 fallback；
  const injected = hasInjectionContext() ? inject(statementMetaKey, undefined) : undefined
  const meta = injected ?? useStatementMeta(entry)
  const { parsed, config, editorFields, argFields, contentField, theme, statementType, commandLabel } = meta

  const pendingArgsSnapshot = ref<arg[]>()
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
    () => {
      pendingArgsSnapshot.value = undefined
    },
  )

  function cloneArgs(args: arg[]): arg[] {
    return args.map(item => ({ ...item }))
  }

  function readEditableArgs(): arg[] {
    if (pendingArgsSnapshot.value) {
      return cloneArgs(pendingArgsSnapshot.value)
    }
    return parsed.value ? cloneArgs(parsed.value.args) : []
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

    // pendingArgsSnapshot：解决连续快速编辑时 Vue 响应式批量更新导致的 args 状态滞后。
    // 当用户拖拽滑块时，emitUpdate 触发 rawText 变更 → parsed 重新解析，
    // 但在下一次 handleArgFieldChange 时 parsed.value.args 可能还是旧值。
    // 快照保存最新 args，readEditableArgs() 优先使用它。
    // rawText 变更时（watch entry.rawText）快照被清除。
    if (patch.args) {
      newSentence.args = cloneArgs(patch.args)
      pendingArgsSnapshot.value = cloneArgs(patch.args)
    }

    const newRawText = serializeSentence(newSentence)

    options.emitUpdate({
      id: entry.value.id,
      rawText: newRawText,
      parsed: newSentence,
    })
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

  // ─── 统一字段分发（orchestrator 层） ───

  function getFieldValue(field: EditorField): string | boolean | number {
    if (field.storage === 'arg') {
      return params.getArgValue(field.argField)
    }
    if (field.storage === 'commandRaw') {
      if (parsed.value?.command === commandType.say && say.isNoColonStatement.value) {
        return ''
      }
      // 标准形式 say 命令的 commandRaw 为 "say"，实际角色名在 effectiveSpeaker 中
      if (parsed.value?.command === commandType.say) {
        return say.effectiveSpeaker.value
      }
      return parsed.value?.commandRaw ?? ''
    }
    if (contentComposable.isMultilineTextField(field.field)) {
      return contentComposable.pipeToNewline(parsed.value?.content ?? '')
    }
    return parsed.value?.content ?? ''
  }

  function getFieldSelectValue(field: EditorField): string {
    if (field.storage === 'arg') {
      return params.getArgSelectValue(field.argField)
    }
    if (field.storage !== 'content' || field.field.type !== 'choice') {
      return ''
    }
    return contentComposable.contentSelectValue.value
  }

  function getFieldDynamicOptions(field: EditorField): { label: string, value: string }[] {
    if (field.storage === 'arg') {
      return params.getArgDynamicOptions(field.argField)
    }
    if (field.storage === 'content' && field.field.type === 'choice') {
      const key = field.field.dynamicOptionsKey
      if (!key) {
        return []
      }
      const result = resolveDynamicOptions(key, params.createDynamicOptionsContext())
      return result?.options ?? []
    }
    return []
  }

  function getFieldSelectOptions(field: EditorField): { label: string, value: string }[] {
    if (field.storage === 'arg') {
      return params.getArgSelectOptions(field.argField)
    }
    if (field.storage === 'content' && field.field.type === 'choice') {
      return contentComposable.getContentFieldSelectOptions(field.field)
    }
    return []
  }

  function isFieldCustom(field: EditorField): boolean {
    if (field.storage === 'arg') {
      return params.isArgCustom(field.argField)
    }
    if (field.storage === 'content' && field.field.type === 'choice') {
      return field.field.customizable === true
        && contentComposable.isCustomContent.value
    }
    return false
  }

  function isFieldVisible(field: EditorField): boolean {
    if (field.field.managedByEffectEditor) {
      return false
    }
    if (field.storage === 'arg') {
      return params.isArgVisible(field.argField)
    }
    if (field.field.visibleWhenContent && !field.field.visibleWhenContent(parsed.value?.content ?? '')) {
      return false
    }
    return true
  }

  function isFieldFileMissing(field: EditorField): boolean {
    if (field.field.type !== 'file') {
      return false
    }
    if (field.storage === 'content') {
      return fileMissingKeys.value.has('__content__')
    }
    if (field.storage === 'arg') {
      return fileMissingKeys.value.has(readArgFieldStorageKey(field.argField))
    }
    return false
  }

  function handleFieldValueChange(field: EditorField, value: string | number | boolean) {
    if (field.storage === 'arg') {
      params.handleArgFieldChange(field.argField, value)
      return
    }
    if (field.storage === 'commandRaw') {
      say.handleSpeakerChange(String(value))
      return
    }
    if (field.field.type === 'switch') {
      const mapped = value === true
        ? (field.field.onValue ?? '')
        : (field.field.offValue ?? '')
      contentComposable.handleContentChange(mapped)
      return
    }
    if (contentComposable.isMultilineTextField(field.field)) {
      contentComposable.handleContentChange(contentComposable.newlineToPipe(String(value)))
      return
    }
    contentComposable.handleContentChange(typeof value === 'boolean' ? String(value) : value)
  }

  function handleFieldSelectChange(field: EditorField, value: string) {
    if (field.storage === 'arg') {
      params.handleArgSelectChange(field.argField, value)
      return
    }
    if (field.storage === 'content') {
      contentComposable.handleContentSelectChange(value)
      return
    }
    say.handleSpeakerChange(value)
  }

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

  // ─── 杂项操作 ───
  function handleCommentChange(value: string) {
    emitUpdate({ content: value })
  }

  function handleRawTextChange(value: string) {
    const newParsed = ensureParsed({ ...entry.value, rawText: value })
    if (newParsed) {
      options.emitUpdate({
        id: entry.value.id,
        rawText: value,
        parsed: newParsed,
      })
    }
  }

  function handleInlineCommentChange(value: string) {
    if (!commandNode.value) {
      return
    }
    const updatedNode = updateCommandNodeInlineComment(commandNode.value, value)
    const updatedSentence = serializeCommandNode(updatedNode)
    emitUpdate({
      content: updatedSentence.content,
      commandRaw: updatedSentence.commandRaw,
      args: updatedSentence.args,
    })
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
      getFieldValue,
      getFieldSelectValue,
      getFieldSelectOptions,
      getFieldDynamicOptions,
      isFieldCustom,
      isFieldVisible,
      isFieldFileMissing,
      handleFieldValueChange,
      handleFieldSelectChange,
      readArgRuntimeValue: params.readArgRuntimeValue,
    },

    misc: {
      handleCommentChange,
      handleRawTextChange,
      handleInlineCommentChange,
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
