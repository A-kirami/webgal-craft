import { commandType } from 'webgal-parser/src/interface/sceneInterface'

import { parseCommandNode } from '~/domain/script/codec'
import { readSayFigureTargetId } from '~/domain/script/say-figure'
import { SAY_FIGURE_POSITIONS } from '~/domain/script/types'
import { resolveAutocompleteOptions } from '~/features/editor/command-registry/autocomplete-options'
import { isFlagChoiceField, readArgFieldStorageKey, resolveI18n } from '~/features/editor/command-registry/schema'
import { getActiveEffectCategories } from '~/features/editor/effect-editor/effect-editor-config'

import type { arg, ISentence } from 'webgal-parser/src/interface/sceneInterface'
import type { ArgField, EditorField, FieldDef, I18nT } from '~/features/editor/command-registry/schema'
import type { SceneAutocompleteOptions } from '~/features/editor/statement-editor/scene-autocomplete'

export type StatementCardType = 'empty' | 'comment' | 'say' | 'command' | 'unsupported'

export interface StatementCardPreviewParam {
  label: string
  value: string
  color?: string
  isFile?: boolean
  fileMissing?: boolean
  truncate?: boolean
  isEffect?: boolean
  effectIcon?: string
}

interface BuildStatementPreviewParamsInput {
  argFields: ArgField[]
  contentField?: EditorField
  entryRawText: string
  fileMissingKeys: Set<string>
  parsed?: ISentence
  previousSpeaker?: string
  statementType: StatementCardType
  t: I18nT
  autocompleteOptions: SceneAutocompleteOptions
}

function resolveArgDisplayLabel(
  argFieldByStorageKey: Map<string, ArgField>,
  key: string,
  allArgFields: ArgField[],
  t: I18nT,
  content: string,
): string {
  const argField = argFieldByStorageKey.get(key)
  if (argField) {
    return resolveI18n(argField.field.label, t, content)
  }

  const parentFlagField = allArgFields.find(field =>
    field.field.type === 'choice'
    && isFlagChoiceField(field.field)
    && field.field.options.some(option => option.value === key))
  if (parentFlagField) {
    return resolveI18n(parentFlagField.field.label, t, content)
  }

  return key
}

function resolveArgDisplayValue(
  argFieldByStorageKey: Map<string, ArgField>,
  key: string,
  value: string,
  t: I18nT,
  content: string,
  autocompleteOptions: SceneAutocompleteOptions,
): string {
  const argField = argFieldByStorageKey.get(key)
  if (!argField) {
    return value
  }

  return resolveFieldDisplayValue(argField.field, value, t, content, autocompleteOptions)
}

function resolveFieldDisplayValue(
  field: FieldDef,
  value: string,
  t: I18nT,
  content: string,
  autocompleteOptions: SceneAutocompleteOptions,
): string {
  if (field.type === 'choice') {
    const option = field.options.find(option => option.value === value)
    return option ? resolveI18n(option.label, t, content) : value
  }
  if (field.type === 'text' && field.autocomplete) {
    return resolveAutocompleteOptions(field.autocomplete, {
      content,
      sceneOptions: autocompleteOptions,
      t,
    })
      .find(option => option.value === value)
      ?.label ?? value
  }

  return value
}

function readPreviewArgs(parsed: ISentence): arg[] {
  if (parsed.command !== commandType.say) {
    return parsed.args
  }

  const node = parseCommandNode(parsed)
  if (node.type !== commandType.say) {
    return parsed.args
  }
  const figureTargetId = readSayFigureTargetId(node)
  if (!figureTargetId) {
    return parsed.args
  }

  let insertedFigureId = false
  return parsed.args.flatMap((item) => {
    if (!isSayFigureArg(item)) {
      return item
    }
    if (insertedFigureId) {
      return []
    }

    insertedFigureId = true
    return { key: 'figureId', value: figureTargetId }
  })
}

function isSayFigureArg(item: arg): boolean {
  return item.key === 'figureId'
    || (item.value === true && (SAY_FIGURE_POSITIONS as readonly string[]).includes(item.key))
}

export function buildStatementPreviewParams(input: BuildStatementPreviewParamsInput): StatementCardPreviewParam[] {
  const {
    argFields,
    autocompleteOptions,
    contentField,
    entryRawText,
    fileMissingKeys,
    parsed,
    previousSpeaker,
    statementType,
    t,
  } = input

  if (!parsed) {
    return []
  }

  if (statementType === 'unsupported') {
    return [{ label: '', value: entryRawText.trim() }]
  }

  const params: StatementCardPreviewParam[] = []
  const { content } = parsed

  const argFieldByStorageKey = new Map<string, ArgField>()
  const flattenedJsonParamsByArgKey = new Map<string, ArgField[]>()
  for (const argField of argFields) {
    if (argField.jsonMeta) {
      const list = flattenedJsonParamsByArgKey.get(argField.jsonMeta.argKey)
      if (list) {
        list.push(argField)
      } else {
        flattenedJsonParamsByArgKey.set(argField.jsonMeta.argKey, [argField])
      }
      continue
    }
    argFieldByStorageKey.set(readArgFieldStorageKey(argField), argField)
  }

  const contentDefinition = contentField?.field
  const isFileContent = content.length > 0 && contentDefinition?.type === 'file'
  if (content.length > 0 && contentDefinition?.managedByEffectEditor) {
    const categories = getActiveEffectCategories(content)
    for (const category of categories) {
      params.push({
        label: '',
        value: resolveI18n(category.label, t, content),
        isEffect: true,
        effectIcon: category.icon,
      })
    }
  } else if (content.length > 0) {
    const unit = contentDefinition && 'unit' in contentDefinition ? ` ${resolveI18n(contentDefinition.unit, t, content)}` : ''
    if (parsed.command === commandType.choose) {
      const items = content.split('|').filter(Boolean)
      for (const item of items) {
        const [optionName, sceneFile] = item.split(':')
        if (!optionName && !sceneFile) {
          continue
        }
        params.push({ label: optionName ?? '', value: sceneFile ?? '' })
      }
    } else if (parsed.command === commandType.applyStyle) {
      const rules = content.split(',').filter(Boolean)
      for (const rule of rules) {
        const [oldName, newName] = rule.split('->')
        if (!oldName && !newName) {
          continue
        }
        params.push({ label: oldName ?? '', value: newName ?? '' })
      }
    } else if (statementType === 'say') {
      let speaker: string
      const hasColon = entryRawText.includes(':')
      if (!hasColon) {
        // 无冒号简写：继承上一个说话人
        speaker = previousSpeaker || ''
      } else if (parsed.commandRaw === '') {
        // :xxx 格式：旁白
        speaker = ''
      } else if (parsed.commandRaw === 'say') {
        // 标准 say: 写法：从 args 取 speaker，否则继承
        const speakerArg = parsed.args.find((a: arg) => a.key === 'speaker')
        const hasClear = parsed.args.some((a: arg) => a.key === 'clear' && a.value === true)
        if (speakerArg) {
          speaker = String(speakerArg.value)
        } else if (hasClear) {
          speaker = ''
        } else {
          speaker = previousSpeaker || ''
        }
      } else {
        // 简写：角色名:对话
        speaker = parsed.commandRaw
      }
      params.push({
        label: speaker || t('edit.visualEditor.types.narration'),
        value: content,
        truncate: true,
      })
    } else if (contentDefinition?.type === 'switch') {
      const switchLabel = content === contentDefinition.onValue
        ? contentDefinition.label
        : contentDefinition.offLabel
      if (switchLabel) {
        params.push({ label: '', value: resolveI18n(switchLabel, t, content) })
      }
    } else {
      const displayValue = contentDefinition
        ? `${resolveFieldDisplayValue(contentDefinition, content, t, content, autocompleteOptions)}${unit}`
        : `${content}${unit}`
      params.push({
        label: '',
        value: displayValue,
        isFile: isFileContent,
        fileMissing: isFileContent && fileMissingKeys.has('__content__'),
      })
    }
  }

  const visibleArgs = readPreviewArgs(parsed)
    .filter((item: arg) => item.key !== 'next' && item.key !== 'continue')
    .filter((item: arg) => !(parsed.command === commandType.say && item.key === 'speaker'))
    .filter((item: arg) => {
      const argField = argFieldByStorageKey.get(item.key)
      const defaultValue = argField && 'defaultValue' in argField.field ? argField.field.defaultValue : undefined
      return defaultValue === undefined || String(item.value) !== String(defaultValue)
    })
    .slice(0, 8)

  for (const item of visibleArgs) {
    const argField = argFieldByStorageKey.get(item.key)

    if (parsed.command === commandType.choose && item.key === 'defaultChoose') {
      const node = parseCommandNode(parsed)
      if (node.type === commandType.choose && node.defaultChoose !== undefined) {
        const choice = node.choices[node.defaultChoose - 1]
        if (choice) {
          params.push({
            label: resolveArgDisplayLabel(argFieldByStorageKey, item.key, argFields, t, content),
            value: choice.name || t('edit.visualEditor.unnamedChoice'),
          })
        }
      }
      continue
    }

    if (argField?.field.managedByEffectEditor && typeof item.value === 'string' && item.value.startsWith('{')) {
      const categories = getActiveEffectCategories(item.value)
      for (const category of categories) {
        params.push({
          label: '',
          value: resolveI18n(category.label, t, item.value),
          isEffect: true,
          effectIcon: category.icon,
        })
      }
      continue
    }

    const flattenedParams = flattenedJsonParamsByArgKey.get(item.key)
    if (flattenedParams && typeof item.value === 'string') {
      try {
        const parsedValue = JSON.parse(String(item.value)) as Record<string, unknown>
        for (const jsonField of flattenedParams) {
          const fieldKey = jsonField.jsonMeta?.fieldKey
          if (!fieldKey) {
            continue
          }
          const fieldValue = parsedValue[fieldKey]
          if (fieldValue === undefined || fieldValue === '') {
            continue
          }
          const fieldUnit = 'unit' in jsonField.field ? ` ${resolveI18n(jsonField.field.unit, t, content)}` : ''
          const displayValue = resolveFieldDisplayValue(jsonField.field, String(fieldValue), t, content, autocompleteOptions)
          params.push({
            label: resolveI18n(jsonField.field.label, t, content),
            value: `${displayValue}${fieldUnit}`,
          })
        }
      } catch {
        params.push({
          label: resolveArgDisplayLabel(argFieldByStorageKey, item.key, argFields, t, content),
          value: String(item.value),
        })
      }
      continue
    }

    if (item.value === true && !argField) {
      const parentField = argFields.find(field =>
        field.field.type === 'choice'
        && isFlagChoiceField(field.field)
        && field.field.options.some(option => option.value === item.key))
      if (parentField && parentField.field.type === 'choice' && isFlagChoiceField(parentField.field)) {
        const option = parentField.field.options.find(opt => opt.value === item.key)
        if (option) {
          params.push({
            label: resolveI18n(parentField.field.label, t, content),
            value: resolveI18n(option.label, t, content),
          })
          continue
        }
      }
    }

    if (item.value === true && argField?.field.type === 'switch') {
      params.push({
        label: resolveArgDisplayLabel(argFieldByStorageKey, item.key, argFields, t, content),
        value: '',
      })
      continue
    }

    const isColor = /color/i.test(item.key)
    const isFileParam = argField?.field.type === 'file'
    const unit = argField && 'unit' in argField.field ? ` ${resolveI18n(argField.field.unit, t, content)}` : ''
    params.push({
      label: resolveArgDisplayLabel(argFieldByStorageKey, item.key, argFields, t, content),
      value: `${resolveArgDisplayValue(argFieldByStorageKey, item.key, String(item.value), t, content, autocompleteOptions)}${unit}`,
      color: isColor ? String(item.value) : undefined,
      isFile: isFileParam,
      fileMissing: isFileParam && fileMissingKeys.has(item.key),
    })
  }

  return params
}
