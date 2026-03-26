import { commandType } from 'webgal-parser/src/interface/sceneInterface'

import { serializeCommandNode } from '~/domain/script/codec'
import { ChooseContentItem, parseChooseContent, parseSetVarContent, parseStyleRuleContent, stringifyChooseContent, stringifySetVarContent, stringifyStyleRuleContent, StyleRuleContentItem } from '~/domain/script/content'
import { CommandNode } from '~/domain/script/types'
import { updateCommandNodeContent } from '~/domain/script/update'
import { ArgField, CUSTOM_CONTENT, EditorField, FieldDef, readArgFieldStorageKey, resolveI18n } from '~/features/editor/command-registry/schema'

import type { ISentence } from 'webgal-parser/src/interface/sceneInterface'

export interface UseStatementEditorContentOptions {
  parsed: ComputedRef<ISentence | undefined>
  commandNode: ComputedRef<CommandNode | undefined>
  contentField: ComputedRef<EditorField | undefined>
  argFields: ComputedRef<ArgField[]>
  isNoColonSay: ComputedRef<boolean>
  emitUpdate: (patch: Partial<ISentence>) => void
}

/**
 * 内容字段处理逻辑，从 useStatementEditor 提取。
 */
export function useStatementEditorContent(options: UseStatementEditorContentOptions) {
  const { t } = useI18n()

  const contentSelectValue = computed(() => {
    const content = options.contentField.value?.field
    const fieldOptions = content?.type === 'choice' ? content.options : undefined
    if (!fieldOptions?.length) {
      return ''
    }
    return fieldOptions.some((o: { value: string }) => o.value === options.parsed.value?.content)
      ? (options.parsed.value?.content ?? '')
      : CUSTOM_CONTENT
  })

  const isCustomContent = computed(() => contentSelectValue.value === CUSTOM_CONTENT)

  // WebGAL 使用 | 作为多行文本分隔符（如 "第一行|第二行"），
  // 编辑器中用 textarea 展示时需要双向转换：| ↔ \n。
  // 转义的 \| 是字面管道符，不参与转换
  function pipeToNewline(text: string): string {
    return text.replaceAll(/\\?\|/g, match => match === '|' ? '\n' : '|')
  }

  function newlineToPipe(text: string): string {
    return text.replaceAll(/\\?\||\n/g, (match) => {
      if (match === '\n') {
        return '|'
      }
      if (match === '|') {
        return String.raw`\|`
      }
      return '|'
    })
  }

  function isMultilineTextField(field: EditorField['field']): boolean {
    if (field.type !== 'text' || !field.variant) {
      return false
    }
    const variants = typeof field.variant === 'string'
      ? [field.variant]
      : [field.variant.inline, field.variant.panel]
    return variants.some(v => v === 'textarea-auto' || v === 'textarea-grow')
  }

  function handleContentChange(value: string | number) {
    const newContent = String(value)
    if (options.commandNode.value) {
      const updatedNode = updateCommandNodeContent(options.commandNode.value, newContent)
      const updatedSentence = serializeCommandNode(updatedNode)
      const nextArgs = [...updatedSentence.args]
      for (const dep of options.argFields.value) {
        if (dep.field.visibleWhenContent && !dep.field.visibleWhenContent(updatedSentence.content)) {
          const idx = nextArgs.findIndex(a => a.key === readArgFieldStorageKey(dep))
          if (idx !== -1) {
            nextArgs.splice(idx, 1)
          }
        }
      }
      // 无冒号 say（续接对话）的 commandRaw 被 webgal-parser 误解为 speaker，
      // 不能回写 commandRaw，由 emitUpdate 内部保护逻辑清空
      const patch: Partial<ISentence> = {
        content: updatedSentence.content,
        args: nextArgs,
      }
      if (!options.isNoColonSay.value) {
        patch.commandRaw = updatedSentence.commandRaw
      }
      options.emitUpdate(patch)
      return
    }
    options.emitUpdate({ content: newContent })
  }

  function handleContentSelectChange(value: string) {
    handleContentChange(value === CUSTOM_CONTENT ? '' : value)
  }

  function getContentFieldSelectOptions(field: Extract<FieldDef, { type: 'choice' }>): { label: string, value: string }[] {
    return field.options.map(option => ({
      value: option.value,
      label: resolveI18n(option.label, t, options.parsed.value?.content),
    }))
  }

  // ─── 特殊内容（setVar / choose / applyStyle）───

  const setVarContent = computed(() => {
    const node = toValue(options.commandNode)
    if (node?.type === commandType.setVar) {
      return { name: node.name, value: node.value }
    }
    return parseSetVarContent(toValue(options.parsed)?.content ?? '')
  })

  const chooseItems = computed<ChooseContentItem[]>(() => {
    const node = toValue(options.commandNode)
    if (node?.type === commandType.choose) {
      return node.choices
    }
    return parseChooseContent(toValue(options.parsed)?.content ?? '')
  })

  const styleRuleItems = computed<StyleRuleContentItem[]>(() => {
    const node = toValue(options.commandNode)
    if (node?.type === commandType.applyStyle) {
      return node.rules
    }
    return parseStyleRuleContent(toValue(options.parsed)?.content ?? '')
  })

  function patchListItem<T>(items: T[], index: number, patch: Partial<T>): T[] | undefined {
    if (!items[index]) {
      return undefined
    }
    const cloned = [...items]
    cloned[index] = { ...cloned[index], ...patch }
    return cloned
  }

  function removeListItem<T>(items: T[], index: number): T[] | undefined {
    if (!items[index]) {
      return undefined
    }
    const cloned = [...items]
    cloned.splice(index, 1)
    return cloned
  }

  function handleSetVarNameChange(value: string | number) {
    handleContentChange(stringifySetVarContent(String(value), setVarContent.value.value))
  }

  function handleSetVarValueChange(value: string | number) {
    handleContentChange(stringifySetVarContent(setVarContent.value.name, String(value)))
  }

  function handleChooseNameChange(index: number, value: string | number) {
    const items = patchListItem(chooseItems.value, index, { name: String(value) })
    if (items) {
      handleContentChange(stringifyChooseContent(items))
    }
  }

  function handleChooseFileChange(index: number, file: string) {
    const items = patchListItem(chooseItems.value, index, { file })
    if (items) {
      handleContentChange(stringifyChooseContent(items))
    }
  }

  function handleRemoveChooseItem(index: number) {
    const items = removeListItem(chooseItems.value, index)
    if (items) {
      handleContentChange(stringifyChooseContent(items))
    }
  }

  function handleAddChooseItem() {
    const items: ChooseContentItem[] = [...chooseItems.value, { name: '', file: '' }]
    handleContentChange(stringifyChooseContent(items))
  }

  function handleStyleOldNameChange(index: number, value: string | number) {
    const items = patchListItem(styleRuleItems.value, index, { oldName: String(value) })
    if (items) {
      handleContentChange(stringifyStyleRuleContent(items))
    }
  }

  function handleStyleNewNameChange(index: number, value: string | number) {
    const items = patchListItem(styleRuleItems.value, index, { newName: String(value) })
    if (items) {
      handleContentChange(stringifyStyleRuleContent(items))
    }
  }

  function handleRemoveStyleRule(index: number) {
    const items = removeListItem(styleRuleItems.value, index)
    if (items) {
      handleContentChange(stringifyStyleRuleContent(items))
    }
  }

  function handleAddStyleRule() {
    const items: StyleRuleContentItem[] = [...styleRuleItems.value, { oldName: '', newName: '' }]
    handleContentChange(stringifyStyleRuleContent(items))
  }

  return {
    contentSelectValue,
    isCustomContent,
    pipeToNewline,
    newlineToPipe,
    isMultilineTextField,
    handleContentChange,
    handleContentSelectChange,
    getContentFieldSelectOptions,
    specialContent: {
      setVar: setVarContent,
      choose: chooseItems,
      styleRules: styleRuleItems,
      handleSetVarNameChange,
      handleSetVarValueChange,
      handleChooseNameChange,
      handleChooseFileChange,
      handleRemoveChooseItem,
      handleAddChooseItem,
      handleStyleOldNameChange,
      handleStyleNewNameChange,
      handleRemoveStyleRule,
      handleAddStyleRule,
    },
  }
}
