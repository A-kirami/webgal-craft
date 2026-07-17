import { hasCommandNodeParam } from '~/domain/script/params'
import { CommandNode } from '~/domain/script/types'
import { ArgField, isFlagChoiceField, readArgFieldStorageKey, UNSPECIFIED } from '~/features/editor/command-registry/schema'
import { readJsonFieldValue } from '~/features/editor/statement-editor/json-fields'

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
  hasExplicitValue: boolean
  staticOptions: ParamSelectOptionItem[]
}

interface HasParamExplicitValueOptions {
  commandNode?: CommandNode
  argField: ArgField
}

export function resolveParamSelectValue(options: ResolveParamSelectValueOptions): string {
  const { currentValue, hasExplicitValue, staticOptions } = options

  if (!hasExplicitValue && !currentValue && staticOptions.some(o => o.value === UNSPECIFIED)) {
    return UNSPECIFIED
  }

  return currentValue
}

export function hasParamExplicitValue(options: HasParamExplicitValueOptions): boolean {
  const { commandNode, argField } = options
  if (!commandNode) {
    return false
  }

  if (argField.jsonMeta) {
    return hasCommandNodeParam(commandNode, argField.jsonMeta.argKey)
  }
  if (argField.field.type === 'choice' && isFlagChoiceField(argField.field)) {
    return argField.field.options.some(option => hasCommandNodeParam(commandNode, option.value))
  }
  return hasCommandNodeParam(commandNode, readArgFieldStorageKey(argField))
}
