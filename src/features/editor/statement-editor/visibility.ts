import { commandType } from 'webgal-parser/src/interface/sceneInterface'

import { ArgField, isFlagChoiceField, readArgFieldStorageKey } from '~/features/editor/command-registry/schema'
import { getParamValueFromArgs } from '~/features/editor/statement-editor/param-value'

import type { arg } from 'webgal-parser/src/interface/sceneInterface'

type ParamRuntimeValue = string | boolean | number | undefined

// ─── schema key 集合 ─────────────────────────────

export function buildSchemaKeySet(argFields: ArgField[]): Set<string> {
  const keys = new Set<string>()
  for (const argField of argFields) {
    keys.add(readArgFieldStorageKey(argField))
    if (argField.field.type === 'choice' && isFlagChoiceField(argField.field)) {
      for (const option of argField.field.options) {
        keys.add(option.value)
      }
    }
  }
  return keys
}

// ─── extraArgs 过滤 ──────────────────────────────

interface FilterExtraArgsOptions {
  args: arg[]
  argFields: ArgField[]
  command: commandType
  excludeControlArgs: boolean
}

export function filterExtraArgs(options: FilterExtraArgsOptions): arg[] {
  const schemaKeys = buildSchemaKeySet(options.argFields)

  return options.args.filter((item) => {
    if (options.excludeControlArgs && (item.key === 'next' || item.key === 'continue')) {
      return false
    }
    if (options.command === commandType.say && item.key === 'speaker') {
      return false
    }
    return !schemaKeys.has(item.key)
  })
}

// ─── 参数可见性 ──────────────────────────────────

interface IsParamVisibleOptions {
  argField: ArgField
  argFields: ArgField[]
  args: arg[]
  content: string
}

interface IsParamVisibleByReaderOptions {
  argField: ArgField
  argFields: ArgField[]
  content: string
  readParamValue: (argField: ArgField) => ParamRuntimeValue
}

export function isParamVisibleByReader(options: IsParamVisibleByReaderOptions): boolean {
  const { argFields, content, readParamValue } = options

  function isVisible(argField: ArgField, resolving: Set<ArgField>): boolean {
    if (resolving.has(argField)) {
      return false
    }
    if (argField.field.visibleWhenContent && !argField.field.visibleWhenContent(content)) {
      return false
    }

    const { visibleWhen } = argField.field
    if (!visibleWhen) {
      return true
    }

    const dependency = argFields.find(af => af.field.key === visibleWhen.key)
    if (!dependency) {
      return true
    }

    const nextResolving = new Set(resolving).add(argField)
    if (!isVisible(dependency, nextResolving)) {
      return false
    }

    const dependencyValue = readParamValue(dependency)
    if (visibleWhen.notEmpty) {
      return !!dependencyValue && dependencyValue !== ''
    }
    if (visibleWhen.empty) {
      return !dependencyValue || dependencyValue === ''
    }
    return dependencyValue === visibleWhen.value
  }

  return isVisible(options.argField, new Set())
}

export function isParamVisibleByArgs(options: IsParamVisibleOptions): boolean {
  return isParamVisibleByReader({
    ...options,
    readParamValue: argField => getParamValueFromArgs(argField, options.args),
  })
}
