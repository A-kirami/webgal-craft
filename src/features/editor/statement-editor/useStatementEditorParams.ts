import { removeArg, setOrRemoveArg, upsertArg } from '~/domain/script/arg-utils'
import { serializeCommandNode } from '~/domain/script/codec'
import { readCommandNodeParamValue } from '~/domain/script/params'
import { CommandNode } from '~/domain/script/types'
import { updateCommandNodeParam } from '~/domain/script/update'
import { ArgField, CUSTOM_CONTENT, DynamicOptionsContext, EditorField, isFlagChoiceField, readArgFieldStorageKey, resolveI18n, UNSPECIFIED } from '~/features/editor/command-registry/schema'
import { resolveDynamicOptions } from '~/features/editor/dynamic-options/dynamic-options'
import { readJsonFieldValue, writeJsonFieldValue } from '~/features/editor/statement-editor/json-fields'
import { getParamValueFromArgs, hasParamExplicitValue, resolveParamSelectValue } from '~/features/editor/statement-editor/param-value'
import { isParamVisibleByReader, pruneHiddenDependentArgsByReader } from '~/features/editor/statement-editor/visibility'
import { useWorkspaceStore } from '~/stores/workspace'

import type { arg, ISentence } from 'webgal-parser/src/interface/sceneInterface'

export interface UseStatementEditorParamsOptions {
  parsed: ComputedRef<ISentence | undefined>
  commandNode: ComputedRef<CommandNode | undefined>
  argFields: ComputedRef<ArgField[]>
  fileMissingKeys: Readonly<Ref<Set<string>>>
  readEditableArgs: () => arg[]
  emitUpdate: (patch: Partial<ISentence>) => void
}

/**
 * 参数读写逻辑，从 useStatementEditor 提取。
 */
export function useStatementEditorParams(opts: UseStatementEditorParamsOptions) {
  const { t } = useI18n()

  function resolveFieldArgField(field: EditorField): ArgField | undefined {
    return field.storage === 'arg' ? field.argField : undefined
  }

  function readArgDefaultValue(argField: ArgField): string | boolean | number {
    return ('defaultValue' in argField.field && argField.field.defaultValue !== undefined)
      ? argField.field.defaultValue
      : ''
  }

  function toScriptParam(argField: ArgField): { key: string, type: string, defaultValue?: string | boolean | number } {
    return {
      key: argField.field.key,
      type: argField.field.type === 'choice' ? 'select' : argField.field.type,
      defaultValue: 'defaultValue' in argField.field ? argField.field.defaultValue : undefined,
    }
  }

  function readArgRuntimeValue(argField: ArgField): string | boolean | number | undefined {
    if (opts.commandNode.value) {
      if (argField.jsonMeta) {
        const parentValue = readCommandNodeParamValue(opts.commandNode.value, { key: argField.jsonMeta.argKey, type: 'text' })
        if (parentValue !== undefined) {
          return readJsonFieldValue(String(parentValue), argField.jsonMeta.fieldKey, argField.field.type)
        }
      } else {
        const typedValue = readCommandNodeParamValue(opts.commandNode.value, toScriptParam(argField))
        if (typedValue !== undefined) {
          return typedValue
        }
      }
    }
    return opts.parsed.value ? getParamValueFromArgs(argField, opts.parsed.value.args) : undefined
  }

  function getArgValue(argField: ArgField): string | boolean | number {
    const runtimeValue = readArgRuntimeValue(argField)
    if (runtimeValue !== undefined && runtimeValue !== '') {
      return runtimeValue
    }
    return readArgDefaultValue(argField)
  }

  function getArgSelectOptions(argField: ArgField): { label: string, value: string }[] {
    if (argField.field.type !== 'choice') {
      return []
    }
    return argField.field.options.map(option => ({
      label: resolveI18n(option.label, t, opts.parsed.value?.content),
      value: option.value,
    }))
  }

  function createDynamicOptionsContext(): DynamicOptionsContext {
    const workspaceStore = useWorkspaceStore()
    return {
      content: opts.parsed.value?.content ?? '',
      gamePath: workspaceStore.CWD ?? '',
    }
  }

  function getArgDynamicOptions(argField: ArgField): { label: string, value: string }[] {
    const key = 'dynamicOptionsKey' in argField.field ? argField.field.dynamicOptionsKey : undefined
    if (!key) {
      return []
    }
    const result = resolveDynamicOptions(key, createDynamicOptionsContext())
    return result?.options ?? []
  }

  function getArgSelectValue(argField: ArgField): string {
    return resolveParamSelectValue({
      argField,
      currentValue: String(getArgValue(argField) || ''),
      hasExplicitValue: hasParamExplicitValue({
        argField,
        commandNode: opts.commandNode.value,
        args: opts.parsed.value?.args,
      }),
      dynamicOptions: getArgDynamicOptions(argField),
      staticOptions: getArgSelectOptions(argField),
    })
  }

  function isArgCustom(argField: ArgField): boolean {
    return argField.field.type === 'choice'
      && argField.field.customizable === true
      && getArgSelectValue(argField) === CUSTOM_CONTENT
  }

  function handleArgSelectChange(argField: ArgField, value: string) {
    if (
      argField.field.type === 'choice'
      && argField.field.customizable
      && value === CUSTOM_CONTENT
    ) {
      return
    }
    handleArgFieldChange(argField, value)
  }

  function isArgVisible(argField: ArgField): boolean {
    return isParamVisibleByReader({
      argField,
      argFields: opts.argFields.value,
      content: opts.parsed.value?.content ?? '',
      readParamValue: readArgRuntimeValue,
    })
  }

  function removeHiddenArgs(newArgs: arg[], changedField: ArgField, newValue: string | boolean | number) {
    const pruned = pruneHiddenDependentArgsByReader({
      args: newArgs,
      changedField,
      newValue,
      argFields: opts.argFields.value,
      content: opts.parsed.value?.content ?? '',
      readParamValue: (af: ArgField) => af.field.key === changedField.field.key ? newValue : readArgRuntimeValue(af),
    })
    if (pruned.length !== newArgs.length) {
      newArgs.splice(0, newArgs.length, ...pruned)
    }
  }

  function normalizeSchemaParamValue(newValue: string | boolean | number): string | boolean | number {
    return (typeof newValue === 'string' && newValue === UNSPECIFIED) ? '' : newValue
  }

  // ─── CommandNode 通用更新路径 ───

  function tryUpdateViaCommandNode(
    argField: ArgField,
    normalizedValue: string | boolean | number,
  ): boolean {
    if (!opts.commandNode.value) {
      return false
    }
    const updatedNode = updateCommandNodeParam(
      opts.commandNode.value,
      toScriptParam(argField),
      normalizedValue,
    )
    if (!updatedNode) {
      return false
    }
    const updatedSentence = serializeCommandNode(updatedNode)
    const nextArgs = [...updatedSentence.args]
    removeHiddenArgs(nextArgs, argField, normalizedValue)
    opts.emitUpdate({
      commandRaw: updatedSentence.commandRaw,
      content: updatedSentence.content,
      args: nextArgs,
    })
    return true
  }

  // ─── handleArgFieldChange 子函数 ───

  function handleJsonMetaFieldChange(
    argField: ArgField,
    normalizedValue: string | boolean | number,
    newArgs: arg[],
  ) {
    const { argKey, fieldKey } = argField.jsonMeta!
    const idx = newArgs.findIndex(a => a.key === argKey)
    const currentRawValue = idx === -1 ? '{}' : String(newArgs[idx].value ?? '{}')
    const nextJsonValue = writeJsonFieldValue(currentRawValue, fieldKey, normalizedValue, argField.field.type)

    if (nextJsonValue === '') {
      removeArg(newArgs, argKey)
    } else {
      upsertArg(newArgs, argKey, nextJsonValue)
    }

    removeHiddenArgs(newArgs, argField, normalizedValue)
    opts.emitUpdate({ args: newArgs })
  }

  function handleFlagChoiceFallback(
    argField: ArgField,
    normalizedValue: string | boolean | number,
    newArgs: arg[],
  ) {
    const field = argField.field as Extract<typeof argField.field, { type: 'choice' }>
    const optionValues = new Set(field.options.map(o => o.value))
    for (let i = newArgs.length - 1; i >= 0; i--) {
      if (optionValues.has(newArgs[i].key) && newArgs[i].value === true) {
        newArgs.splice(i, 1)
      }
    }

    const strVal = String(normalizedValue)
    if (strVal !== '') {
      newArgs.push({ key: strVal, value: true })
    }
    removeHiddenArgs(newArgs, argField, normalizedValue)
    opts.emitUpdate({ args: newArgs })
  }

  function handleNormalFieldFallback(
    argField: ArgField,
    normalizedValue: string | boolean | number,
    newArgs: arg[],
  ) {
    const storageKey = readArgFieldStorageKey(argField)
    const defaultValue = 'defaultValue' in argField.field ? argField.field.defaultValue : undefined

    if (argField.field.type === 'switch') {
      if (normalizedValue === true) {
        upsertArg(newArgs, storageKey, true)
      } else {
        removeArg(newArgs, storageKey)
      }
    } else {
      setOrRemoveArg(newArgs, storageKey, String(normalizedValue), defaultValue)
    }

    removeHiddenArgs(newArgs, argField, normalizedValue)
    opts.emitUpdate({ args: newArgs })
  }

  function handleArgFieldChange(argField: ArgField, newValue: string | boolean | number) {
    if (!opts.parsed.value) {
      return
    }

    const normalizedValue = normalizeSchemaParamValue(newValue)
    const newArgs = opts.readEditableArgs()

    if (argField.jsonMeta) {
      handleJsonMetaFieldChange(argField, normalizedValue, newArgs)
      return
    }

    if (argField.field.type === 'choice' && isFlagChoiceField(argField.field)) {
      if (tryUpdateViaCommandNode(argField, normalizedValue)) {
        return
      }
      handleFlagChoiceFallback(argField, normalizedValue, newArgs)
      return
    }

    if (tryUpdateViaCommandNode(argField, normalizedValue)) {
      return
    }
    handleNormalFieldFallback(argField, normalizedValue, newArgs)
  }

  function isArgFileMissing(argField: ArgField): boolean {
    if (argField.field.type !== 'file') {
      return false
    }
    return opts.fileMissingKeys.value.has(readArgFieldStorageKey(argField))
  }

  return {
    resolveFieldArgField,
    getArgValue,
    getArgDynamicOptions,
    getArgSelectOptions,
    getArgSelectValue,
    isArgCustom,
    handleArgSelectChange,
    isArgVisible,
    handleArgFieldChange,
    isArgFileMissing,
    readArgRuntimeValue,
    createDynamicOptionsContext,
  }
}
