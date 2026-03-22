import { commandType } from 'webgal-parser/src/interface/sceneInterface'

import { ArgField, isFlagChoiceField, readArgFieldStorageKey } from '~/helper/command-registry/schema'
import { getParamValueFromArgs } from '~/helper/statement-editor/param-value'

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
  const { argField, argFields, content, readParamValue } = options
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

  const dependencyValue = readParamValue(dependency)
  if (visibleWhen.notEmpty) {
    return !!dependencyValue && dependencyValue !== ''
  }
  if (visibleWhen.empty) {
    return !dependencyValue || dependencyValue === ''
  }
  return dependencyValue === visibleWhen.value
}

export function isParamVisibleByArgs(options: IsParamVisibleOptions): boolean {
  return isParamVisibleByReader({
    ...options,
    readParamValue: argField => getParamValueFromArgs(argField, options.args),
  })
}

// ─── 依赖参数清理 ────────────────────────────────

function removeArgsForParam(nextArgs: arg[], argField: ArgField): void {
  const storageKey = readArgFieldStorageKey(argField)
  for (let i = nextArgs.length - 1; i >= 0; i--) {
    const item = nextArgs[i]
    if (item.key === storageKey) {
      nextArgs.splice(i, 1)
      continue
    }
    if (argField.field.type === 'choice' && isFlagChoiceField(argField.field) && argField.field.options.some(option => option.value === item.key)) {
      nextArgs.splice(i, 1)
    }
  }
}

interface PruneHiddenDependentArgsByReaderOptions {
  args: arg[]
  changedField: ArgField
  newValue: string | boolean | number
  argFields: ArgField[]
  content?: string
  readParamValue: (argField: ArgField) => ParamRuntimeValue
}

// 当某个参数值变更后，清理因此变为不可见的依赖参数。
// 例如：vocal 字段清空后，依赖 vocal 的 volume 字段应从 args 中移除，
// 避免脚本中残留无意义的参数
export function pruneHiddenDependentArgsByReader(options: PruneHiddenDependentArgsByReaderOptions): arg[] {
  const { args, changedField, newValue, argFields, content = '', readParamValue } = options

  if (argFields.length === 0) {
    return args
  }

  const nextArgs = [...args]
  const readValueWithOverride = (argField: ArgField): ParamRuntimeValue => {
    return argField.field.key === changedField.field.key ? newValue : readParamValue(argField)
  }

  for (const dep of argFields) {
    if (dep.field.visibleWhen?.key !== changedField.field.key) {
      continue
    }

    const shouldVisible = isParamVisibleByReader({
      argField: dep,
      argFields,
      content,
      readParamValue: readValueWithOverride,
    })
    if (!shouldVisible) {
      removeArgsForParam(nextArgs, dep)
    }
  }
  return nextArgs
}

export function pruneHiddenDependentArgs(
  args: arg[],
  changedField: ArgField,
  newValue: string | boolean | number,
  argFields: ArgField[],
  content = '',
): arg[] {
  return pruneHiddenDependentArgsByReader({
    args,
    changedField,
    newValue,
    argFields,
    content,
    readParamValue: argField => getParamValueFromArgs(argField, args),
  })
}
