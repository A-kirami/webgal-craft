import { commandType } from 'webgal-parser/src/interface/sceneInterface'

import {
  EFFECT_CATEGORIES,
  fieldsToTransform,
  getValueByPath,
  setValueByPath,
  transformToFields,
  unsetValueByPath,
} from '~/features/editor/effect-editor/effect-editor-config'

import type { Transform } from '~/domain/stage/types'

export type TransformFieldPath = string
export type TransformBaselineSource = 'protocol' | 'base' | 'unknown'
export type TransformFieldSource = 'explicit' | 'inherited' | 'base' | 'editor-default'

export interface SelectTransformBaselineOptions {
  baseTransform?: Transform
  command: commandType
  targetTransform?: Transform
  writeDefault: boolean
}

export interface ResolveTransformDraftDisplayOptions {
  baselineSource?: TransformBaselineSource
  baselineTransform?: Transform
  editorDefaultTransform?: Transform
  explicitDraftTransform: Transform
}

export interface ResolvedTransformBaseline {
  baselineSource: TransformBaselineSource
  baselineTransform?: Transform
}

export interface ResolvedTransformDraft {
  baselineSource: TransformBaselineSource
  baselineTransform?: Transform
  displayTransform: Transform
  editorDefaultTransform?: Transform
  explicitDraftTransform: Transform
  fieldSources: Partial<Record<TransformFieldPath, TransformFieldSource>>
}

export type TransformDraftChange =
  | {
    path: TransformFieldPath
    type: 'clear-field'
  }
  | {
    path: TransformFieldPath
    type: 'set-field'
    value: number | string
  }
  | {
    fields: Record<TransformFieldPath, number | string | undefined>
    type: 'set-fields'
  }

export interface MaterializeTransformDraftChangeOptions {
  change: TransformDraftChange
  explicitDraftTransform: Transform
}

export const TRANSFORM_FIELD_PATHS = Object.freeze(resolveTransformFieldPaths())
const EDITOR_DEFAULT_TRANSFORM = createEditorDefaultTransform()

export function isSetTransformCommand(command: commandType): boolean {
  return command === commandType.setTransform
}

function resolveTransformFieldPaths(): TransformFieldPath[] {
  const paths = new Set<TransformFieldPath>()

  for (const category of EFFECT_CATEGORIES) {
    for (const param of category.params) {
      if (param.type === 'color') {
        for (const path of param.colorPaths ?? []) {
          paths.add(path)
        }
        continue
      }

      paths.add(param.key)
      if ('linkedPairKey' in param && param.linkedPairKey) {
        paths.add(param.linkedPairKey)
      }
    }
  }

  return [...paths]
}

function createEditorDefaultTransform(): Transform {
  const fields: Record<string, string> = {}

  for (const category of EFFECT_CATEGORIES) {
    for (const param of category.params) {
      if (param.type === 'color') {
        const paths = param.colorPaths ?? []
        const defaults = param.colorDefaults ?? []
        for (const [index, path] of paths.entries()) {
          const value = defaults[index]
          if (value !== undefined) {
            fields[path] = String(value)
          }
        }
        continue
      }

      if ('defaultValue' in param && param.defaultValue !== undefined) {
        fields[param.key] = String(param.defaultValue)
      }
    }
  }

  return fieldsToTransform(fields)
}

export function cloneTransform(transform: Transform = {}): Transform {
  return structuredClone(toRaw(transform))
}

function writeField(
  transform: Transform,
  path: TransformFieldPath,
  value: string | number,
): void {
  const partialTransform = fieldsToTransform({ [path]: String(value) })
  setValueByPath(
    transform as unknown as Record<string, unknown>,
    path,
    getValueByPath(partialTransform as unknown as Record<string, unknown>, path),
  )
}

function getTransformFields(transform: Transform | undefined): Record<string, string> {
  return transform ? transformToFields(transform) : {}
}

function writeFieldMapValue(
  transform: Transform,
  path: TransformFieldPath,
  value: number | string | undefined,
): void {
  if (value === undefined || value === '') {
    unsetValueByPath(transform as unknown as Record<string, unknown>, path)
    return
  }

  const partialTransform = fieldsToTransform({ [path]: String(value) })
  const nextValue = getValueByPath(partialTransform as unknown as Record<string, unknown>, path)

  if (nextValue === undefined) {
    unsetValueByPath(transform as unknown as Record<string, unknown>, path)
    return
  }

  setValueByPath(
    transform as unknown as Record<string, unknown>,
    path,
    nextValue,
  )
}

export function mergeTransformBaseline(
  baseTransform: Transform,
  targetTransform: Transform,
): Transform {
  const baselineTransform: Transform = {}
  const baseFields = transformToFields(baseTransform)
  const targetFields = transformToFields(targetTransform)

  for (const path of TRANSFORM_FIELD_PATHS) {
    const baseValue = baseFields[path]
    if (baseValue === undefined) {
      continue
    }

    const targetValue = targetFields[path]
    if (targetValue !== undefined) {
      writeField(baselineTransform, path, targetValue)
      continue
    }

    writeField(baselineTransform, path, baseValue)
  }

  return baselineTransform
}

export function selectTransformBaseline(
  options: SelectTransformBaselineOptions,
): ResolvedTransformBaseline {
  if (!isSetTransformCommand(options.command) || options.writeDefault) {
    return {
      baselineSource: options.baseTransform ? 'base' : 'unknown',
      baselineTransform: options.baseTransform ? cloneTransform(options.baseTransform) : undefined,
    }
  }

  if (!options.baseTransform || !options.targetTransform) {
    return {
      baselineSource: 'unknown',
    }
  }

  return {
    baselineSource: 'protocol',
    baselineTransform: mergeTransformBaseline(options.baseTransform, options.targetTransform),
  }
}

export function getEditorDefaultTransform(): Transform {
  return cloneTransform(EDITOR_DEFAULT_TRANSFORM)
}

export function resolveTransformDraftDisplay(
  options: ResolveTransformDraftDisplayOptions,
): ResolvedTransformDraft {
  const explicitFields = getTransformFields(options.explicitDraftTransform)
  const baselineFields = getTransformFields(options.baselineTransform)
  const editorDefaultFields = getTransformFields(options.editorDefaultTransform ?? EDITOR_DEFAULT_TRANSFORM)
  const displayFields: Record<string, string> = {}
  const fieldSources: Partial<Record<TransformFieldPath, TransformFieldSource>> = {}
  const baselineSource = options.baselineSource ?? 'unknown'

  for (const path of TRANSFORM_FIELD_PATHS) {
    const explicitValue = explicitFields[path]
    if (explicitValue !== undefined) {
      displayFields[path] = explicitValue
      fieldSources[path] = 'explicit'
      continue
    }

    const baselineValue = baselineFields[path]
    if (baselineValue !== undefined) {
      displayFields[path] = baselineValue
      fieldSources[path] = baselineSource === 'base' ? 'base' : 'inherited'
      continue
    }

    const editorDefaultValue = editorDefaultFields[path]
    if (editorDefaultValue !== undefined) {
      displayFields[path] = editorDefaultValue
      fieldSources[path] = 'editor-default'
    }
  }

  return {
    baselineSource,
    baselineTransform: options.baselineTransform
      ? cloneTransform(options.baselineTransform)
      : undefined,
    displayTransform: fieldsToTransform(displayFields),
    editorDefaultTransform: options.editorDefaultTransform
      ? cloneTransform(options.editorDefaultTransform)
      : undefined,
    explicitDraftTransform: cloneTransform(options.explicitDraftTransform),
    fieldSources,
  }
}

export function materializeTransformDraftChange(
  options: MaterializeTransformDraftChangeOptions,
): Transform {
  const nextDraft = cloneTransform(options.explicitDraftTransform)

  switch (options.change.type) {
    case 'clear-field': {
      writeFieldMapValue(nextDraft, options.change.path, undefined)
      break
    }
    case 'set-field': {
      writeFieldMapValue(nextDraft, options.change.path, options.change.value)
      break
    }
    case 'set-fields': {
      for (const [path, value] of Object.entries(options.change.fields)) {
        writeFieldMapValue(nextDraft, path, value)
      }
      break
    }
    default: {
      const neverChange: never = options.change
      return neverChange
    }
  }

  return nextDraft
}
