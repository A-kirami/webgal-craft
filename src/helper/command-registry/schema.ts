import { commandType } from 'webgal-parser/src/interface/sceneInterface'

import { StatementEditorSurface } from '~/helper/statement-editor/surface-context'

import type { ComposerTranslation } from 'vue-i18n'
import type { ISentence } from 'webgal-parser/src/interface/sceneInterface'

// ─── 共享基础设施（不变） ─────────────────────────

export const EDITOR_DYNAMIC_OPTIONS_KEYS = [
  'animationTableEntries',
  'figureMotions',
  'figureExpressions',
] as const

export type EditorDynamicOptionsKey = (typeof EDITOR_DYNAMIC_OPTIONS_KEYS)[number]

export interface DynamicOptionsContext {
  content: string
  gamePath: string
}

export interface DynamicOptionsResult {
  options: { label: string, value: string }[]
  loading: boolean
}

export type I18nT = ComposerTranslation

export type CommandCategory = 'perform' | 'effect' | 'display' | 'scene' | 'system' | 'comment'

export interface FileFieldConfig {
  assetType: string
  extensions: string[]
  title: I18nLike
  exclude?: string[]
}

export const UNSPECIFIED = '__unspecified__'
export const CUSTOM_CONTENT = '__custom__'

// ─── I18nLike：简化 i18n 声明 ─────────────────────

export type I18nLike = string | ((t: I18nT, content?: string) => string)

export function resolveI18n(value: I18nLike | undefined, t: I18nT, content?: string): string {
  if (!value) {
    return ''
  }
  if (typeof value === 'string') {
    return value
  }
  return value(t, content)
}

// ─── SurfaceAware：按 surface 选择控件变体 ────────

export type SurfaceAware<V extends string> = V | { inline?: V, panel?: V }

export type InlineLayout = 'default' | 'standalone'

// ─── FieldDef 判别联合 ───────────────────────────

interface FieldBase {
  key: string
  label: I18nLike
  inlineLayout?: InlineLayout
  visibleWhen?: { key: string, value?: string | boolean, notEmpty?: boolean, empty?: boolean }
  visibleWhenContent?: (content: string) => boolean
  advanced?: boolean
  managedByEffectEditor?: boolean
  /** 布局提示：自定义 CSS class */
  className?: string
  /** 效果编辑器分组标识（如 'transform'、'effects'、'colorAdjustment'） */
  effectGroup?: string
}

interface NumericMixin {
  min?: number
  max?: number
  unit?: I18nLike
  scrubbable?: boolean
  scrubStep?: number
  scrubStepShift?: number
  scrubStepAlt?: number
}

interface OptionsMixin {
  options: { label: I18nLike, value: string }[]
}

export interface TextField extends FieldBase {
  type: 'text'
  placeholder?: I18nLike
  defaultValue?: string
  variant?: SurfaceAware<'input' | 'textarea-auto' | 'textarea-grow'>
  /** 仅在 variant 解析为 input 时生效：输入框宽度随内容增长 */
  inputAutoWidth?: boolean
}

export interface SwitchField extends FieldBase {
  type: 'switch'
  defaultValue?: boolean
  /** content switch 专用：开启时的值 */
  onValue?: string
  /** content switch 专用：关闭时的值 */
  offValue?: string
  /** content switch 专用：关闭状态标签 */
  offLabel?: I18nLike
}

export interface NumberField extends FieldBase, NumericMixin {
  type: 'number'
  defaultValue?: number
  placeholder?: I18nLike
  variant?: SurfaceAware<'input' | 'input-with-unit' | 'slider-input'>
  /** 仅在 variant 解析为 input 时生效：输入框宽度随内容增长 */
  inputAutoWidth?: boolean
  /** 面板专用控件类型（例如 x/y 联动拖拽面板） */
  panelWidget?: 'xy-pad'
  /** 与当前字段配对的字段 key（json-object 子字段可写相对子 key） */
  panelPairKey?: string
  /** slider 中心吸附值（用于效果编辑器 center-snap 交互） */
  center?: number
  /** 联动轴配对字段 key（用于效果编辑器 linked-slider） */
  linkedPairKey?: string
  /** 联动滑块组的通用标签（如 "缩放"），仅在 primary 端设置 */
  linkedGroupLabel?: I18nLike
  /** slider 步进值 */
  step?: number
}

export interface ValueChoiceField extends FieldBase, OptionsMixin {
  type: 'choice'
  mode?: 'value'
  defaultValue?: string
  placeholder?: I18nLike
  dynamicOptionsKey?: EditorDynamicOptionsKey
  customizable?: boolean
  customLabel?: I18nLike
  variant?: SurfaceAware<'select' | 'segmented' | 'combobox'>
}

export interface FlagChoiceField extends FieldBase, OptionsMixin {
  type: 'choice'
  mode: 'flag'
  defaultValue?: string
  placeholder?: I18nLike
  variant?: SurfaceAware<'select' | 'segmented'>
  dynamicOptionsKey?: never
  customizable?: never
  customLabel?: never
}

export type ChoiceField = ValueChoiceField | FlagChoiceField

export function isFlagChoiceField(field: ChoiceField): field is FlagChoiceField {
  return field.mode === 'flag'
}

export interface FileField extends FieldBase {
  type: 'file'
  fileConfig: FileFieldConfig
}

export interface ColorField extends FieldBase {
  type: 'color'
  defaultValue?: string
  /** 效果编辑器 RGB 三通道路径（用于 color picker 控件） */
  colorPaths?: [string, string, string]
  /** 效果编辑器 RGB 三通道默认值 */
  colorDefaults?: [number, number, number]
}

export interface DialField extends FieldBase {
  type: 'dial'
  defaultValue?: number
  dialUnit: 'rad' | 'deg'
  compact?: boolean
}

export interface JsonObjectField extends FieldBase {
  type: 'json-object'
  fields: Exclude<FieldDef, JsonObjectField>[]
}

export type FieldDef =
  | TextField | SwitchField
  | NumberField
  | ChoiceField
  | FileField | ColorField
  | DialField
  | JsonObjectField

// ─── CommandFieldDef：统一字段 = 存储位置 + 控件定义 ─

export type CommandFieldStorage = 'content' | 'commandRaw' | { arg: string }

export interface CommandFieldDef {
  storage: CommandFieldStorage
  field: FieldDef
}

/** 工厂函数：content 字段 */
export function content(field: FieldDef): CommandFieldDef {
  return { storage: 'content', field }
}

/** 工厂函数：commandRaw 字段 */
export function commandRaw(field: Omit<TextField, 'type'> & { type?: 'text' }): CommandFieldDef {
  return { storage: 'commandRaw', field: { type: 'text', ...field } as FieldDef }
}

/** 工厂函数：arg 字段 */
export function arg(field: FieldDef): CommandFieldDef {
  return { storage: { arg: field.key }, field }
}

// ─── ArgField：展平后的 arg 字段（直连消费） ─────

/** json-object 子字段的元信息 */
export interface ArgFieldJsonMeta {
  argKey: string
  fieldKey: string
}

/** 展平后的 arg 字段，供 ParamRenderer / useStatementEditor 直接消费 */
export interface ArgField {
  /** 句子 args 数组中的 key（json-object 子字段为父级 argKey） */
  storageKey: string
  /** 字段定义（json-object 已展平为子字段） */
  field: Exclude<FieldDef, JsonObjectField>
  /** json-object 子字段元信息 */
  jsonMeta?: ArgFieldJsonMeta
}

interface EditorFieldBase {
  key: string
  field: Exclude<FieldDef, JsonObjectField>
}

export interface ContentEditorField extends EditorFieldBase {
  storage: 'content'
}

export interface CommandRawEditorField extends EditorFieldBase {
  storage: 'commandRaw'
}

export interface ArgEditorField extends EditorFieldBase {
  storage: 'arg'
  /** arg 分支专用：供参数读写工具复用的元信息 */
  argField: ArgField
}

/** 编辑器统一渲染字段（content / commandRaw / arg） */
export type EditorField = ContentEditorField | CommandRawEditorField | ArgEditorField

/** 从 CommandEntry 提取 content 字段的 FieldDef */
export function readContentField(entry: CommandEntry): FieldDef | undefined {
  return entry.fields.find(f => f.storage === 'content')?.field
}

function normalizeFlattenedJsonSubField(
  argKey: string,
  parentField: JsonObjectField,
  subField: Exclude<FieldDef, JsonObjectField>,
): Exclude<FieldDef, JsonObjectField> {
  const flattenedField: Exclude<FieldDef, JsonObjectField> = {
    ...subField,
    key: `${argKey}.${subField.key}`,
    visibleWhen: subField.visibleWhen ?? parentField.visibleWhen,
    visibleWhenContent: subField.visibleWhenContent ?? parentField.visibleWhenContent,
    advanced: subField.advanced ?? parentField.advanced,
    managedByEffectEditor: subField.managedByEffectEditor ?? parentField.managedByEffectEditor,
  }

  if (
    flattenedField.type === 'number'
    && flattenedField.panelPairKey
    && !flattenedField.panelPairKey.includes('.')
  ) {
    flattenedField.panelPairKey = `${argKey}.${flattenedField.panelPairKey}`
  }

  return flattenedField
}

function getStorageArgKey(storage: CommandFieldStorage): string | undefined {
  return typeof storage === 'object' ? storage.arg : undefined
}

/** 从 CommandEntry 提取并展平所有 arg 字段 */
export function readArgFields(entry: CommandEntry): ArgField[] {
  const result: ArgField[] = []
  for (const { storage, field } of entry.fields) {
    const argKey = getStorageArgKey(storage)
    if (!argKey) {
      continue
    }
    if (field.type === 'json-object') {
      for (const sub of field.fields) {
        const flattenedField = normalizeFlattenedJsonSubField(argKey, field, sub)
        result.push({
          storageKey: argKey,
          field: flattenedField,
          jsonMeta: { argKey, fieldKey: sub.key },
        })
      }
    } else {
      result.push({ storageKey: argKey, field })
    }
  }
  return result
}

/** 从 CommandEntry 提取统一渲染字段（content / commandRaw / arg） */
export function readEditorFields(entry: CommandEntry): EditorField[] {
  const result: EditorField[] = []
  for (const { storage, field } of entry.fields) {
    if (storage === 'content') {
      if (field.type !== 'json-object') {
        result.push({
          key: 'content',
          storage: 'content',
          field,
        })
      }
      continue
    }

    if (storage === 'commandRaw') {
      if (field.type !== 'json-object') {
        result.push({
          key: 'commandRaw',
          storage: 'commandRaw',
          field,
        })
      }
      continue
    }

    const argKey = getStorageArgKey(storage)
    if (!argKey) {
      continue
    }
    if (field.type === 'json-object') {
      for (const sub of field.fields) {
        const flattenedField = normalizeFlattenedJsonSubField(argKey, field, sub)
        result.push({
          key: flattenedField.key,
          storage: 'arg',
          field: flattenedField,
          argField: {
            storageKey: argKey,
            field: flattenedField,
            jsonMeta: { argKey, fieldKey: sub.key },
          },
        })
      }
      continue
    }

    result.push({
      key: field.key,
      storage: 'arg',
      field,
      argField: { storageKey: argKey, field },
    })
  }
  return result
}

/** 从已展平的 EditorField[] 中提取 arg 字段，避免重复遍历 CommandEntry */
export function deriveArgFieldsFromEditorFields(editorFields: EditorField[]): ArgField[] {
  return editorFields
    .filter((f): f is ArgEditorField => f.storage === 'arg')
    .map(f => f.argField)
}

/** 获取 ArgField 的存储 key（用于 args 数组查找） */
export function readArgFieldStorageKey(argField: ArgField): string {
  return argField.storageKey
}

/** 解析 SurfaceAware 值 */
export function resolveSurfaceVariant<V extends string>(
  variant: SurfaceAware<V> | undefined,
  surface: StatementEditorSurface,
  fallback: V,
): V {
  if (!variant) {
    return fallback
  }
  if (typeof variant === 'string') {
    return variant
  }
  return variant[surface] ?? fallback
}

// ─── CommandEntry：统一命令注册条目 ──────────────

export interface CommandEntry {
  type: commandType
  label: I18nLike
  description: I18nLike
  icon: string
  category: CommandCategory
  fields: CommandFieldDef[]
  hasEffectEditor?: boolean
  hasAnimationEditor?: boolean
  locked?: boolean
}

// ─── 其他工具函数 ────────────────────────────────

export type StatementSpecialContentMode = 'applyStyle' | 'choose' | 'setVar'

export function resolveStatementSpecialContentMode(
  sentence?: Pick<ISentence, 'command'>,
): StatementSpecialContentMode | undefined {
  if (!sentence) {
    return
  }
  if (sentence.command === commandType.setVar) {
    return 'setVar'
  }
  if (sentence.command === commandType.choose) {
    return 'choose'
  }
  if (sentence.command === commandType.applyStyle) {
    return 'applyStyle'
  }
}

export interface DynamicOptionSourceDef {
  key: EditorDynamicOptionsKey
  resolveCacheKey: (ctx: DynamicOptionsContext) => string | undefined
  loadOptions: (ctx: DynamicOptionsContext) => Promise<{ label: string, value: string }[]>
  /** 判断文件路径变更是否应触发该 source 的缓存失效 */
  invalidateByFileModified?: (path: string) => boolean
}
