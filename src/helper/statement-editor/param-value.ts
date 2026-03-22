import { ArgField, CUSTOM_CONTENT, isFlagChoiceField, readArgFieldStorageKey, UNSPECIFIED } from '~/helper/command-registry/schema'
import { readJsonFieldValue } from '~/helper/statement-editor/json-fields'
import { hasCommandNodeParam, readCommandNodeParamValue } from '~/helper/webgal-script/params'
import { CommandNode } from '~/helper/webgal-script/types'

import type { arg } from 'webgal-parser/src/interface/sceneInterface'

function readFieldDefaultValue(field: ArgField['field']): string | boolean | number {
  return ('defaultValue' in field && field.defaultValue !== undefined) ? field.defaultValue : ''
}

export function getParamValueFromArgs(argField: ArgField, args: arg[]): string | boolean | number {
  const storageKey = readArgFieldStorageKey(argField)

  if (argField.jsonMeta) {
    const foundJsonArg = args.find(item => item.key === storageKey)
    if (!foundJsonArg || typeof foundJsonArg.value === 'boolean') {
      return readFieldDefaultValue(argField.field)
    }

    const fieldValue = readJsonFieldValue(String(foundJsonArg.value), argField.jsonMeta.fieldKey, argField.field.type)
    return fieldValue === '' || fieldValue === undefined
      ? readFieldDefaultValue(argField.field)
      : fieldValue
  }

  if (argField.field.type === 'choice' && isFlagChoiceField(argField.field)) {
    const optionValues = new Set(argField.field.options.map(option => option.value))
    const found = args.find(item => optionValues.has(item.key) && item.value === true)
    return found?.key ?? UNSPECIFIED
  }

  const found = args.find(item => item.key === storageKey)
  return found?.value ?? readFieldDefaultValue(argField.field)
}

// ─── 参数值与选项解析 ────────────────────────────

interface ParamSelectOptionItem {
  label: string
  value: string
}

interface ResolveParamSelectValueOptions {
  currentValue: string
  dynamicOptions: ParamSelectOptionItem[]
  hasExplicitValue: boolean
  argField: ArgField
  staticOptions: ParamSelectOptionItem[]
}

interface HasParamExplicitValueOptions {
  args?: arg[]
  commandNode?: CommandNode
  argField: ArgField
}

// 解析 choice 字段的实际选中值：
// 对于 customizable 的 choice 字段，当用户输入的值不在静态/动态选项列表中时，
// 返回 CUSTOM_CONTENT 标记以触发自定义输入框显示；
// 否则直接返回当前值或回退到 UNSPECIFIED
export function resolveParamSelectValue(options: ResolveParamSelectValueOptions): string {
  const { argField, currentValue, hasExplicitValue, dynamicOptions, staticOptions } = options
  const { field } = argField

  if (field.type !== 'choice' || isFlagChoiceField(field) || !field.customizable || !hasExplicitValue) {
    // 当无显式值且当前值为空时，若选项中包含 UNSPECIFIED 则回退到它
    if (!currentValue && staticOptions.some(o => o.value === UNSPECIFIED)) {
      return UNSPECIFIED
    }
    return currentValue
  }

  const isMatched = dynamicOptions.some(o => o.value === currentValue)
    || staticOptions.some(o => o.value === currentValue)
  return isMatched ? currentValue : CUSTOM_CONTENT
}

export function hasParamExplicitValue(options: HasParamExplicitValueOptions): boolean {
  const { commandNode, args, argField } = options

  if (commandNode) {
    if (argField.jsonMeta) {
      return hasCommandNodeParam(commandNode, argField.jsonMeta.argKey)
    }
    if (argField.field.type === 'choice' && isFlagChoiceField(argField.field)) {
      return argField.field.options.some(option => hasCommandNodeParam(commandNode, option.value))
    }
    if (argField.field.type === 'choice' && !isFlagChoiceField(argField.field) && argField.field.customizable) {
      return readCommandNodeParamValue(commandNode, { key: argField.field.key, type: 'select' }) !== undefined
    }
    return hasCommandNodeParam(commandNode, readArgFieldStorageKey(argField))
  }

  if (!args) {
    return false
  }

  if (argField.jsonMeta) {
    const argItem = args.find(item => item.key === argField.jsonMeta!.argKey)
    if (!argItem || typeof argItem.value === 'boolean') {
      return false
    }
    return !!readJsonFieldValue(String(argItem.value), argField.jsonMeta.fieldKey)
  }

  if (argField.field.type === 'choice' && isFlagChoiceField(argField.field)) {
    const optionValues = new Set(argField.field.options.map(option => option.value))
    return args.some(item => optionValues.has(item.key) && item.value === true)
  }
  return args.some(item => item.key === readArgFieldStorageKey(argField))
}
